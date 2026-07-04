import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";
import { getFolderIdForClassification } from "@/server/services/category-folders";
import { learnFromMove } from "@/server/services/learning";

export const dynamic = "force-dynamic";

const CLASSIFICATIONS = [
  "important",
  "fyi",
  "newsletter",
  "marketing",
  "receipt",
  "automated_notification",
] as const;

const schema = z.object({ classification: z.enum(CLASSIFICATIONS) });

/**
 * POST /api/emails/:emailMetadataId/move — move a single email to a different
 * category (a manual correction of the AI). Re-files the email, adjusts the
 * Review queue, and LEARNS from the correction (per-sender rule + AI feedback).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ emailMetadataId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { emailMetadataId } = await params;
    const { classification } = schema.parse(await req.json());

    const email = await prisma.emailMetadata.findFirst({
      where: { id: emailMetadataId, userAccountId: user.id },
      include: { reviewQueueItem: true, triageDecision: true },
    });
    if (!email) throw new HttpError(404, "Email not found");

    const toImportant = classification === "important";
    const categoryFolderId = toImportant
      ? null
      : await getFolderIdForClassification(user.id, classification);

    await prisma.$transaction(async (tx) => {
      // Re-file the email. A manual move also clears the low-confidence flag
      // (the user has now confirmed the category) and un-archives it.
      await tx.emailMetadata.update({
        where: { id: email.id },
        data: {
          categoryFolderId,
          isImportant: toImportant,
          isFlaggedLowConfidence: false,
          isArchived: false,
        },
      });

      // Reflect the correction in the recorded decision's final category.
      if (email.triageDecision) {
        await tx.triageDecision.update({
          where: { emailMetadataId: email.id },
          data: { finalCategory: classification },
        });
      }

      // Review queue: important items belong in the queue; everything else leaves it.
      if (toImportant) {
        const score = email.triageDecision
          ? Number(email.triageDecision.confidenceScore)
          : 0.8;
        if (email.reviewQueueItem) {
          await tx.reviewQueueItem.update({
            where: { id: email.reviewQueueItem.id },
            data: { status: "pending", clearedAt: null, importanceScore: score },
          });
        } else {
          await tx.reviewQueueItem.create({
            data: {
              userAccountId: user.id,
              emailMetadataId: email.id,
              importanceScore: score,
              status: "pending",
            },
          });
        }
      } else if (email.reviewQueueItem) {
        await tx.reviewQueueItem.update({
          where: { id: email.reviewQueueItem.id },
          data: { status: "done", clearedAt: new Date() },
        });
      }
    });

    // Learn from the correction: instant per-sender rule (+ AI feedback signal).
    const learned = await learnFromMove(user.id, email.senderEmail, classification);

    await track(
      "email_moved",
      { to: classification, learned_rule: learned.created ? "created" : "updated" },
      user.id,
    );

    return json({
      ok: true,
      movedTo: classification,
      learnedRule: learned,
    });
  });
}

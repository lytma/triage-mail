import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireRealUser, HttpError } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { parseRule } from "@/server/services/rules-engine";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  plainEnglishText: z.string().min(3).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  targetClassification: z
    .enum(["important", "fyi", "newsletter", "marketing", "receipt", "automated_notification"])
    .optional(),
});

/** PATCH /api/triage-rules/:ruleId — edit text/target, toggle active, reorder. */
export async function PATCH(req: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  return handle(async () => {
    const user = await requireRealUser();
    const { ruleId } = await params;
    const input = patchSchema.parse(await req.json());

    const rule = await prisma.triageRule.findFirst({
      where: { id: ruleId, userAccountId: user.id },
    });
    if (!rule) throw new HttpError(404, "Not found");

    const data: Record<string, unknown> = {};
    if (input.isActive != null) data.isActive = input.isActive;
    if (input.priority != null) data.priority = input.priority;
    if (input.targetClassification) data.targetClassification = input.targetClassification;
    if (input.plainEnglishText) {
      data.plainEnglishText = input.plainEnglishText;
      const target = input.targetClassification ?? rule.targetClassification;
      const { parsedConditions, summary } = await parseRule(input.plainEnglishText, target);
      data.parsedConditions = { ...parsedConditions, summary };
    }

    const updated = await prisma.triageRule.update({ where: { id: rule.id }, data });
    return json({
      id: updated.id,
      plainEnglishText: updated.plainEnglishText,
      parsedConditions: updated.parsedConditions,
      summary: (updated.parsedConditions as { summary?: string })?.summary ?? null,
      isActive: updated.isActive,
      priority: updated.priority,
      targetClassification: updated.targetClassification,
    });
  });
}

/** DELETE /api/triage-rules/:ruleId */
export async function DELETE(_req: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  return handle(async () => {
    const user = await requireRealUser();
    const { ruleId } = await params;
    const rule = await prisma.triageRule.findFirst({
      where: { id: ruleId, userAccountId: user.id },
    });
    if (!rule) throw new HttpError(404, "Not found");
    await prisma.triageRule.delete({ where: { id: rule.id } });
    return json({ success: true });
  });
}

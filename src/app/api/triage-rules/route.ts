import { z } from "zod";
import { handle, json } from "@/server/lib/http";
import { requireRealUser } from "@/server/lib/session";
import { prisma } from "@/server/db/prisma";
import { track } from "@/server/lib/analytics";
import { parseRule } from "@/server/services/rules-engine";

export const dynamic = "force-dynamic";

const CLASSIFICATIONS = [
  "important",
  "fyi",
  "newsletter",
  "marketing",
  "receipt",
  "automated_notification",
] as const;

/** GET /api/triage-rules — list rules ordered by priority desc. */
export async function GET() {
  return handle(async () => {
    const user = await requireRealUser();
    const rules = await prisma.triageRule.findMany({
      where: { userAccountId: user.id },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return json({
      rules: rules.map((r) => ({
        id: r.id,
        plainEnglishText: r.plainEnglishText,
        parsedConditions: r.parsedConditions,
        summary: (r.parsedConditions as { summary?: string })?.summary ?? null,
        targetClassification: r.targetClassification,
        targetCategoryFolderId: r.targetCategoryFolderId,
        isActive: r.isActive,
        priority: r.priority,
        createdAt: r.createdAt,
      })),
    });
  });
}

const createSchema = z.object({
  plainEnglishText: z.string().min(3),
  targetClassification: z.enum(CLASSIFICATIONS),
  targetCategoryFolderId: z.string().uuid().optional().nullable(),
  priority: z.number().int().optional(),
});

/** POST /api/triage-rules — create a rule (LLM-assisted parse). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireRealUser();
    const input = createSchema.parse(await req.json());

    const { parsedConditions, summary } = await parseRule(
      input.plainEnglishText,
      input.targetClassification,
    );

    // Default priority to top of the list.
    let priority = input.priority;
    if (priority == null) {
      const max = await prisma.triageRule.aggregate({
        where: { userAccountId: user.id },
        _max: { priority: true },
      });
      priority = (max._max.priority ?? 0) + 1;
    }

    const rule = await prisma.triageRule.create({
      data: {
        userAccountId: user.id,
        plainEnglishText: input.plainEnglishText,
        parsedConditions: { ...parsedConditions, summary } as object,
        targetClassification: input.targetClassification,
        targetCategoryFolderId: input.targetCategoryFolderId ?? null,
        priority,
        isActive: true,
      },
    });

    const count = await prisma.triageRule.count({ where: { userAccountId: user.id } });
    await track("rule_created", { rule_count: count }, user.id);

    return json(
      {
        id: rule.id,
        plainEnglishText: rule.plainEnglishText,
        parsedConditions: rule.parsedConditions,
        summary,
        targetClassification: rule.targetClassification,
        isActive: rule.isActive,
        priority: rule.priority,
      },
      201,
    );
  });
}

/**
 * Worker tier entry point.
 * A standalone Node.js process (never serves HTTP) that consumes BullMQ jobs:
 * triage, mailbox-action, web-push, sync-back, token-refresh.
 *
 * Concrete processors are registered from src/server/queues/workers/* as each
 * milestone lands. This file wires them up and manages lifecycle.
 */
import "dotenv/config";
import { Worker, Job } from "bullmq";
import { getRedis, QUEUE_NAMES } from "@/server/queues/queues";

const connection = getRedis();

type Processor = (job: Job) => Promise<unknown>;

// Lazy-load processors so the worker still boots if a module is mid-development.
async function loadProcessors(): Promise<Record<string, Processor>> {
  const [triage, mailboxAction, webPush, syncBack, tokenRefresh] = await Promise.all([
    import("@/server/queues/workers/triage").then((m) => m.processTriage).catch(() => noop("triage")),
    import("@/server/queues/workers/mailbox-action").then((m) => m.processMailboxAction).catch(() => noop("mailbox-action")),
    import("@/server/queues/workers/web-push").then((m) => m.processWebPush).catch(() => noop("web-push")),
    import("@/server/queues/workers/sync-back").then((m) => m.processSyncBack).catch(() => noop("sync-back")),
    import("@/server/queues/workers/token-refresh").then((m) => m.processTokenRefresh).catch(() => noop("token-refresh")),
  ]);
  return {
    [QUEUE_NAMES.triage]: triage,
    [QUEUE_NAMES.mailboxAction]: mailboxAction,
    [QUEUE_NAMES.webPush]: webPush,
    [QUEUE_NAMES.syncBack]: syncBack,
    [QUEUE_NAMES.tokenRefresh]: tokenRefresh,
  };
}

function noop(name: string): Processor {
  return async (job: Job) => {
    console.warn(`[worker:${name}] no processor registered yet, acking job ${job.id}`);
    return { skipped: true };
  };
}

const CONCURRENCY: Record<string, number> = {
  [QUEUE_NAMES.triage]: 5,
  [QUEUE_NAMES.mailboxAction]: 5,
  [QUEUE_NAMES.webPush]: 10,
  [QUEUE_NAMES.syncBack]: 2,
  [QUEUE_NAMES.tokenRefresh]: 3,
};

async function main() {
  console.log("[worker] starting Triage Mail worker tier…");
  const processors = await loadProcessors();
  const workers: Worker[] = [];

  for (const name of Object.values(QUEUE_NAMES)) {
    const w = new Worker(name, async (job) => processors[name](job), {
      connection,
      concurrency: CONCURRENCY[name] ?? 3,
    });
    w.on("completed", (job) => console.log(`[worker:${name}] completed ${job.id}`));
    w.on("failed", (job, err) =>
      console.error(`[worker:${name}] failed ${job?.id}: ${err?.message}`),
    );
    workers.push(w);
    console.log(`[worker] registered queue "${name}" (concurrency ${CONCURRENCY[name] ?? 3})`);
  }

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("[worker] ready ✔");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});

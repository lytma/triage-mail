import { Queue, QueueOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/server/lib/env";

/**
 * Shared Redis connection + BullMQ queue definitions.
 * The web tier only ENQUEUES jobs here; the worker tier consumes them.
 */

let connection: IORedis | null = null;

export function getRedis(): IORedis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    connection.on("error", (err) => {
      // Avoid crashing the web process if Redis is briefly unavailable.
      console.error("[redis] connection error:", err.message);
    });
  }
  return connection;
}

export const QUEUE_NAMES = {
  triage: "triage",
  mailboxAction: "mailbox-action",
  webPush: "web-push",
  syncBack: "sync-back",
  tokenRefresh: "token-refresh",
} as const;

const defaultOpts = (): QueueOptions => ({
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

// ---------- Job payload types ----------

export interface TriageJobData {
  userAccountId: string;
  connectedMailboxId: string;
  providerMessageId: string;
  /** Optional inline mock message for stub/testing without a provider call. */
  mock?: {
    senderEmail: string;
    senderName?: string;
    subject?: string;
    snippet?: string;
    receivedAt?: string;
    threadId?: string;
    hasAttachments?: boolean;
  };
}

export interface MailboxActionJobData {
  userAccountId: string;
  connectedMailboxId: string;
  action: "archive" | "send" | "reply" | "forward";
  emailMetadataId?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  payload?: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    inReplyTo?: string;
  };
}

export interface WebPushJobData {
  userAccountId: string;
  title: string;
  body: string;
  url?: string;
}

export interface SyncBackJobData {
  connectedMailboxId: string;
}

export interface TokenRefreshJobData {
  connectedMailboxId: string;
}

// ---------- Queue singletons ----------

const globalForQueues = globalThis as unknown as {
  __queues?: Record<string, Queue>;
};

function queue<T>(name: string): Queue<T> {
  globalForQueues.__queues ??= {};
  if (!globalForQueues.__queues[name]) {
    globalForQueues.__queues[name] = new Queue(name, defaultOpts());
  }
  return globalForQueues.__queues[name] as Queue<T>;
}

export const triageQueue = () => queue<TriageJobData>(QUEUE_NAMES.triage);
export const mailboxActionQueue = () =>
  queue<MailboxActionJobData>(QUEUE_NAMES.mailboxAction);
export const webPushQueue = () => queue<WebPushJobData>(QUEUE_NAMES.webPush);
export const syncBackQueue = () => queue<SyncBackJobData>(QUEUE_NAMES.syncBack);
export const tokenRefreshQueue = () =>
  queue<TokenRefreshJobData>(QUEUE_NAMES.tokenRefresh);

import type { ConnectedMailbox } from "@prisma/client";

/**
 * Provider adapter contract for Gmail / Outlook.
 *
 * Bodies and snippets returned here are used TRANSIENTLY for triage
 * (fed to the LLM classifier) and are NEVER persisted — only metadata lands
 * in the database.
 */

export interface ProviderMessage {
  providerMessageId: string;
  threadId?: string;
  senderEmail: string;
  senderName?: string;
  subject?: string;
  /** Short preview text — transient, never stored. */
  snippet?: string;
  receivedAt: Date;
  hasAttachments: boolean;
  headers?: Record<string, string>;
}

export interface ProviderMessageSummary {
  providerMessageId: string;
  threadId?: string;
  receivedAt?: Date;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  inReplyTo?: string;
  threadId?: string;
}

export interface ProviderAdapter {
  fetchMessage(
    mailbox: ConnectedMailbox,
    providerMessageId: string,
  ): Promise<ProviderMessage>;

  sendMessage(
    mailbox: ConnectedMailbox,
    input: SendMessageInput,
  ): Promise<{ id: string }>;

  archiveMessage(
    mailbox: ConnectedMailbox,
    providerMessageId: string,
  ): Promise<void>;

  listRecentMessages(
    mailbox: ConnectedMailbox,
    sinceCursor?: string,
  ): Promise<{ messages: ProviderMessageSummary[]; cursor: string }>;
}

/** A placeholder / missing token means we must operate in stub mode. */
export function isPlaceholderToken(token: string | null | undefined): boolean {
  if (!token) return true;
  const t = token.trim();
  if (t.length === 0) return true;
  const lowered = t.toLowerCase();
  return (
    lowered.includes("placeholder") ||
    lowered.includes("stub") ||
    lowered.startsWith("dev-") ||
    lowered === "changeme"
  );
}

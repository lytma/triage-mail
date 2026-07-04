import type { ConnectedMailbox } from "@prisma/client";
import { decryptToken } from "@/server/lib/crypto";
import { detectImapSettings } from "@/server/lib/imap-config";
import {
  isPlaceholderToken,
  type ProviderAdapter,
  type ProviderMessage,
  type ProviderMessageSummary,
  type SendMessageInput,
} from "./types";

/**
 * IMAP adapter for app-specific-password mailboxes (iCloud, Yahoo, Fastmail…).
 *
 * Auth is an app-specific password (stored encrypted in
 * `oauthRefreshTokenEncrypted`, reused for all providers) plus IMAP/SMTP server
 * settings auto-detected from the email domain. Like the Gmail/Outlook
 * adapters, every method first checks a STUB condition so the preview boots and
 * runs with placeholder credentials; the real IMAP (imapflow) and SMTP
 * (nodemailer) paths are written but only execute with a real password.
 */

function appPassword(mailbox: ConnectedMailbox): string {
  return decryptToken(mailbox.oauthRefreshTokenEncrypted ?? "");
}

function stubMode(mailbox: ConnectedMailbox): boolean {
  return isPlaceholderToken(appPassword(mailbox));
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

function synthMessage(
  mailbox: ConnectedMailbox,
  providerMessageId: string,
): ProviderMessage {
  return {
    providerMessageId,
    threadId: `thread-${providerMessageId}`,
    senderEmail: `sender@${mailbox.emailAddress.split("@")[1] ?? "example.com"}`,
    senderName: "Stub Sender",
    subject: `Stub subject for ${providerMessageId}`,
    snippet: "Stub snippet — not persisted.",
    receivedAt: new Date(),
    hasAttachments: false,
    headers: {},
  };
}

// ---------- Real-mode helpers (guarded; never run without a real password) ----------

interface ImapFlowLike {
  connect(): Promise<void>;
  logout(): Promise<void>;
  getMailboxLock(name: string): Promise<{ release(): void }>;
  fetchOne(seq: string, query: object, opts?: object): Promise<unknown>;
  fetch(range: string | object, query: object, opts?: object): AsyncIterable<unknown>;
  search(query: object, opts?: object): Promise<number[]>;
  messageMove(range: string | object, dest: string, opts?: object): Promise<unknown>;
  mailboxOpen(name: string): Promise<unknown>;
  list?(): Promise<{ path: string; specialUse?: string }[]>;
}

async function connectImap(mailbox: ConnectedMailbox): Promise<ImapFlowLike> {
  const { ImapFlow } = await import("imapflow");
  const settings = detectImapSettings(mailbox.emailAddress);
  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    auth: { user: mailbox.emailAddress, pass: appPassword(mailbox) },
    logger: false,
  }) as unknown as ImapFlowLike;
  await client.connect();
  return client;
}

interface ImapEnvelope {
  from?: { address?: string; name?: string }[];
  subject?: string;
  date?: string | Date;
  messageId?: string;
  inReplyTo?: string;
}

function parseEnvelope(
  uid: number,
  msg: {
    envelope?: ImapEnvelope;
    internalDate?: Date;
    headers?: Buffer | string;
    bodyStructure?: { childNodes?: unknown[] };
  },
): ProviderMessage {
  const env = msg.envelope ?? {};
  const from = env.from?.[0];
  const headers = parseRawHeaders(msg.headers);
  return {
    providerMessageId: String(uid),
    threadId: env.inReplyTo || undefined,
    senderEmail: (from?.address ?? "unknown@unknown").toLowerCase(),
    senderName: from?.name || undefined,
    subject: env.subject || undefined,
    receivedAt: env.date ? new Date(env.date) : msg.internalDate ?? new Date(),
    hasAttachments: Boolean(msg.bodyStructure?.childNodes?.length),
    headers,
  };
}

/** Parse a raw header block (Buffer/string) into a lowercased header map. */
function parseRawHeaders(raw: Buffer | string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  // Unfold continuation lines, then split on the first colon.
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

/**
 * Verify an app-specific password by opening an IMAP connection. Returns
 * `{ ok: true }` on success. A placeholder/empty password (preview stub mode)
 * short-circuits to success so the connect flow works without real creds.
 */
export async function verifyImapCredentials(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (isPlaceholderToken(password)) return { ok: true };
  try {
    const { ImapFlow } = await import("imapflow");
    const settings = detectImapSettings(email);
    const client = new ImapFlow({
      host: settings.imapHost,
      port: settings.imapPort,
      secure: settings.imapSecure,
      auth: { user: email, pass: password },
      logger: false,
    });
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export const imapAdapter: ProviderAdapter = {
  async fetchMessage(mailbox, providerMessageId) {
    if (stubMode(mailbox)) {
      console.log(`[imap:stub] fetchMessage ${providerMessageId}`);
      return synthMessage(mailbox, providerMessageId);
    }
    const client = await connectImap(mailbox);
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = (await client.fetchOne(
        providerMessageId,
        {
          uid: true,
          envelope: true,
          internalDate: true,
          bodyStructure: true,
          headers: ["list-unsubscribe", "list-unsubscribe-post", "message-id"],
        },
        { uid: true },
      )) as Parameters<typeof parseEnvelope>[1] | false;
      if (!msg) throw new Error(`IMAP message ${providerMessageId} not found`);
      return parseEnvelope(Number(providerMessageId), msg);
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }
  },

  async sendMessage(mailbox, input) {
    if (stubMode(mailbox)) {
      const id = randomId("stub-sent");
      console.log(`[imap:stub] sendMessage -> ${id} (to=${input.to.join(",")})`);
      return { id };
    }
    const nodemailer = await import("nodemailer");
    const settings = detectImapSettings(mailbox.emailAddress);
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: { user: mailbox.emailAddress, pass: appPassword(mailbox) },
    });
    const info = await transport.sendMail({
      from: mailbox.emailAddress,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: input.body,
      inReplyTo: input.inReplyTo,
      references: input.inReplyTo,
    });
    return { id: info.messageId ?? randomId("sent") };
  },

  async archiveMessage(mailbox, providerMessageId) {
    if (stubMode(mailbox)) {
      console.log(`[imap:stub] archive ${providerMessageId}`);
      return;
    }
    const client = await connectImap(mailbox);
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Move to the special-use \Archive mailbox when present, else "Archive".
      let dest = "Archive";
      const boxes = (await client.list?.()) ?? [];
      const archiveBox = boxes.find((b) => b.specialUse === "\\Archive");
      if (archiveBox) dest = archiveBox.path;
      await client.messageMove(providerMessageId, dest, { uid: true });
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }
  },

  async listRecentMessages(mailbox, sinceCursor) {
    if (stubMode(mailbox)) {
      console.log(`[imap:stub] listRecentMessages (cursor=${sinceCursor ?? "none"})`);
      return { messages: [], cursor: sinceCursor ?? "" };
    }
    const client = await connectImap(mailbox);
    const lock = await client.getMailboxLock("INBOX");
    try {
      const messages: ProviderMessageSummary[] = [];
      let query: object;
      if (sinceCursor) {
        // UIDs strictly greater than the last-seen UID.
        query = { uid: `${Number(sinceCursor) + 1}:*` };
      } else {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        query = { since };
      }
      const uids = await client.search(query, { uid: true });
      let maxUid = sinceCursor ? Number(sinceCursor) : 0;
      for (const uid of uids) {
        // `${n+1}:*` always returns at least the highest message; skip the cursor itself.
        if (sinceCursor && uid <= Number(sinceCursor)) continue;
        messages.push({ providerMessageId: String(uid) });
        if (uid > maxUid) maxUid = uid;
      }
      return { messages, cursor: maxUid ? String(maxUid) : sinceCursor ?? "" };
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }
  },
};

import type { ConnectedMailbox } from "@prisma/client";
import { env } from "@/server/lib/env";
import { decryptToken } from "@/server/lib/crypto";
import {
  isPlaceholderToken,
  type ProviderAdapter,
  type ProviderMessage,
  type ProviderMessageSummary,
  type SendMessageInput,
} from "./types";

/**
 * Gmail adapter.
 *
 * Preview runs with placeholder/no OAuth creds, so every method first checks a
 * STUB condition. Real Gmail API code paths are written (users.messages.get /
 * send / modify, history-based listing) but guarded so they never execute
 * without real client creds AND a real refresh token.
 */

function stubMode(mailbox: ConnectedMailbox): boolean {
  const noClientCreds = !env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET;
  if (noClientCreds) return true;
  const refresh = decryptToken(mailbox.oauthRefreshTokenEncrypted ?? "");
  return isPlaceholderToken(refresh);
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Synthesize a deterministic-ish ProviderMessage from an id (stub mode). */
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

// ---------- Real-mode helpers (guarded; never run without creds) ----------

async function getRealClient(mailbox: ConnectedMailbox) {
  // Imported lazily so the module loads even if googleapis is heavy/absent.
  const { google } = await import("googleapis");
  const oauth2 = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  const refreshToken = decryptToken(mailbox.oauthRefreshTokenEncrypted ?? "");
  const accessToken = mailbox.oauthAccessTokenEncrypted
    ? decryptToken(mailbox.oauthAccessTokenEncrypted)
    : undefined;
  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
  });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function headerMap(
  headers: { name?: string | null; value?: string | null }[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name) out[h.name.toLowerCase()] = h.value ?? "";
  }
  return out;
}

function parseFrom(from: string | undefined): {
  senderEmail: string;
  senderName?: string;
} {
  if (!from) return { senderEmail: "unknown@unknown" };
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      senderName: match[1].trim() || undefined,
      senderEmail: match[2].trim().toLowerCase(),
    };
  }
  return { senderEmail: from.trim().toLowerCase() };
}

function buildRfc822(input: SendMessageInput, from: string): string {
  const lines: string[] = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${input.to.join(", ")}`);
  if (input.cc?.length) lines.push(`Cc: ${input.cc.join(", ")}`);
  if (input.bcc?.length) lines.push(`Bcc: ${input.bcc.join(", ")}`);
  if (input.subject) lines.push(`Subject: ${input.subject}`);
  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${input.inReplyTo}`);
    lines.push(`References: ${input.inReplyTo}`);
  }
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("MIME-Version: 1.0");
  lines.push("");
  lines.push(input.body ?? "");
  return lines.join("\r\n");
}

export const gmailAdapter: ProviderAdapter = {
  async fetchMessage(mailbox, providerMessageId) {
    if (stubMode(mailbox)) {
      console.log(`[gmail:stub] fetchMessage ${providerMessageId}`);
      return synthMessage(mailbox, providerMessageId);
    }
    const gmail = await getRealClient(mailbox);
    const res = await gmail.users.messages.get({
      userId: "me",
      id: providerMessageId,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date", "Message-ID"],
    });
    const msg = res.data;
    const headers = headerMap(msg.payload?.headers ?? undefined);
    const { senderEmail, senderName } = parseFrom(headers["from"]);
    const receivedAt = msg.internalDate
      ? new Date(Number(msg.internalDate))
      : new Date();
    return {
      providerMessageId,
      threadId: msg.threadId ?? undefined,
      senderEmail,
      senderName,
      subject: headers["subject"],
      snippet: msg.snippet ?? undefined,
      receivedAt,
      hasAttachments: Boolean(
        msg.payload?.parts?.some((p) => p.filename && p.filename.length > 0),
      ),
      headers,
    };
  },

  async sendMessage(mailbox, input) {
    if (stubMode(mailbox)) {
      const id = randomId("stub-sent");
      console.log(`[gmail:stub] sendMessage -> ${id} (to=${input.to.join(",")})`);
      return { id };
    }
    const gmail = await getRealClient(mailbox);
    const raw = Buffer.from(buildRfc822(input, mailbox.emailAddress))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: input.threadId },
    });
    return { id: res.data.id ?? randomId("sent") };
  },

  async archiveMessage(mailbox, providerMessageId) {
    if (stubMode(mailbox)) {
      console.log(`[gmail:stub] archive ${providerMessageId}`);
      return;
    }
    const gmail = await getRealClient(mailbox);
    await gmail.users.messages.modify({
      userId: "me",
      id: providerMessageId,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
  },

  async listRecentMessages(mailbox, sinceCursor) {
    if (stubMode(mailbox)) {
      console.log(`[gmail:stub] listRecentMessages (cursor=${sinceCursor ?? "none"})`);
      return { messages: [], cursor: sinceCursor ?? "" };
    }
    const gmail = await getRealClient(mailbox);
    const messages: ProviderMessageSummary[] = [];
    let cursor = sinceCursor ?? "";
    if (sinceCursor) {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId: sinceCursor,
        historyTypes: ["messageAdded"],
      });
      for (const h of res.data.history ?? []) {
        for (const m of h.messagesAdded ?? []) {
          if (m.message?.id) {
            messages.push({
              providerMessageId: m.message.id,
              threadId: m.message.threadId ?? undefined,
            });
          }
        }
      }
      cursor = res.data.historyId ?? cursor;
    } else {
      const res = await gmail.users.messages.list({
        userId: "me",
        maxResults: 25,
        q: "in:inbox newer_than:30d",
      });
      for (const m of res.data.messages ?? []) {
        if (m.id) {
          messages.push({
            providerMessageId: m.id,
            threadId: m.threadId ?? undefined,
          });
        }
      }
      const profile = await gmail.users.getProfile({ userId: "me" });
      cursor = profile.data.historyId ?? cursor;
    }
    return { messages, cursor };
  },
};

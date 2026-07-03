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
 * Outlook / Microsoft Graph adapter.
 *
 * Preview runs with placeholder/no OAuth creds, so every method first checks a
 * STUB condition. Real Graph code paths are written (/me/messages, /sendMail,
 * move to Archive folder, delta query) but guarded so they never execute
 * without real client creds AND a real refresh token.
 */

function stubMode(mailbox: ConnectedMailbox): boolean {
  const noClientCreds = !env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET;
  if (noClientCreds) return true;
  const refresh = decryptToken(mailbox.oauthRefreshTokenEncrypted ?? "");
  return isPlaceholderToken(refresh);
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

// ---------- Real-mode helpers (guarded; never run without creds) ----------

async function getAccessToken(mailbox: ConnectedMailbox): Promise<string> {
  // Exchange the refresh token for an access token via the MS identity endpoint.
  const refreshToken = decryptToken(mailbox.oauthRefreshTokenEncrypted ?? "");
  const tenant = env.MICROSOFT_TENANT_ID || "common";
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "https://graph.microsoft.com/.default offline_access",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    { method: "POST", body },
  );
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Graph token refresh failed");
  return json.access_token;
}

async function getGraphClient(mailbox: ConnectedMailbox) {
  const { Client } = await import("@microsoft/microsoft-graph-client");
  const accessToken = await getAccessToken(mailbox);
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

function parseGraphMessage(msg: {
  id?: string;
  conversationId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  sender?: { emailAddress?: { address?: string; name?: string } };
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  internetMessageHeaders?: { name: string; value: string }[];
}): ProviderMessage {
  const addr = msg.from?.emailAddress ?? msg.sender?.emailAddress;
  const headers: Record<string, string> = {};
  for (const h of msg.internetMessageHeaders ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }
  return {
    providerMessageId: msg.id ?? "",
    threadId: msg.conversationId,
    senderEmail: (addr?.address ?? "unknown@unknown").toLowerCase(),
    senderName: addr?.name,
    subject: msg.subject,
    snippet: msg.bodyPreview,
    receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
    hasAttachments: Boolean(msg.hasAttachments),
    headers,
  };
}

export const outlookAdapter: ProviderAdapter = {
  async fetchMessage(mailbox, providerMessageId) {
    if (stubMode(mailbox)) {
      console.log(`[outlook:stub] fetchMessage ${providerMessageId}`);
      return synthMessage(mailbox, providerMessageId);
    }
    const client = await getGraphClient(mailbox);
    const msg = await client
      .api(`/me/messages/${providerMessageId}`)
      .select(
        "id,conversationId,from,sender,subject,bodyPreview,receivedDateTime,hasAttachments,internetMessageHeaders",
      )
      .get();
    return parseGraphMessage(msg);
  },

  async sendMessage(mailbox, input) {
    if (stubMode(mailbox)) {
      const id = randomId("stub-sent");
      console.log(`[outlook:stub] sendMessage -> ${id} (to=${input.to.join(",")})`);
      return { id };
    }
    const client = await getGraphClient(mailbox);
    const message = {
      subject: input.subject ?? "",
      body: { contentType: "HTML", content: input.body ?? "" },
      toRecipients: input.to.map((a) => ({ emailAddress: { address: a } })),
      ccRecipients: (input.cc ?? []).map((a) => ({ emailAddress: { address: a } })),
      bccRecipients: (input.bcc ?? []).map((a) => ({ emailAddress: { address: a } })),
    };
    await client.api("/me/sendMail").post({ message, saveToSentItems: true });
    return { id: randomId("sent") };
  },

  async archiveMessage(mailbox, providerMessageId) {
    if (stubMode(mailbox)) {
      console.log(`[outlook:stub] archive ${providerMessageId}`);
      return;
    }
    const client = await getGraphClient(mailbox);
    await client
      .api(`/me/messages/${providerMessageId}/move`)
      .post({ destinationId: "archive" });
  },

  async listRecentMessages(mailbox, sinceCursor) {
    if (stubMode(mailbox)) {
      console.log(`[outlook:stub] listRecentMessages (cursor=${sinceCursor ?? "none"})`);
      return { messages: [], cursor: sinceCursor ?? "" };
    }
    const client = await getGraphClient(mailbox);
    const messages: ProviderMessageSummary[] = [];
    // Delta query against the Inbox; the cursor is a full deltaLink URL.
    const request = sinceCursor
      ? client.api(sinceCursor)
      : client.api("/me/mailFolders/inbox/messages/delta").top(25);
    const res = await request.get();
    for (const m of res.value ?? []) {
      if (m.id) {
        messages.push({
          providerMessageId: m.id,
          threadId: m.conversationId,
          receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : undefined,
        });
      }
    }
    const cursor: string =
      res["@odata.deltaLink"] ?? res["@odata.nextLink"] ?? sinceCursor ?? "";
    return { messages, cursor };
  },
};

export {};

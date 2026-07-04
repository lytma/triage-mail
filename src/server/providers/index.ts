import type { MailboxProvider } from "@prisma/client";
import type { ProviderAdapter } from "./types";
import { gmailAdapter } from "./gmail";
import { outlookAdapter } from "./outlook";
import { imapAdapter } from "./imap";

/** Factory: resolve the adapter for a mailbox provider. */
export function getProvider(provider: MailboxProvider): ProviderAdapter {
  switch (provider) {
    case "gmail":
      return gmailAdapter;
    case "outlook":
      return outlookAdapter;
    case "imap":
      return imapAdapter;
  }
}

export type {
  ProviderAdapter,
  ProviderMessage,
  ProviderMessageSummary,
  SendMessageInput,
} from "./types";

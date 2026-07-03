import type { ProviderAdapter } from "./types";
import { gmailAdapter } from "./gmail";
import { outlookAdapter } from "./outlook";

/** Factory: resolve the adapter for a mailbox provider. */
export function getProvider(provider: "gmail" | "outlook"): ProviderAdapter {
  return provider === "gmail" ? gmailAdapter : outlookAdapter;
}

export type {
  ProviderAdapter,
  ProviderMessage,
  ProviderMessageSummary,
  SendMessageInput,
} from "./types";

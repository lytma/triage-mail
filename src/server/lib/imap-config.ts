/**
 * Auto-detected IMAP/SMTP server settings for app-specific-password mailboxes
 * (iCloud, Yahoo, Fastmail, and other IMAP providers).
 *
 * Users connect an IMAP account with just their email address + an
 * app-specific password; the server settings are derived from the email domain
 * so the connect flow stays as simple as the OAuth one. Most providers publish
 * stable IMAP/SMTP hosts, so this lookup is reliable; unknown domains fall back
 * to the conventional `imap.<domain>` / `smtp.<domain>` convention.
 */

export interface ImapServerSettings {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  /** Human label for the detected provider (UI hint). */
  label: string;
}

interface ProviderPreset extends ImapServerSettings {
  domains: string[];
}

const PRESETS: ProviderPreset[] = [
  {
    label: "iCloud Mail",
    domains: ["icloud.com", "me.com", "mac.com"],
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecure: false, // STARTTLS on 587
  },
  {
    label: "Yahoo Mail",
    domains: ["yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com"],
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    smtpSecure: true,
  },
  {
    label: "Fastmail",
    domains: ["fastmail.com", "fastmail.fm", "messagingengine.com"],
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.fastmail.com",
    smtpPort: 465,
    smtpSecure: true,
  },
  {
    label: "AOL Mail",
    domains: ["aol.com"],
    imapHost: "imap.aol.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.aol.com",
    smtpPort: 465,
    smtpSecure: true,
  },
  {
    label: "GMX",
    domains: ["gmx.com", "gmx.net", "gmx.de"],
    imapHost: "imap.gmx.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "mail.gmx.com",
    smtpPort: 465,
    smtpSecure: true,
  },
];

const KNOWN_DOMAINS = new Set(PRESETS.flatMap((p) => p.domains));

/** True when the domain is a recognized IMAP provider we can auto-detect. */
export function isKnownImapDomain(email: string): boolean {
  const domain = domainOf(email);
  return KNOWN_DOMAINS.has(domain);
}

function domainOf(email: string): string {
  return (email.split("@")[1] ?? "").trim().toLowerCase();
}

/**
 * Resolve IMAP/SMTP settings for an email address. Known providers use their
 * published hosts; anything else falls back to the `imap.`/`smtp.` convention.
 */
export function detectImapSettings(email: string): ImapServerSettings {
  const domain = domainOf(email);
  const preset = PRESETS.find((p) => p.domains.includes(domain));
  if (preset) {
    const { domains: _domains, ...settings } = preset;
    void _domains;
    return settings;
  }
  return {
    label: domain || "IMAP",
    imapHost: `imap.${domain}`,
    imapPort: 993,
    imapSecure: true,
    smtpHost: `smtp.${domain}`,
    smtpPort: 465,
    smtpSecure: true,
  };
}

/** Providers we explicitly support, for UI copy. */
export const SUPPORTED_IMAP_PROVIDERS = ["iCloud", "Yahoo", "Fastmail"] as const;

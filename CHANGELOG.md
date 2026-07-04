# Changelog

## FEATURE — 2026-07-04

Added IMAP support, one-click unsubscribe, learning from manual moves, and
removed subscription billing (the app is now a free single-user tool).

### IMAP mailboxes (iCloud / Yahoo / Fastmail)
- New `imap` value on the `mailbox_provider` enum (migration
  `20260704120000_add_imap_and_unsubscribe`).
- Connect flow uses an **app-specific password** with **auto-detected** IMAP/SMTP
  server settings from the email domain (`src/server/lib/imap-config.ts`; known
  hosts for iCloud/Yahoo/Fastmail/AOL/GMX, `imap.`/`smtp.` fallback otherwise).
  New endpoint `POST /api/connected-mailboxes/imap` verifies + stores the
  password encrypted (reusing the existing token-encryption column); Settings →
  Connected accounts gains an "iCloud, Yahoo, Fastmail…" option + dialog.
- IMAP adapter (`src/server/providers/imap.ts`) implements fetch/send/archive/
  list via `imapflow` + `nodemailer`, stub-guarded exactly like Gmail/Outlook.
- Near-real-time sync via **IMAP IDLE** with a **polling fallback**
  (`src/server/queues/workers/imap-idle.ts`), started from the worker tier; new
  mail enqueues the existing `sync-back` → `triage` path. No-op in preview
  (placeholder-credential mailboxes can't connect).

### One-click unsubscribe
- Triage now parses `List-Unsubscribe` / `List-Unsubscribe-Post` headers
  (metadata only) into `email_metadata.unsubscribe_target` +
  `unsubscribe_one_click`. Gmail requests the headers; Outlook/IMAP already carry
  them.
- Marketing & Newsletters folders show an **Unsubscribe** button per applicable
  row. `POST /api/emails/:id/unsubscribe` archives locally and enqueues a
  `mailbox-action` `unsubscribe` job that performs RFC 8058 one-click (HTTPS
  POST), a plain HTTPS GET, or a `mailto:` send — best-effort — then archives on
  the provider. Simulated (no network) for demo users.

### Learn from manual moves
- New **Move to category** action in the Review queue and category folders
  (`MoveToMenu`) → `POST /api/emails/:id/move`, which re-files the email and
  adjusts the Review queue.
- Learning does **both**: an **instant per-sender rule** (a high-priority
  `[Learned]` `TriageRule` that overrides future mail from that sender,
  idempotent per sender) and a **gradual AI-feedback loop** (learned rules are
  surfaced to the LLM classifier as preference hints — `src/server/services/
  learning.ts`, wired through `classifyEmail`).

### Removed subscription billing
- The app is entirely **free** — no Stripe, no trial, no subscription checks.
- Deleted the pricing page, subscription/checkout/cancel endpoints, the Stripe
  webhook, the billing service, the subscription banner, and the Settings
  billing section. New users are created `active` with no trial. Marketing CTAs
  now say "Get started — free". Vestigial subscription tables remain in the
  schema (unused) to avoid a destructive migration.

-- Add IMAP provider (iCloud / Yahoo / Fastmail) to the mailbox provider enum.
ALTER TYPE "mailbox_provider" ADD VALUE IF NOT EXISTS 'imap';

-- One-click unsubscribe metadata parsed from the List-Unsubscribe header
-- (metadata only — never body content).
ALTER TABLE "email_metadata"
  ADD COLUMN "unsubscribe_target" TEXT,
  ADD COLUMN "unsubscribe_one_click" BOOLEAN NOT NULL DEFAULT false;

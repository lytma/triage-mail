-- Ensure required Postgres extensions (pre-provisioned on lytma; no-op if present)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('google', 'microsoft');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- CreateEnum
CREATE TYPE "subscription_plan" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "ledger_entry_type" AS ENUM ('charge', 'refund', 'proration_credit', 'trial_start', 'trial_convert', 'cancellation');

-- CreateEnum
CREATE TYPE "ledger_status" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "mailbox_provider" AS ENUM ('gmail', 'outlook');

-- CreateEnum
CREATE TYPE "sync_state" AS ENUM ('active', 'paused', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "classification" AS ENUM ('important', 'fyi', 'newsletter', 'marketing', 'receipt', 'automated_notification');

-- CreateEnum
CREATE TYPE "review_item_status" AS ENUM ('pending', 'replied', 'forwarded', 'archived', 'done');

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "password_hash" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "auth_provider" "auth_provider",
    "auth_provider_subject" VARCHAR(255),
    "subscription_status" "subscription_status" NOT NULL DEFAULT 'trialing',
    "subscription_plan" "subscription_plan",
    "stripe_customer_id" VARCHAR(255),
    "trial_ends_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "stripe_subscription_id" VARCHAR(255),
    "plan" "subscription_plan" NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'trialing',
    "current_period_start" TIMESTAMPTZ,
    "current_period_end" TIMESTAMPTZ,
    "canceled_at" TIMESTAMPTZ,
    "trial_started_at" TIMESTAMPTZ,
    "trial_ends_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_ledger_entries" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "stripe_invoice_id" VARCHAR(255),
    "stripe_charge_id" VARCHAR(255),
    "entry_type" "ledger_entry_type" NOT NULL,
    "amount_cents" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" "ledger_status" NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_mailboxes" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "provider" "mailbox_provider" NOT NULL,
    "email_address" VARCHAR(255) NOT NULL,
    "oauth_refresh_token_encrypted" TEXT NOT NULL,
    "oauth_access_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMPTZ,
    "sync_state" "sync_state" NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMPTZ,
    "last_sync_error" TEXT,
    "provider_history_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "connected_mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_folders" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_metadata" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "connected_mailbox_id" UUID NOT NULL,
    "provider_message_id" VARCHAR(512) NOT NULL,
    "provider_thread_id" VARCHAR(512),
    "sender_email" VARCHAR(255) NOT NULL,
    "sender_name" VARCHAR(255),
    "subject" VARCHAR(1000),
    "received_at" TIMESTAMPTZ NOT NULL,
    "category_folder_id" UUID,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "is_flagged_low_confidence" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_decisions" (
    "id" UUID NOT NULL,
    "email_metadata_id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "classification" "classification" NOT NULL,
    "confidence_score" DECIMAL(4,3) NOT NULL,
    "reason" TEXT,
    "final_category" "classification" NOT NULL,
    "overridden_by_rule_id" UUID,
    "llm_model" VARCHAR(100) NOT NULL,
    "llm_prompt_tokens" INTEGER,
    "llm_completion_tokens" INTEGER,
    "decided_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_rules" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "plain_english_text" TEXT NOT NULL,
    "parsed_conditions" JSONB NOT NULL,
    "target_classification" "classification" NOT NULL,
    "target_category_folder_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "triage_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_queue_items" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "email_metadata_id" UUID NOT NULL,
    "importance_score" DECIMAL(4,3) NOT NULL,
    "status" "review_item_status" NOT NULL DEFAULT 'pending',
    "cleared_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "review_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_summary_stats" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "stat_date" DATE NOT NULL,
    "total_emails" INTEGER NOT NULL DEFAULT 0,
    "important_count" INTEGER NOT NULL DEFAULT 0,
    "fyi_count" INTEGER NOT NULL DEFAULT 0,
    "newsletter_count" INTEGER NOT NULL DEFAULT 0,
    "marketing_count" INTEGER NOT NULL DEFAULT 0,
    "receipt_count" INTEGER NOT NULL DEFAULT 0,
    "automated_notification_count" INTEGER NOT NULL DEFAULT 0,
    "flagged_low_confidence_count" INTEGER NOT NULL DEFAULT 0,
    "queue_cleared_count" INTEGER NOT NULL DEFAULT 0,
    "rule_overridden_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "triage_summary_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_subscriptions" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh_key" TEXT NOT NULL,
    "auth_secret" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_accounts" (
    "id" UUID NOT NULL,
    "demo_token" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "seed_data_snapshot" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "props" JSONB,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_email_key" ON "user_accounts"("email");

-- CreateIndex
CREATE INDEX "idx_user_accounts_stripe_customer" ON "user_accounts"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_account_id_key" ON "subscriptions"("user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_user" ON "subscriptions"("user_account_id");

-- CreateIndex
CREATE INDEX "idx_ledger_subscription" ON "subscription_ledger_entries"("subscription_id");

-- CreateIndex
CREATE INDEX "idx_ledger_user" ON "subscription_ledger_entries"("user_account_id");

-- CreateIndex
CREATE INDEX "idx_ledger_stripe_invoice" ON "subscription_ledger_entries"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "idx_mailboxes_user" ON "connected_mailboxes"("user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "connected_mailboxes_user_account_id_email_address_key" ON "connected_mailboxes"("user_account_id", "email_address");

-- CreateIndex
CREATE INDEX "idx_categories_user" ON "category_folders"("user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_folders_user_account_id_slug_key" ON "category_folders"("user_account_id", "slug");

-- CreateIndex
CREATE INDEX "idx_email_user" ON "email_metadata"("user_account_id");

-- CreateIndex
CREATE INDEX "idx_email_mailbox" ON "email_metadata"("connected_mailbox_id");

-- CreateIndex
CREATE INDEX "idx_email_category" ON "email_metadata"("category_folder_id");

-- CreateIndex
CREATE INDEX "idx_email_received" ON "email_metadata"("user_account_id", "received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "email_metadata_connected_mailbox_id_provider_message_id_key" ON "email_metadata"("connected_mailbox_id", "provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "triage_decisions_email_metadata_id_key" ON "triage_decisions"("email_metadata_id");

-- CreateIndex
CREATE INDEX "idx_triage_user" ON "triage_decisions"("user_account_id");

-- CreateIndex
CREATE INDEX "idx_triage_classification" ON "triage_decisions"("classification");

-- CreateIndex
CREATE INDEX "idx_rules_user" ON "triage_rules"("user_account_id");

-- CreateIndex
CREATE INDEX "idx_rules_user_active_priority" ON "triage_rules"("user_account_id", "is_active", "priority" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "review_queue_items_email_metadata_id_key" ON "review_queue_items"("email_metadata_id");

-- CreateIndex
CREATE INDEX "idx_review_user_status" ON "review_queue_items"("user_account_id", "status");

-- CreateIndex
CREATE INDEX "idx_review_user_pending" ON "review_queue_items"("user_account_id", "status", "importance_score" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_stats_user_date" ON "triage_summary_stats"("user_account_id", "stat_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "triage_summary_stats_user_account_id_stat_date_key" ON "triage_summary_stats"("user_account_id", "stat_date");

-- CreateIndex
CREATE INDEX "idx_notif_user" ON "notification_subscriptions"("user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_subscriptions_endpoint_key" ON "notification_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "demo_accounts_demo_token_key" ON "demo_accounts"("demo_token");

-- CreateIndex
CREATE INDEX "idx_demo_active" ON "demo_accounts"("is_active");

-- CreateIndex
CREATE INDEX "events_name_idx" ON "events"("name");

-- CreateIndex
CREATE INDEX "events_occurred_at_idx" ON "events"("occurred_at");

-- CreateIndex
CREATE INDEX "idx_events_name_occurred" ON "events"("name", "occurred_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_ledger_entries" ADD CONSTRAINT "subscription_ledger_entries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_ledger_entries" ADD CONSTRAINT "subscription_ledger_entries_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_mailboxes" ADD CONSTRAINT "connected_mailboxes_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_folders" ADD CONSTRAINT "category_folders_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_metadata" ADD CONSTRAINT "email_metadata_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_metadata" ADD CONSTRAINT "email_metadata_connected_mailbox_id_fkey" FOREIGN KEY ("connected_mailbox_id") REFERENCES "connected_mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_metadata" ADD CONSTRAINT "email_metadata_category_folder_id_fkey" FOREIGN KEY ("category_folder_id") REFERENCES "category_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_decisions" ADD CONSTRAINT "triage_decisions_email_metadata_id_fkey" FOREIGN KEY ("email_metadata_id") REFERENCES "email_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_decisions" ADD CONSTRAINT "triage_decisions_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_decisions" ADD CONSTRAINT "triage_decisions_overridden_by_rule_id_fkey" FOREIGN KEY ("overridden_by_rule_id") REFERENCES "triage_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_rules" ADD CONSTRAINT "triage_rules_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_rules" ADD CONSTRAINT "triage_rules_target_category_folder_id_fkey" FOREIGN KEY ("target_category_folder_id") REFERENCES "category_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_email_metadata_id_fkey" FOREIGN KEY ("email_metadata_id") REFERENCES "email_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_summary_stats" ADD CONSTRAINT "triage_summary_stats_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

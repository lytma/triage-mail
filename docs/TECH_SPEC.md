# Triage Mail — Technical Specification

Triage Mail is a **CRUD-backend** multi-tenant SaaS web app: persistent per-user records (email metadata, triage decisions, rules, queue items) backed by Postgres, with a Next.js App Router frontend and a separate Node.js worker tier for the heavy async work — mailbox sync, per-email LLM triage, two-way action propagation, and web-push delivery. The core loop is event-driven: Gmail Pub/Sub and Microsoft Graph change notifications push new-message signals into a BullMQ queue on Redis; workers fetch the message from the provider, call the hosted LLM to classify it, apply the user's plain-English rules (which always win), persist only metadata, and route the item to the Review queue or a category folder. The web tier serves the Review queue, category folders, compose, settings, and stats screens via server components for initial load and SSE/polling for live updates.

The stack honors the tech-fit recommendation: Next.js + React + Tailwind + shadcn/ui on the frontend; Next.js Route Handlers for CRUD and a dedicated Node.js worker process (BullMQ on Redis) for sync/triage; Prisma over Postgres (managed by lytma) with full-text search for rule/keyword matching and pgvector reserved for future learning-from-corrections features; Auth.js with Google + Microsoft OAuth that doubles as mailbox-connection bootstrap; Stripe for subscription billing; Web Push (VAPID) for important-only notifications. No dedicated search engine or vector DB is warranted at this scale — Postgres FTS and pgvector cover rule matching and any future similarity work.

## Recommended stack

| Area | Choice | Rationale |
| --- | --- | --- |
| Frontend | Next.js (App Router) + React + Tailwind CSS + shadcn/ui | Matches tech-fit direction; server components for fast initial Review-queue load, client components for real-time updates; shadcn/ui gives composable, keyboard-first primitives suited to a scannable productivity tool. PWA-installable for desktop-first power users. |
| Backend (web tier) | Next.js Route Handlers (Node.js runtime) + Prisma ORM | CRUD, auth, billing webhooks, and SSE endpoints live co-located with the frontend; Prisma gives type-safe Postgres access and migrations. Honors tech-fit backend direction. |
| Backend (worker tier) | Separate Node.js process with BullMQ on Redis | Per-email LLM triage, mailbox sync, two-way action propagation, and web-push delivery are long-running and must scale horizontally; BullMQ gives retries, backoff, concurrency control, and dead-letter queues. Web and worker are independently scalable processes on lytma's managed platform. |
| Database | Postgres (lytma managed) with pg_trgm, unaccent, uuid-ossp, citext, pgvector | Single shared multi-tenant DB with user_id isolation. Full-text search (tsvector + pg_trgm + unaccent) covers plain-English rule keyword matching and metadata search. pgvector is included for future embedding-based learning; not used in MVP. No dedicated search engine needed — search is not the core differentiator and volume is modest. |
| Cache / Queue | Redis (lytma managed) | BullMQ job queue for triage/sync workers, short-lived caching of provider token metadata, and rate-limit counters for Gmail/Graph APIs. |
| Auth | Auth.js (NextAuth) with Google + Microsoft OAuth providers, database session strategy | Honors tech-fit. The same OAuth flow both logs the user in and bootstraps Gmail/Outlook mailbox connections with the required scopes (readonly + send + modify). Refresh tokens stored encrypted in Postgres for background sync. |
| Email provider integration | Gmail API (Pub/Sub push) + Microsoft Graph API (change notifications) | Provider-native push for near-real-time triage; two-way sync for archive/move/send/delete. IMAP deferred — tech-fit scopes v1 to Gmail + Outlook. |
| LLM integration | OpenAI API (classification per email), called only from worker tier | Per-email classification with a structured prompt returning category, importance, confidence, and short reason. Metadata-only payload (sender, subject, snippet, headers) — no body content persisted. Cost monitored via per-user daily counters. |
| Payments | Stripe Checkout + Billing (webhooks to web tier) | Monthly/yearly subscription. Stripe owns the subscription state machine; the app mirrors status via webhook into a local subscriptions table. No escrow or payouts — pure subscription billing. |
| Notifications | Web Push (VAPID + service worker), dispatched from worker tier | Important-only alerts when an item lands in the Review queue. Honors tech-fit notification approach. Delivery is a background job, not inline. |
| File storage | None (metadata-only) | App stores email metadata only; full content stays in the original mailbox. No S3 needed for MVP. If attachment metadata icons are required, they are derived from headers, not stored files. |
| Hosting | lytma managed platform — web service + worker service + managed Postgres/Redis | Two process types (web, worker) deployed as separate services on lytma; managed Postgres and Redis as shared platform services. Publicly reachable web endpoint for provider webhooks and Stripe webhooks. |

## Architecture overview

This is a **CRUD-backend** archetype: a multi-tenant SaaS with persistent per-user records in Postgres, an HTTP API surface (Next.js Route Handlers), and an async worker tier. There are three runtime tiers: (1) **Web tier** — Next.js App Router serving SSR pages and Route Handlers for CRUD, auth, compose/send, billing webhooks, provider webhook ingestion, and SSE for live queue updates; (2) **Worker tier** — a Node.js process running BullMQ consumers on Redis for email sync, LLM triage, two-way action propagation, and web-push delivery; (3) **Platform services** — managed Postgres and Redis.

**Data flow for incoming mail:** Gmail Pub/Sub / Graph change notification → POST to a public webhook Route Handler → enqueue a `triage` job (BullMQ) → worker fetches the message from the provider API (metadata + snippet only) → worker calls OpenAI with a structured classification prompt → worker evaluates the user's plain-English rules (rules always override AI) → worker persists an `EmailMetadata` row, a `TriageDecision` row (category, importance, confidence, reason), and either a `ReviewQueueItem` or a category-folder assignment → if important, enqueue a `web-push` job → SSE/polling updates the client.

**Data flow for user actions:** User archives/moves/replies/forwards in the app → Route Handler updates local metadata and enqueues a `mailbox-action` job → worker calls Gmail/Graph API to perform the action on the original mailbox → on failure, retry with backoff; on auth failure, mark the `ConnectedMailbox` as disconnected and surface the reconnect banner.

**Plain-English rules:** Rules are authored as natural-language text in Settings. At triage time, the worker uses Postgres FTS (tsvector over rule text + sender/subject tokens) plus an LLM-assisted parse (cached per rule) to translate each rule into deterministic filter predicates (sender match, subject keyword, category override). Rules are evaluated before the AI decision; if any rule matches, the rule's target wins and the AI decision is recorded but not applied. Rules do not apply retroactively in MVP.

**Boundaries:** The web tier never calls OpenAI or provider sync APIs directly — all such work goes through BullMQ. The worker tier never serves HTTP. Postgres is the single source of truth for metadata, decisions, rules, queue state, and subscription status. Provider APIs remain the source of truth for full message content and mailbox state.

**Background jobs (BullMQ queues):** `triage` (per-email classification), `mailbox-action` (outbound archive/move/send/delete), `web-push` (important-only notifications), `sync-back` (periodic full reconciliation per mailbox to catch changes made in native clients), `token-refresh` (proactive OAuth refresh before expiry). Each queue has concurrency limits, exponential backoff, and a dead-letter queue.

## Data schema

### user_accounts

The signed-up user with a subscription and one or more connected mailboxes.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() | Surrogate PK |
| email | varchar(255) | NOT NULL UNIQUE | Login email |
| display_name | varchar(255) | NOT NULL | User-chosen display name |
| auth_provider | enum('google','microsoft') | NOT NULL | OAuth provider used for sign-in |
| auth_provider_subject | varchar(255) | NOT NULL | Provider-side user ID |
| subscription_status | enum('trialing','active','past_due','canceled','expired') | NOT NULL DEFAULT 'trialing' | Current billing state |
| subscription_plan | enum('monthly','yearly') | NULL | Selected plan after trial |
| stripe_customer_id | varchar(255) | NULL | Stripe customer reference |
| trial_ends_at | timestamptz | NULL | When the trial period ends |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- UNIQUE INDEX uq_user_accounts_email ON user_accounts(email)
- INDEX idx_user_accounts_stripe_customer ON user_accounts(stripe_customer_id)

**Relationships:**
- 1 → many connected_mailboxes
- 1 → many triage_rules
- 1 → many category_folders
- 1 → many notification_subscriptions
- 1 → 1 subscriptions

### subscriptions

Subscription billing state machine for a user account, tracking the lifecycle from trial through active billing to cancellation or expiry.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| stripe_subscription_id | varchar(255) | UNIQUE | Stripe subscription object ID |
| plan | enum('monthly','yearly') | NOT NULL | Billing cadence |
| status | enum('trialing','active','past_due','canceled','expired') | NOT NULL DEFAULT 'trialing' | Money state machine: trialing → active → past_due → canceled/expired |
| current_period_start | timestamptz | NULL | Start of current billing period |
| current_period_end | timestamptz | NULL | End of current billing period |
| canceled_at | timestamptz | NULL | When cancellation was requested |
| trial_started_at | timestamptz | NULL |  |
| trial_ends_at | timestamptz | NULL |  |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- UNIQUE INDEX uq_subscriptions_stripe ON subscriptions(stripe_subscription_id)
- INDEX idx_subscriptions_user ON subscriptions(user_account_id)

**Relationships:**
- 1 → 1 user_accounts
- 1 → many subscription_ledger_entries

### subscription_ledger_entries

Append-only ledger recording every money movement (charge, refund, proration, trial conversion) for audit and reconciliation.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| subscription_id | uuid | NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE | FK -> subscriptions.id |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| stripe_invoice_id | varchar(255) | NULL | Stripe invoice reference |
| stripe_charge_id | varchar(255) | NULL | Stripe charge reference |
| entry_type | enum('charge','refund','proration_credit','trial_start','trial_convert','cancellation') | NOT NULL | Type of money movement |
| amount_cents | numeric(12,2) | NOT NULL | Positive = charge, negative = refund/credit |
| currency | varchar(3) | NOT NULL DEFAULT 'USD' | ISO 4217 |
| status | enum('pending','succeeded','failed','refunded') | NOT NULL DEFAULT 'pending' | Outcome of the movement |
| description | text | NULL | Human-readable reason |
| recorded_at | timestamptz | NOT NULL DEFAULT now() | When the movement was recorded |

**Indexes:**
- INDEX idx_ledger_subscription ON subscription_ledger_entries(subscription_id)
- INDEX idx_ledger_user ON subscription_ledger_entries(user_account_id)
- INDEX idx_ledger_stripe_invoice ON subscription_ledger_entries(stripe_invoice_id)

**Relationships:**
- many → 1 subscriptions
- many → 1 user_accounts

### connected_mailboxes

A Gmail or Outlook account linked for two-way sync.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| provider | enum('gmail','outlook') | NOT NULL | Email provider |
| email_address | varchar(255) | NOT NULL | The mailbox email address |
| oauth_refresh_token_encrypted | text | NOT NULL | Encrypted OAuth refresh token |
| oauth_access_token_encrypted | text | NULL | Encrypted short-lived access token |
| token_expires_at | timestamptz | NULL | Access token expiry |
| sync_state | enum('active','paused','error','disconnected') | NOT NULL DEFAULT 'active' | Current sync status |
| last_synced_at | timestamptz | NULL | Last successful sync timestamp |
| last_sync_error | text | NULL | Error message if sync failed |
| provider_history_id | varchar(255) | NULL | Gmail historyId or Outlook delta token for incremental sync |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- INDEX idx_mailboxes_user ON connected_mailboxes(user_account_id)
- UNIQUE INDEX uq_mailboxes_user_email ON connected_mailboxes(user_account_id, email_address)

**Relationships:**
- many → 1 user_accounts
- 1 → many email_metadata

### category_folders

A bucket for non-important mail such as Marketing, Newsletters, Receipts, or FYI.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id; NULL for system defaults |
| name | varchar(100) | NOT NULL | Folder display name |
| slug | varchar(100) | NOT NULL | URL-safe identifier |
| is_system_default | boolean | NOT NULL DEFAULT false | True for predefined categories (Marketing, Newsletters, Receipts, FYI, Automated) |
| display_order | integer | NOT NULL DEFAULT 0 | Sort order in sidebar |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- INDEX idx_categories_user ON category_folders(user_account_id)
- UNIQUE INDEX uq_categories_user_slug ON category_folders(user_account_id, slug)

**Relationships:**
- many → 1 user_accounts
- 1 → many email_metadata

### email_metadata

Sender, subject, date, category, flags, importance, and confidence for a triaged email. No body content is stored.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| connected_mailbox_id | uuid | NOT NULL REFERENCES connected_mailboxes(id) ON DELETE CASCADE | FK -> connected_mailboxes.id |
| provider_message_id | varchar(512) | NOT NULL | Gmail/Outlook message ID for two-way sync |
| provider_thread_id | varchar(512) | NULL | Thread/conversation ID from provider |
| sender_email | varchar(255) | NOT NULL | From address |
| sender_name | varchar(255) | NULL | Display name of sender |
| subject | varchar(1000) | NULL | Email subject line |
| received_at | timestamptz | NOT NULL | Date/time the email was received |
| category_folder_id | uuid | NULL REFERENCES category_folders(id) ON DELETE SET NULL | FK -> category_folders.id; NULL if in Review queue only |
| is_important | boolean | NOT NULL DEFAULT false | AI or rule determined importance |
| is_flagged_low_confidence | boolean | NOT NULL DEFAULT false | Flagged for user attention due to low AI confidence |
| is_archived | boolean | NOT NULL DEFAULT false | User archived this email |
| has_attachments | boolean | NOT NULL DEFAULT false | Whether the original email has attachments |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- INDEX idx_email_user ON email_metadata(user_account_id)
- INDEX idx_email_mailbox ON email_metadata(connected_mailbox_id)
- INDEX idx_email_category ON email_metadata(category_folder_id)
- INDEX idx_email_received ON email_metadata(user_account_id, received_at DESC)
- UNIQUE INDEX uq_email_provider_msg ON email_metadata(connected_mailbox_id, provider_message_id)

**Relationships:**
- many → 1 user_accounts
- many → 1 connected_mailboxes
- many → 1 category_folders
- 1 → 1 triage_decisions
- 1 → 0..1 review_queue_items

### triage_decisions

The AI's classification, reason, and confidence for a single email.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| email_metadata_id | uuid | NOT NULL REFERENCES email_metadata(id) ON DELETE CASCADE | FK -> email_metadata.id |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| classification | enum('important','fyi','newsletter','marketing','receipt','automated_notification') | NOT NULL | AI-assigned category |
| confidence_score | numeric(4,3) | NOT NULL | 0.000–1.000 |
| reason | text | NULL | Short human-readable reason for the classification |
| overridden_by_rule_id | uuid | NULL REFERENCES triage_rules(id) ON DELETE SET NULL | FK -> triage_rules.id; set when a user rule overrode the AI |
| llm_model | varchar(100) | NOT NULL | Which LLM model was used |
| llm_prompt_tokens | integer | NULL | Token usage for cost tracking |
| llm_completion_tokens | integer | NULL | Token usage for cost tracking |
| decided_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- UNIQUE INDEX uq_triage_email ON triage_decisions(email_metadata_id)
- INDEX idx_triage_user ON triage_decisions(user_account_id)
- INDEX idx_triage_classification ON triage_decisions(classification)

**Relationships:**
- 1 → 1 email_metadata
- many → 1 user_accounts
- many → 0..1 triage_rules

### triage_rules

A plain-English rule that always overrides AI classification.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| plain_english_text | text | NOT NULL | User-authored natural-language rule |
| parsed_conditions | jsonb | NOT NULL | Machine-readable filter logic derived from NL parsing |
| target_classification | enum('important','fyi','newsletter','marketing','receipt','automated_notification') | NOT NULL | Classification the rule forces |
| target_category_folder_id | uuid | NULL REFERENCES category_folders(id) ON DELETE SET NULL | FK -> category_folders.id; where to route if not important |
| is_active | boolean | NOT NULL DEFAULT true | Can be toggled off without deleting |
| priority | integer | NOT NULL DEFAULT 0 | Higher priority rules evaluated first |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- INDEX idx_rules_user ON triage_rules(user_account_id)
- INDEX idx_rules_user_active_priority ON triage_rules(user_account_id, is_active, priority DESC)

**Relationships:**
- many → 1 user_accounts
- 1 → many triage_decisions

### review_queue_items

An important email surfaced for the user to reply, forward, or clear.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| email_metadata_id | uuid | NOT NULL REFERENCES email_metadata(id) ON DELETE CASCADE | FK -> email_metadata.id |
| importance_score | numeric(4,3) | NOT NULL | 0.000–1.000; used for ordering |
| status | enum('pending','replied','forwarded','archived','done') | NOT NULL DEFAULT 'pending' | Item leaves queue when archived or done |
| cleared_at | timestamptz | NULL | When user archived or marked done |
| created_at | timestamptz | NOT NULL DEFAULT now() | When item entered the queue |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- INDEX idx_review_user_status ON review_queue_items(user_account_id, status)
- INDEX idx_review_user_pending ON review_queue_items(user_account_id, status, importance_score DESC, created_at DESC) WHERE status = 'pending'
- UNIQUE INDEX uq_review_email ON review_queue_items(email_metadata_id)

**Relationships:**
- many → 1 user_accounts
- 1 → 1 email_metadata

### triage_summary_stats

Aggregated counts and trends showing how mail was triaged over time.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| stat_date | date | NOT NULL | Day the stats cover |
| total_emails | integer | NOT NULL DEFAULT 0 | Total emails triaged that day |
| important_count | integer | NOT NULL DEFAULT 0 |  |
| fyi_count | integer | NOT NULL DEFAULT 0 |  |
| newsletter_count | integer | NOT NULL DEFAULT 0 |  |
| marketing_count | integer | NOT NULL DEFAULT 0 |  |
| receipt_count | integer | NOT NULL DEFAULT 0 |  |
| automated_notification_count | integer | NOT NULL DEFAULT 0 |  |
| flagged_low_confidence_count | integer | NOT NULL DEFAULT 0 |  |
| queue_cleared_count | integer | NOT NULL DEFAULT 0 | Review queue items cleared that day |
| rule_overridden_count | integer | NOT NULL DEFAULT 0 | Emails where a user rule overrode AI |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- UNIQUE INDEX uq_stats_user_date ON triage_summary_stats(user_account_id, stat_date)
- INDEX idx_stats_user_date ON triage_summary_stats(user_account_id, stat_date DESC)

**Relationships:**
- many → 1 user_accounts

### notification_subscriptions

A web push subscription for important-email alerts.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| user_account_id | uuid | NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE | FK -> user_accounts.id |
| endpoint | text | NOT NULL | Push service endpoint URL |
| p256dh_key | text | NOT NULL | Browser public key |
| auth_secret | text | NOT NULL | Auth secret for encryption |
| is_active | boolean | NOT NULL DEFAULT true |  |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |
| updated_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- INDEX idx_notif_user ON notification_subscriptions(user_account_id)
- UNIQUE INDEX uq_notif_endpoint ON notification_subscriptions(endpoint)

**Relationships:**
- many → 1 user_accounts

### demo_accounts

A seeded sample account with realistic emails for trial and testing.

| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| id | uuid | PRIMARY KEY DEFAULT gen_random_uuid() |  |
| demo_token | varchar(255) | NOT NULL UNIQUE | Shareable token to access the demo |
| display_name | varchar(255) | NOT NULL | Demo user display name |
| seed_data_snapshot | jsonb | NOT NULL | Serialized snapshot of seeded emails, categories, and rules |
| is_active | boolean | NOT NULL DEFAULT true |  |
| expires_at | timestamptz | NULL | Optional expiry for demo access |
| created_at | timestamptz | NOT NULL DEFAULT now() |  |

**Indexes:**
- UNIQUE INDEX uq_demo_token ON demo_accounts(demo_token)
- INDEX idx_demo_active ON demo_accounts(is_active)

## API endpoints

| Method | Path | Purpose | Roles | Request | Response |
| --- | --- | --- | --- | --- | --- |
| GET | /api/auth/session | Retrieve current authenticated session | User, DemoUser | No body | 200 { user: { id, email, displayName, subscriptionStatus } } \| 401 |
| POST | /api/auth/signin/google | Sign in or sign up via Google OAuth |  | OAuth redirect flow | 302 redirect to Google consent |
| POST | /api/auth/signin/microsoft | Sign in or sign up via Microsoft OAuth |  | OAuth redirect flow | 302 redirect to Microsoft consent |
| POST | /api/auth/signout | Sign out and destroy session | User, DemoUser | No body | 200 { success: true } |
| GET | /api/review-queue | Open Review queue — list pending important items ordered by importance then recency | User, DemoUser | Query: ?page=1&limit=50 | 200 { items: [ { id, emailMetadataId, senderEmail, senderName, subject, receivedAt, importanceScore, isFlaggedLowConfidence, triageReason, triageConfidence } ], total, page } |
| PATCH | /api/review-queue/:itemId | Clear Review queue item — archive or mark done | User, DemoUser | { status: 'archived' \| 'done' } | 200 { id, status, clearedAt } \| 404 |
| POST | /api/review-queue/:itemId/reply | Reply to a Review queue item and two-way sync to original mailbox | User | { body: string, to: string[], cc?: string[] } | 200 { sentMessageId, syncedToProvider: true } \| 404 \| 502 |
| POST | /api/review-queue/:itemId/forward | Forward a Review queue item and two-way sync to original mailbox | User | { to: string[], cc?: string[], body?: string } | 200 { sentMessageId, syncedToProvider: true } \| 404 \| 502 |
| GET | /api/category-folders | List all category folders for the user | User, DemoUser | No body | 200 { folders: [ { id, name, slug, displayOrder, itemCount } ] } |
| GET | /api/category-folders/:folderId/emails | List emails in a category folder with pagination | User, DemoUser | Query: ?page=1&limit=50 | 200 { items: [ { id, senderEmail, senderName, subject, receivedAt, isFlaggedLowConfidence, isArchived } ], total, page } |
| POST | /api/category-folders/:folderId/bulk-archive | Bulk-archive selected items in a category folder and two-way sync | User, DemoUser | { emailMetadataIds: uuid[] } | 200 { archivedCount, syncedToProvider: true } |
| POST | /api/compose | Compose and send a new email from a chosen connected account | User | { connectedMailboxId: uuid, to: string[], cc?: string[], bcc?: string[], subject: string, body: string } | 200 { sentMessageId, syncedToProvider: true } \| 422 \| 502 |
| GET | /api/triage-rules | List all triage rules for the user | User | No body | 200 { rules: [ { id, plainEnglishText, targetClassification, isActive, priority, createdAt } ] } |
| POST | /api/triage-rules | Create a plain-English triage rule that always overrides AI | User | { plainEnglishText: string, targetClassification: enum, targetCategoryFolderId?: uuid, priority?: integer } | 201 { id, plainEnglishText, parsedConditions, targetClassification, isActive, priority } \| 422 |
| PATCH | /api/triage-rules/:ruleId | Edit or toggle a triage rule | User | { plainEnglishText?: string, isActive?: boolean, priority?: integer } | 200 { id, plainEnglishText, parsedConditions, isActive, priority } \| 404 |
| DELETE | /api/triage-rules/:ruleId | Delete a triage rule | User | No body | 200 { success: true } \| 404 |
| GET | /api/connected-mailboxes | List connected mailboxes and their sync status | User | No body | 200 { mailboxes: [ { id, provider, emailAddress, syncState, lastSyncedAt, lastSyncError } ] } |
| POST | /api/connected-mailboxes | Connect a Gmail or Outlook account and begin two-way sync | User | { provider: 'gmail' \| 'outlook' } | 302 redirect to provider OAuth consent |
| DELETE | /api/connected-mailboxes/:mailboxId | Disconnect a mailbox and stop sync | User | No body | 200 { success: true } \| 404 |
| POST | /api/connected-mailboxes/:mailboxId/reconnect | Re-authenticate a mailbox that lost access and resume sync | User | No body (initiates OAuth re-flow) | 302 redirect to provider OAuth consent |
| POST | /api/webhooks/gmail | Gmail Pub/Sub push notification — new email arrived, enqueue triage job |  | Pub/Sub message body | 200 { acknowledged: true } |
| POST | /api/webhooks/outlook | Microsoft Graph change notification — new email arrived, enqueue triage job |  | Graph notification payload | 200 { acknowledged: true } |
| POST | /api/webhooks/stripe | Stripe billing webhook — subscription created, updated, payment succeeded/failed |  | Stripe event payload (verified via signature) | 200 { received: true } |
| GET | /api/triage-stats | View triage summary stats — counts by category, daily trends, queue clearance rate | User, DemoUser | Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD | 200 { dailyStats: [ { statDate, totalEmails, importantCount, fyiCount, newsletterCount, marketingCount, receiptCount, automatedNotificationCount, flaggedLowConfidenceCount, queueClearedCount, ruleOverriddenCount } ], summary: { totalEmails, avgQueueClearanceRate, topCategory } } |
| GET | /api/notifications/subscriptions | List web push subscriptions for the user | User | No body | 200 { subscriptions: [ { id, endpoint, isActive, createdAt } ] } |
| POST | /api/notifications/subscriptions | Register a web push subscription for important-email alerts | User | { endpoint, p256dhKey, authSecret } | 201 { id, isActive } |
| DELETE | /api/notifications/subscriptions/:subscriptionId | Remove a web push subscription | User | No body | 200 { success: true } \| 404 |
| GET | /api/notifications/vapid-public-key | Get VAPID public key for client-side push subscription | User | No body | 200 { vapidPublicKey: string } |
| GET | /api/subscription | Get current subscription status and billing details | User | No body | 200 { plan, status, currentPeriodStart, currentPeriodEnd, trialEndsAt } |
| POST | /api/subscription/checkout | Start Stripe Checkout session for monthly or yearly plan | User | { plan: 'monthly' \| 'yearly' } | 200 { checkoutUrl: string } |
| POST | /api/subscription/cancel | Cancel active subscription at period end | User | No body | 200 { status: 'canceled', canceledAt } |
| GET | /api/demo/:demoToken | Access a demo account with seeded sample emails | DemoUser | No body | 200 { demoAccount: { id, displayName }, reviewQueue: [...], categoryFolders: [...] } \| 404 |

## Authentication

Auth.js (NextAuth) with Google and Microsoft as OAuth providers. The same OAuth scopes used for sign-in also bootstrap Gmail/Outlook mailbox connections. Database-backed sessions (JWT alternative acceptable). A DemoUser accesses demo accounts via a shareable demo token without full OAuth — a limited demo session is created that grants read-only access to seeded data only. Refresh tokens for connected mailboxes are stored encrypted at rest. Session cookies are httpOnly, secure, and SameSite=lax.

## Permission enforcement

Single-user SaaS — every authenticated user is a 'User' role with access only to their own tenant data. All API routes enforce tenant isolation by injecting user_account_id from the session and scoping every database query with WHERE user_account_id = ?. No admin or team roles exist. DemoUser sessions are restricted to the demo_accounts table and its seed_data_snapshot; they cannot access real user data, connected mailboxes, or billing endpoints. Stripe webhook endpoints verify the signature server-side and are exempt from session auth. Gmail/Outlook webhook endpoints verify provider-specific verification tokens.

## File storage

Not required. The product stores only email metadata (sender, subject, date, category, flags, importance, confidence) — no email body content or attachments are persisted. Full content remains in the original mailbox and is read transiently by the worker for LLM triage, then discarded.

## Notification delivery

Web Push (VAPID + service worker) for important-email alerts only. When the triage worker classifies an email as important and routes it to the Review queue, it enqueues a notification job in BullMQ. A background worker retrieves the user's active notification_subscriptions and sends a push via the Web Push API. No email-based or SMS notifications in MVP. Failed push deliveries are retried with exponential backoff; subscriptions that return 410 Gone are deactivated.

## Analytics & instrumentation

Default to first-party event capture in the app's own Postgres database — no external analytics account or API keys required to ship. Create an `events` table with the following columns: `id` type `uuid` (primary key, default `gen_random_uuid()`), `user_id` type `uuid` (nullable, foreign key to the users table; null for anonymous/demo events), `name` type `varchar(120)` (indexed, e.g. `review_queue_opened`, `email_triaged`, `rule_created`, `item_archived`, `item_replied`, `mailbox_connected`, `category_bulk_archived`, `push_subscribed`, `subscription_started`), `occurred_at` type `timestamptz` (default `now()`, indexed), and `props` type `b` (small, non-PII payload such as `{"category":"marketing","confidence":0.82,"source":"ai"}`). Never put email addresses, subjects, sender names, or rule text in `props` — only categorical or numeric fields. Add a composite index on `(name, occurred_at)` for trend queries. Honor Do-Not-Track: the tracking helper checks `navigator.doNotTrack` and a server-side user preference flag; when set, the helper is a no-op. No third-party trackers (GA, Mixpanel, Segment) are loaded by default. A hosted provider (e.g. PostHog) is optional behind an env var `ANALYTICS_PROVIDER_URL` — when blank, events are written only to the local `events` table; when set, the same events are forwarded server-side via the helper. Implement a thin `track(name, props?)` server function called from API route handlers and server actions (not client-side pixels) so events are trusted and deduplicated. Key event fire points map to the PRD's success metrics and workflows: `review_queue_opened` (the primary success metric — daily Review queue opens), `email_triaged` with `{category, confidence, source: 'ai'|'rule'}`, `review_queue_cleared` (item archived or marked done), `item_replied`, `item_forwarded`, `email_composed`, `rule_created`, `mailbox_connected` with `{provider}`, `mailbox_reconnect_required`, `category_bulk_archived` with `{category, count}`, `low_confidence_flagged`, `push_subscribed`, `subscription_started` with `{plan}`, `demo_account_opened`. Build a simple admin metrics view (server-rendered, auth-gated to the account owner or an admin role) that queries the `events` table directly: show daily counts of `review_queue_opened` (the headline metric), triage throughput by category, queue clearance rate (cleared / triaged-important), rule-vs-AI override ratio, and a 30-day sparkline trend. No separate dashboard tool — just SQL aggregation queries rendered in a Next.js server component with a small table and inline SVG sparklines. Keep it lightweight: one table, one helper, one admin page.

## SEO & metadata

Triage Mail is a single-user SaaS application with an authenticated core — the Review queue, category folders, compose, settings, and stats screens are all behind login and must be `noindex`. The only public, indexable surfaces are the marketing/landing page, the pricing page, and the demo-account sign-up page. For each public page, server-render (Next.js App Router server components) with semantic HTML (`<h1>`, `<h2>`, `<article>`, `<nav>`) and set `<html lang="en">` at the root layout. Generate per-page `<title>` (under 60 chars) and `<meta name="description">` (under 160 chars) from real content — e.g. landing page: 'Triage Mail — AI email triage that surfaces only what matters'; pricing page: 'Triage Mail Pricing — monthly & yearly plans'; demo page: 'Try Triage Mail — explore a seeded demo inbox'. Include Open Graph tags (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`) and Twitter Card tags (`twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`) on public pages, with OG images served from `/public/og/`. Build canonical URLs and all absolute URLs (sitemap, OG `og:url`) from the request host using the `x-forwarded-host` header (or `host` header as fallback) — never hardcode `localhost` or a baked domain. A `buildCanonicalUrl(request, path)` helper constructs `https://${forwardedHost}${path}` and is used in every public layout's `<link rel="canonical">`. Generate `sitemap.xml` at build or request time listing only public routes (`/`, `/pricing`, `/demo`) with `lastmod` from content. Generate `robots.txt` allowing all crawlers on public paths and disallowing `/app/*` (the authenticated area), with a `Sitemap:` directive pointing to the absolute sitemap URL built from the request host. Add `<meta name="robots" content="noindex,nofollow">` to all authenticated layouts (Review queue, category folders, compose, settings, stats) and to any error/billing-webhook pages. For the demo account page, use `index,follow` since it is a public acquisition surface, but the demo inbox itself (once entered) is `noindex`. Ensure all public pages have fast LCP (server-rendered, minimal client JS) since Core Web Vitals matter for launch-platform discoverability (Product Hunt).

## Integrations

- OpenAI API — hosted LLM for per-email triage classification
- Gmail API — two-way sync, read mailboxes, send/reply/forward, Pub/Sub push notifications for new mail
- Microsoft Graph API — two-way sync, read mailboxes, send/reply/forward, change notification subscriptions for new mail
- Stripe Checkout + Billing — subscription checkout, webhook-driven billing state updates, payment ledger
- Web Push (VAPID) — important-email push notifications via service worker

## Multi-tenancy

Single shared Postgres database with tenant isolation via `user_id` on every row (EmailMetadata, ReviewQueueItem, TriageRule, ConnectedMailbox, TriageDecision, NotificationSubscription, TriageSummaryStat). Prisma query middleware enforces a mandatory `user_id` filter on all tenant-scoped models to prevent cross-tenant leakage. Each user may connect multiple mailboxes; the Review queue is unified across all connected accounts for that user. OAuth tokens are stored encrypted at rest, keyed per-user. Demo accounts are regular UserAccount rows flagged `is_demo` with seeded EmailMetadata and no real provider connections. Row-level security policies in Postgres provide a second layer of defense: each tenant-scoped table has a `USING (user_id = current_setting('app.current_user_id')::uuid)` policy set per request by the web/worker process.

## Non-functional requirements

- Performance: Review queue initial server-rendered load < 300ms p50 for a queue of up to 200 items; client-side archive/move actions feel instant (< 100ms optimistic update before worker confirmation).
- Scale target: 500 users, 25k emails/day, ~50k triage decisions/day at peak. Worker concurrency tunable per queue; horizontal scaling by adding worker replicas.
- LLM cost control: per-user daily email-processing counter; structured minimal prompt (metadata + snippet only, no body); cached rule parsing; alerting when per-user daily cost exceeds a threshold.
- Provider rate limits: token-bucket rate limiter in Redis per provider per user; exponential backoff on 429/503; dead-letter after 5 retries with user-visible 'sync paused' state.
- Security: OAuth tokens encrypted at rest (pgcrypto); all tenant-scoped queries filtered by user_id with Postgres RLS as backstop; HTTPS-only; webhook signature verification for Stripe, Gmail Pub/Sub, and Graph notifications.
- Privacy / GDPR: metadata-only storage minimizes PII; right-to-erasure deletes all user rows and purges provider-side cached prompts (OpenAI API retention disabled where possible); LLM payloads contain no email bodies.
- Reliability: two-way sync conflicts resolved by 'last writer wins' with provider message ID + modseq as idempotency key; reconnect banner surfaces auth failures within one sync cycle.
- Accessibility: WCAG AA, keyboard-first queue interactions, visible focus states, screen-reader-friendly list semantics — enforced via shadcn/ui primitives.

## Deployment

Three deployable units on lytma's managed platform: (1) **web service** — Next.js app (Node.js runtime) serving SSR pages, Route Handlers, and the service worker; (2) **worker service** — Node.js process running BullMQ consumers, scaled horizontally by replica count; (3) **platform services** — managed Postgres and Redis provisioned by lytma. Environments: `preview` (per-branch ephemeral, seeded with demo data), `staging` (integration with provider sandbox and Stripe test mode), `production`. CI/CD: Git push triggers build → Prisma migrate → deploy web and worker services; migrations run as a pre-deploy step against the target Postgres. Public web endpoint must be reachable for Gmail Pub/Sub, Graph change notifications, and Stripe webhooks; webhook URLs are environment-scoped. Secrets (OAuth client secrets, OpenAI key, Stripe key, VAPID keys, encryption key for tokens) injected as platform-managed environment variables.

## Technical risks

- Gmail/Graph API rate limits and token-refresh failures at 25k emails/day — mitigate with Redis token-bucket limiters, proactive token-refresh jobs, and dead-letter queues with user-visible 'sync paused' state.
- LLM cost scales linearly with email volume and could exceed subscription margin for heavy users — mitigate with minimal metadata-only prompts, per-user daily cost counters, and tiered processing (batch low-priority senders); monitor unit economics closely.
- Two-way sync race conditions when a user acts in a native client while the worker processes the same message — mitigate with provider modseq/message-ID idempotency keys and periodic full reconciliation jobs; accept 'last writer wins' for MVP.
- Plain-English rules engine is error-prone — translating natural language to reliable filter logic may misroute mail. Mitigate with LLM-assisted rule parsing cached per rule, a rule-preview/dry-run UI before activation, and always recording the AI decision alongside the rule override so users can audit.
- OAuth scope creep — reusing login OAuth for mailbox access is convenient but couples login failure with mailbox disconnection. Watch for scope revocation cascading into login problems; consider separating login-only vs mailbox-scoped tokens if this surfaces.
- GDPR right-to-erasure across metadata, LLM logs, and provider-side cached prompts — ensure deletion job purges all user rows, rotates/invalidates provider tokens, and that OpenAI retention settings are disabled; verify no email body is logged in triage prompts.
- Web Push delivery reliability — push subscriptions expire or are blocked by browser settings; important-only alerts may silently fail. Mitigate with subscription validation on each send and stale-subscription pruning, but accept that push is best-effort in MVP.
- Provider webhook reliability — Gmail Pub/Sub and Graph notifications require a publicly reachable, idempotent endpoint; missed webhooks mean delayed triage. Mitigate with periodic full-sync reconciliation jobs as a fallback, not just push-driven processing.

## Open technical questions

- What is the full catalog of default category folders, and can users create custom categories in v1?
- How are plain-English rules parsed into reliable filter logic — is there an NL-to-filter translation layer using the LLM, a structured builder, or both?
- What specific metadata fields are stored per email beyond sender, subject, date, category, flags, importance, and confidence (e.g., attachment info, thread IDs, labels)?
- What defines 'important' for the notification trigger — is it purely the AI classification, a confidence threshold, sender heuristics, user rules, or a combination?
- How are two-way sync race conditions handled when a user acts in their native Gmail/Outlook client while the app processes the same message?
- What is the LLM cost strategy for users receiving hundreds of emails per day — batching, tiered processing, or absorbed cost with usage caps?
- Do flagged low-confidence items appear in the Review queue in addition to their category folder, or only in the category folder?
- Do triage rules apply retroactively to already-triaged emails, or only to new incoming mail after the rule is created?
- What are the subscription price points for monthly and yearly plans, and is there a free trial duration?
- Is broader IMAP support (iCloud, Yahoo, Fastmail) in v1, or only Gmail and Outlook?
- What is the retry and conflict-resolution behavior when the original mailbox is temporarily unreachable during two-way sync?
- Cross-doc validation: PRD DemoUser 'Can' section says DemoUser can 'Try reply, forward, compose' but the permission matrix restricts those capabilities to User only — internal PRD contradiction; Tech Spec correctly follows the matrix.
- Cross-doc validation: PRD Demo account screen lists 'View and edit sample triage rules' as a DemoUser primary action, but the permission matrix grants DemoUser no triage-rule capabilities — internal PRD contradiction.
- Cross-doc validation: Tech Spec permission-enforcement prose says DemoUser sessions are restricted to the demo_accounts table and seed_data_snapshot, which conflicts with the PRD matrix granting DemoUser archive/mark-done/bulk-archive capabilities that require access to review_queue_items and email_metadata.
- Cross-doc validation: No dedicated demo-mode API endpoints for archive, mark-done, or bulk-archive actions; the existing endpoints are User-only and need DemoUser access per the PRD matrix, or separate demo endpoints are required.

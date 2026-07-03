# Assumptions & Decisions

Decisions made autonomously during the build. The PRD/TECH_SPEC win on
product/technical detail; these record where a choice was needed.

## Auth model
- **Credentialed email+password login is the always-works primary path** (BUILD_PROMPT
  requires a real credential login that works in preview with no external creds).
  Google/Microsoft OAuth exist too but can't complete in preview without real client
  IDs, so credentials guarantee login. Google login works in preview via the lytma
  OAuth broker when `OAUTH_BROKER_URL`/`OAUTH_BROKER_SECRET` are injected.
- **Auth.js uses JWT session strategy** (TECH_SPEC allows "JWT alternative"). This
  avoids adding Account/Session/VerificationToken tables (Credentials provider
  requires JWT anyway).
- **Added 3 fields to `user_accounts`** beyond the spec: `password_hash` (nullable,
  credentials login), `is_admin` (boolean, gates the admin metrics view — TECH_SPEC
  analytics section calls for an "auth-gated to the account owner or an admin role"
  page), and `is_demo` (boolean — TECH_SPEC multi-tenancy prose explicitly says
  "Demo accounts are regular UserAccount rows flagged is_demo"). `auth_provider` and
  `auth_provider_subject` are made nullable since credentials users have neither.

## Seeded accounts (gated on SEED_ON_BOOT)
- Primary user/admin: `admin@example.com` / `Admin!2345` (documented in PROGRESS.md).
  This is a real connected user with seeded mailboxes + triaged mail so the app is
  demoable immediately. It is also the admin for the metrics view.
- Demo account (PRD DemoUser): a UserAccount flagged `is_demo` with token `demo`,
  reachable at `/demo` without signup, 200+ seeded emails.

## Demo capabilities (resolving PRD internal contradiction)
- TECH_SPEC open questions flag that the PRD permission matrix and the DemoUser
  "Can" list disagree on reply/forward/compose. We follow the **PRD matrix**: demo
  users may view queue/folders/stats, archive, mark done, bulk-archive — all
  **simulated** (no provider calls). Reply/forward/compose in demo mode return a
  success toast "Demo mode: email not actually sent" without sending. This satisfies
  the PRD demo-screen expectation while never hitting real provider APIs.

## Stub modes (preview boots with no real keys)
- **OpenAI:** when `OPENAI_API_KEY` blank, triage uses a deterministic classifier
  based on sender/subject heuristics (returns category, importance, confidence,
  reason). Model recorded as `stub-heuristic`.
- **Stripe:** when `STRIPE_SECRET_KEY` blank, checkout returns an internal stub
  confirmation page URL and activates the subscription locally; webhooks accept a
  test-mode shortcut.
- **Providers (Gmail/Outlook):** OAuth uses placeholder client IDs — the connect
  flow builds correct redirect URLs but can't complete without real creds. The
  triage pipeline is exercised by enqueuing triage jobs with mock email payloads.
  Provider webhooks are stubbed.
- **VAPID:** if keys blank, a deterministic dev keypair is derived so push code runs
  (delivery is best-effort / no-op without a real subscription).

## Rich text & charts
- Compose editor: TipTap (`@tiptap/react` + starter-kit) — lightweight, matches the
  Next+shadcn stack.
- Stats charts: `recharts`.

## Local dev ports
- Postgres `localhost:5544`, Redis `localhost:6390` (defaults 5432/6379 are occupied
  by sibling builds on the shared host). Compose backing services bind NO host port.

## Rules parsing
- LLM-assisted parse (stubbed heuristic when OpenAI blank) converts plain-English
  rule text to `parsed_conditions` JSON (field/operator/value triples). Result is
  cached on the rule row. Rule evaluation at triage time is deterministic against
  sender/subject/domain, with Postgres FTS/pg_trgm available for keyword matching.

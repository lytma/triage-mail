# Triage Mail — Go-Live Checklist (lytma managed platform)

Three deployable units: **web** (Next.js), **worker** (BullMQ consumers), and the
managed **Postgres** + **Redis** platform services.

## 1. Provision platform services
- [ ] Create a managed **Postgres** database — lytma injects `DATABASE_URL`
      (a scoped, non-superuser role owning its own DB). Extensions
      (pg_trgm, unaccent, citext, pgcrypto, uuid-ossp, pgvector) are pre-provisioned.
- [ ] Create a managed **Redis** — lytma injects `REDIS_URL`.

## 2. Set environment variables (platform secrets)
Core (required):
- [ ] `AUTH_SECRET` — 32+ char random string
- [ ] `TOKEN_ENCRYPTION_KEY` — 32-char key (AES-256-GCM for OAuth tokens)
- [ ] `AUTH_TRUST_HOST=true` (derive URL from forwarded headers)

Integrations (set for full functionality; blank ⇒ stub/disabled):
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` — login + Gmail
- [ ] `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` (may reuse GOOGLE_*), `GMAIL_PUBSUB_TOPIC`, `GMAIL_WEBHOOK_TOKEN`
- [ ] `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` — login + Outlook
- [ ] `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) — real AI triage
- [ ] `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — web push
      (generate once: `npx web-push generate-vapid-keys`)
- [ ] `SEED_ON_BOOT=false` in production (true only for demo/preview)

Run `./scripts/check-env.sh production` to validate.

## 3. Database migrations
- [ ] Migrations run automatically in the web entrypoint (`prisma migrate deploy`),
      or run manually: `./scripts/deploy.sh` / `npx prisma migrate deploy`.

## 4. Deploy services
- [ ] **web**: built from `Dockerfile`, exposes container port 3000, entrypoint
      runs migrations then `node server.js`. Must be publicly reachable (webhooks).
- [ ] **worker**: built from `Dockerfile.worker`, command `tsx src/workers/index.ts`.
      Scale by replica count. Never serves HTTP.

## 5. Configure webhooks (production URLs)
- [ ] **Stripe**: add endpoint `https://<host>/api/webhooks/stripe`, subscribe to
      `customer.subscription.*`, `invoice.*`, `charge.refunded`; put signing secret
      in `STRIPE_WEBHOOK_SECRET`.
- [ ] **Gmail Pub/Sub**: create a topic + push subscription to
      `https://<host>/api/webhooks/gmail?token=<GMAIL_WEBHOOK_TOKEN>`; grant Gmail
      publish rights; call `users.watch` per connected mailbox.
- [ ] **Microsoft Graph**: create change-notification subscriptions to
      `https://<host>/api/webhooks/outlook` with `clientState` = mailbox id.

## 6. OAuth redirect URIs (provider consoles)
- [ ] Google: `https://<host>/api/auth/callback/google` (login) and
      `https://<host>/api/connected-mailboxes/callback` (mailbox connect).
- [ ] Microsoft: `https://<host>/api/auth/callback/microsoft-entra-id` and
      `https://<host>/api/connected-mailboxes/callback`.

## 7. Smoke test
- [ ] `GET /api/health` → 200
- [ ] Landing `/`, `/pricing`, `/demo` render (indexable), `/sitemap.xml`, `/robots.txt`
- [ ] Sign in (credentials), open `/review`, `/settings`, `/stats`
- [ ] Connect a real mailbox → metadata syncs within ~60s
- [ ] Worker logs show queues registered and jobs processing

## Notes
- Only email **metadata** is persisted — never body content.
- Web tier never calls OpenAI/provider APIs directly; all async work is queued.
- Tenant isolation: every query is scoped by `user_account_id` from the session.

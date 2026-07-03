# Build Progress — Triage Mail

Resume by reading this file + CLAUDE.md + PRD.md/TECH_SPEC.md. Continue from the
first unchecked milestone. Do NOT redo checked milestones.

## Seeded credentials (preview only, gated on SEED_ON_BOOT)
- Primary user / admin: `admin@example.com` / `Admin!2345`
- Demo account: `/demo` (token `demo`) — no signup required

## Milestones

- [x] **0. Scaffold prep** — Next.js + Prisma + Tailwind + deps, config, docs, dev DB/Redis, prep commit
- [x] **1. Prisma schema, worker skeleton, base tooling** — schema validates + migrates, worker boots, build passes, home renders. (Auth.js config + sidebar shell pending in M1/M2.)
- [x] **2. Auth, roles, tenant isolation** — credentials+Google+MS login, demo session, Prisma tenant middleware + RLS, reconnect banner, noindex
- [x] **3. Review queue + category folder CRUD** — endpoints + screens, keyboard shortcuts, multi-select, bulk-archive, optimistic undo
- [x] **4. Triage engine** — rules parse/eval, OpenAI (stub) classify, triage worker pipeline, low-confidence, stats rollup
- [x] **5. Mailbox connect + sync + two-way actions** — provider adapters, OAuth, webhooks, mailbox-action/sync-back/token-refresh workers
- [x] **6. Compose/reply/forward + rules UI + Settings** — compose endpoints+screen, rules CRUD UI, full settings, notif endpoints
- [x] **7. Web push + stats dashboard + demo account** — web-push worker, service worker, stats screen, demo seeding
- [x] **8. Stripe billing + marketing/SEO + analytics** — checkout/webhook, landing/pricing/demo pages, sitemap/robots, admin metrics, trial lifecycle
- [x] **9. Tests, seed data, polish** — integration tests, seed script, a11y pass, PWA manifest
- [x] **10. Deployment packaging + preview** — Dockerfiles, single docker-compose, scripts, .env.preview, DEPLOY.md, prod smoke test

## Status: COMPLETE ✅ (all 10 milestones)

Verified:
- `npm run build` passes (45 routes), `tsc` 0 errors, `npm test` 15/15 pass.
- Production smoke test: all public + authenticated routes 200 with real seeded
  data, no leaked placeholders/i18n keys, demo public access works.
- Triage pipeline E2E: mock email → classified important → EmailMetadata +
  TriageDecision + ReviewQueueItem + web-push job (worker verified).
- Full docker-compose stack: builds both images, migrate init service seeds
  (330 emails), web healthy on ephemeral port, worker consumes; idempotent
  re-run no-ops; postgres/redis have NO host ports; no browser-facing localhost.
- WCAG AA contrast verified on badges/banners.
- Adversarial review pass: found + fixed 1 bug (replied/forwarded items must
  stay in the Review queue).

## Notes
- Stub modes active: OpenAI, Stripe, providers, VAPID (preview boots with no real keys).
- Dev services: docker `triage-pg` (5544), `triage-redis` (6390).
- Boot: `./scripts/preview.sh` (clean clone → healthy, seeded, one port).
- Deploy: `deploy/DEPLOY.md` checklist; `./scripts/deploy.sh`.

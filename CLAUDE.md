# Triage Mail — Agent Guide

> This file is the source of truth for how the project is built. `AGENTS.md` is a
> pointer to this file. Read it before working. Product/technical detail lives in
> `PRD.md` + `TECH_SPEC.md` (authoritative); design in `DESIGN_SPEC.md`.

## What this is

A web-based email client that unifies Gmail + Outlook and runs an AI triage
agent surfacing only important mail in a prioritized Review queue. Single-user
SaaS, subscription-billed. **Only email metadata is persisted — never body content.**

## Stack

- **Web/API:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3 + shadcn/ui
- **Worker:** standalone Node.js process via `tsx src/workers/index.ts`, BullMQ on Redis
- **DB:** Postgres (Prisma ORM). Extensions: pg_trgm, unaccent, citext, pgcrypto, uuid-ossp
- **Auth:** Auth.js (NextAuth v5) — Credentials (email+password) + Google + Microsoft, JWT sessions
- **LLM:** OpenAI (stub mode when `OPENAI_API_KEY` blank — deterministic heuristics)
- **Billing:** Stripe (stub mode when `STRIPE_SECRET_KEY` blank)
- **Push:** web-push (VAPID)

## Directory layout

```
prisma/                     schema.prisma, migrations/, seed.ts, seed-assets/
src/
  app/                      Next.js App Router
    (marketing)/            public pages: /, /pricing, /demo (indexable)
    (app)/                  authenticated app shell: review, folders, compose, settings, stats, admin
    api/                    Route Handlers (CRUD, webhooks, auth)
  components/               React components (ui/ = shadcn primitives)
  server/
    db/prisma.ts            Prisma singleton
    lib/                    env.ts, crypto.ts, analytics.ts, auth helpers
    providers/              gmail.ts, outlook.ts adapters
    queues/                 queues.ts (definitions), workers/ (processors)
    services/               triage engine, rules parser, stats aggregation
  workers/index.ts          worker tier entry
  lib/utils.ts              cn() etc.
scripts/                    preview.sh, check-env.sh, deploy.sh
```

## Commands

- Install: `npm install`
- Dev web: `npm run dev`  •  Dev worker: `npm run worker:dev`
- Build: `npm run build`  •  Typecheck: `npm run typecheck`  •  Test: `npm test`
- Migrate (dev): `npm run prisma:migrate`  •  Deploy migrations: `npm run prisma:deploy`
- Seed: `npm run seed`

## Local services

Dev Postgres + Redis run as docker containers on non-default host ports (5432/6379
are used by other builds on this host):
- Postgres: `localhost:5544` (user/pass/db = triage)
- Redis: `localhost:6390`

`.env` / `.env.local` point at these. Containers: `triage-pg`, `triage-redis`.

## Conventions & guardrails

- **Match the TECH_SPEC Prisma data model exactly.** Table/column names use `@map`
  to snake_case. Enums match spec. (Auth fields passwordHash/isAdmin/isDemo are the
  only additions — see ASSUMPTIONS.md.)
- **Metadata only** — never persist email bodies. Bodies are fetched transiently
  in the worker for LLM triage then discarded.
- **Tier boundaries:** web NEVER calls OpenAI/provider sync APIs directly — enqueue
  BullMQ jobs. Worker NEVER serves HTTP.
- **Tenant isolation:** every tenant-scoped query filtered by `userAccountId` from
  session. Helper: `requireUser()` / `getSessionUser()` in `src/server/lib/auth.ts`.
- **Side-effecting services stub when keys absent** (OpenAI, Stripe, providers, push).
- **Rules override AI** on new incoming mail only, never retroactively.
- **Self-URL:** derive origin from `x-forwarded-proto`/`x-forwarded-host` — never
  hardcode localhost. Client uses relative URLs. `AUTH_TRUST_HOST=true`.
- **Env-driven everything.** No hardcoded hosts/keys/ports. Browser URLs use
  `PREVIEW_*_PORT`, never `localhost:<fixed>`.
- Design tokens are CSS vars in `globals.css` wired into `tailwind.config.ts`.

## Seeded credentials (preview only, gated on SEED_ON_BOOT)

- Primary user/admin: `admin@example.com` / `Admin!2345`
- Demo account: accessible at `/demo` (or token `demo`) without signup

## Category slugs (fixed catalog)

`fyi`, `newsletters`, `marketing`, `receipts`, `automated_notifications`
(Classification enum uses singular: important, fyi, newsletter, marketing, receipt, automated_notification.)

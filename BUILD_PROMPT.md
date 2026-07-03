# Build Prompt — Triage Mail

> **Before you start:** save the Product Requirements Document and Technical Specification as `PRD.md` and `TECH_SPEC.md` in your project folder — this prompt directs the agent to read them. Then paste this entire message into Claude Code as your first prompt from that folder. Run with auto-accept (or `--dangerously-skip-permissions` in a sandbox) so it proceeds without pausing, and keep the session open until it reports the app builds and runs.

## Your mission

You are an autonomous senior software engineer. Build a complete, runnable application — **Triage Mail**: A web-based email client that unifies Gmail and Outlook mailboxes with an AI triage agent that surfaces only important mail in a prioritized Review queue. — exactly as specified by the Product Requirements Document (`PRD.md`) and Technical Specification (`TECH_SPEC.md`) in this repository. Do not stop until the app builds, runs, and satisfies the acceptance criteria below.

## Reference documents

The complete specification lives in these files at the repository root — they are the source of truth:
- `PRD.md` — the Product Requirements Document: users, roles, workflows, screens, data model, scope.
- `TECH_SPEC.md` — the Technical Specification: architecture, data model, API, stack, and decisions.
- `DESIGN_SPEC.md` — the AUTHORITATIVE design system. It contains the design tokens (CSS variables), an optional "Editor overrides" CSS block, AND the **chosen landing mockup HTML**. Apply it APP-WIDE: wire its tokens into the framework theme and use them on every screen; **replicate the chosen mockup's layout, sections, nav, and footer for the landing/marketing page — match it closely.** If it has an "Editor overrides" CSS block, include that stylesheet GLOBALLY and load it AFTER your base styles — those are the founder's explicit final tweaks and must win. **Use the committed brand assets under `docs/brand/` (logo, hero) — copy those exact files into the app and reference them; do not regenerate or substitute them.** It overrides any default styling; do not invent a separate palette.

Read them in full while planning, and re-consult the relevant sections as you implement each milestone. If anything here conflicts with them, the documents win on product/technical/visual detail and this prompt wins on *how to work*.

## How to work (read this first)

- **Start in plan mode.** Read `PRD.md` and `TECH_SPEC.md` in full, then produce a concrete, phased implementation plan that follows the milestones in this prompt. Confirm the plan to yourself, exit plan mode, and begin executing — do not wait for further input.
- **Keep going automatically.** Operate in auto-accept / accept-edits mode. Make progress continuously; only stop when every milestone is complete and the acceptance criteria pass. If you hit an ambiguous decision, choose the most reasonable option, record it in `ASSUMPTIONS.md`, and keep moving — never block waiting for a human.
- **Never end the session to ask a question.** You are running unattended — no one can answer, so ending your turn on a question ("want me to continue?", "should I prioritize X?") silently kills the build. A status checkpoint is not an exit: the answer is always to continue with the next unchecked milestone. End only when every milestone in `PROGRESS.md` is checked off, or a hard external blocker makes progress impossible (record it in `PROGRESS.md` and state it plainly).
- **Use subagents to parallelize.** For each milestone, spin up focused subagents for independent workstreams (e.g. data layer, backend API, frontend, tests) so they run concurrently, then integrate their results. Also use a subagent as an adversarial reviewer to check each milestone before you move on.
- **Write the agent guide early — as BOTH `CLAUDE.md` and `AGENTS.md`.** Capture the chosen stack, directory layout, commands (install / dev / build / test), and conventions so every subagent stays consistent. Write the same content to both files (or make one a pointer to the other) so the project is portable across coding agents (Claude Code reads `CLAUDE.md`; Codex and most others read `AGENTS.md`).
- **Work milestone by milestone, and keep it runnable.** Finish one milestone before starting the next. After each, run typecheck, build, and tests; fix everything until green before continuing — this verify-until-green loop is mandatory.
- **Re-ground at each milestone.** At the start of every milestone, re-read the relevant sections of `PRD.md` / `TECH_SPEC.md` instead of relying on memory — context may have been compacted since you last read them. The files are the source of truth; consult them, don’t recall them.
- **Track progress on disk, not in memory.** Maintain a `PROGRESS.md` with the milestone checklist (plus the `ASSUMPTIONS.md` you keep), and update both after every milestone. If the session is compacted or restarted, rebuild your bearings by reading `PROGRESS.md`, `CLAUDE.md`, and the spec files — never assume you still remember earlier decisions.
- **Verify, don’t assume — and verify in PRODUCTION mode, not just dev.** Run the production build, then BOOT the built app and smoke-test the real routes end to end: open every key page/flow and confirm each returns 200, renders with no server error, AND shows real content — no placeholder or untranslated strings leaking (e.g. raw i18n keys like `Namespace.key`), checked in every supported locale. `next dev` (or any dev server) is NOT sufficient. A whole class of failures only surfaces in a production build at render time — React Server/Client Component manifest errors, SSR-only crashes, bundler/barrel-import quirks — and another class (e.g. a client i18n provider missing its messages) renders a clean 200 while showing raw keys; both are invisible to the dev server, type-check, and unit tests. Write and run tests for core flows. Only treat a milestone as done when its "done when" checks below actually pass.
- **Commit early and at every milestone.** `git init` is already done. Make your FIRST commit as soon as the scaffold/tooling and `PROGRESS.md` exist (a "prep" commit), before deep implementation — so even setup work survives an interruption. Then commit after each milestone with a clear message, and ALWAYS include the updated `PROGRESS.md` (and `ASSUMPTIONS.md`) in that commit. A re-run resumes from your last commit; anything uncommitted is lost.
- **If `PROGRESS.md` already has milestones checked off when you start, you are RESUMING** — read it plus the existing code, do NOT redo completed milestones, and continue from the first unchecked one.

## Accounts, admin & sign-in — IDENTICAL across every app THAT HAS ACCOUNTS

**Applies ONLY if this app has user accounts / sign-in.** If the app has no accounts at all (e.g. a single-player game, a static informational site, a personal/local tool), SKIP this section entirely — no login screen, no admin, no demo accounts, no seeded users. When the app DOES have accounts, do authentication the SAME way every time; do not invent your own variation:

### Real credentialed login — never a bypass
- Sign-in is ALWAYS a real **email + password** login (plus, optionally, "Sign in with Google" per the Google guidance). Passwords are hashed (bcrypt/argon2).
- **NEVER add an auto-login, a "demo"/"guest"/"continue as admin" route or button that creates a session WITHOUT credentials, or any dev bypass.** Every session comes from a real credential check. Do NOT create `/api/auth/demo`-style auto-session endpoints.

### A seeded PRIMARY ADMIN with known credentials
- If the app has ANY admin capability or user roles, seed exactly ONE primary admin on boot (idempotent — create only if absent).
- Credentials: use the **founder-specified** admin email + password when the product spec provides them; otherwise default to `admin@example.com` with the known strong password `Admin!2345`. Document whichever you used.
- These are INITIAL credentials: the signed-in admin can **change their own email and password** from an account/settings screen. They are the starting login, not a permanent hardcode.
- This credentialed admin login MUST work regardless of whether Google login also exists — there is ALWAYS a way to log in and manage the app.

### Surface the credentials (preview only)
- On the sign-in screen, in preview, show a small dismissible hint listing the seeded admin email + password (and any demo accounts) so the user knows how to get in. Hide it in production (gate on a preview/seed flag, not the build).
- Also record the seeded credentials in `PROGRESS.md`.

### Demo accounts — ONE consistent pattern, INCLUDED BY DEFAULT
- **By default (the standard for every emitted app that has accounts): seed demo accounts and add a "Demo accounts" link on the sign-in page** that opens a small list of the seeded accounts (the admin + one account per distinct role). This makes the app immediately runnable/testable out of the box.
- Clicking an entry **fills that account's email + password into the login form** — the user still presses Sign in. It is a convenience PREFILL, NEVER an auto-login.
- Omit the link and the seeded demo (non-admin) accounts ONLY if the spec EXPLICITLY says demo accounts are not wanted. Either way this is the ONLY demo-account mechanism — never an auto-login, a hardcoded dropdown elsewhere, or another style.

## Authentication — "Sign in with Google" (only if this app offers Google login)

Make Google sign-in work in BOTH the lytma preview AND a real production deploy,
chosen at runtime by environment variables. Never hardcode client IDs, secrets,
or URLs, and never commit secrets.

**Production — the user's OWN Google client (leave blank; outside scope).** Read
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` from the env; when
they are set, run the standard direct Google OAuth 2.0 code flow against the
user's own client. Leave these BLANK in `.env.preview` and present-but-empty in
`.env.example` — the user fills them in when they deploy. Do NOT attempt to create
or provision Google credentials.

**Preview — lytma's shared broker (no Google credentials needed).** When
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are NOT set but `OAUTH_BROKER_URL` IS set
(lytma injects it into the preview container — you do NOT add it to docker-compose),
route Google login through the broker:
1. The "Sign in with Google" button sends the browser to
   `${OAUTH_BROKER_URL}/google/start?app_redirect=<APP_CALLBACK>&nonce=<NONCE>` —
   where `APP_CALLBACK` is THIS app's own absolute https callback URL, derived from
   the incoming request host (the preview host is dynamic), URL-encoded; and `NONCE`
   is a random value you store in a short-lived, httpOnly cookie.
2. Your callback receives `?broker_token=<JWT>`. VERIFY it before trusting it:
   HS256 signature using `OAUTH_BROKER_SECRET`; `exp` not in the past; `aud` equals
   this app's own host; and `n` equals the nonce cookie you set. On success the JWT
   carries `sub`, `email`, `email_verified`, `name`, `picture` — use them to
   find-or-create the user and create your app's OWN session (exactly as you would
   for email/password). Then clear the nonce cookie.
3. If the broker returns `?broker_error=...`, show a friendly "could not sign in".

**Neither set:** hide the Google button entirely (do not render a dead control).
Read `OAUTH_BROKER_URL`, `OAUTH_BROKER_SECRET`, and the `GOOGLE_*` vars from the
runtime environment.

After a successful sign-in, redirect using the SELF-URL rules below — NOT a
baked or `localhost` URL — or the user lands on the wrong host.

## Knowing the app's own URL (preview hosts are dynamic — do this right)

This app may run at a build-time-unknown, per-deploy host (the lytma preview
serves it at `https://app-<id>.<domain>` behind a TLS-terminating reverse proxy).
So NEVER hardcode, bake, or assume the app's own origin. Concretely:

- **Server-side redirects & absolute URLs:** derive the origin from the incoming
  request — `x-forwarded-proto` + `x-forwarded-host` (fall back to the `host`
  header), NOT from `req.nextUrl`/`req.url` (which can be the internal
  `localhost:3000`) and NOT from a baked env var. Use that derived origin for
  EVERY redirect, including post-login. (A common bug: computing the forwarded
  origin for one check but then redirecting relative to `req.nextUrl`.)
- **Client-side:** prefer RELATIVE URLs (`/account`), or `window.location.origin`
  for absolute ones. Do NOT rely on a `NEXT_PUBLIC_*_URL` baked at build time for
  the app's own origin — in preview it is `localhost` and wrong.
- **Framework auth (NextAuth/Auth.js etc.):** enable host trust (`trustHost: true`
  / `AUTH_TRUST_HOST=true`) so it derives the URL from forwarded headers; do not
  pin `AUTH_URL`/`NEXTAUTH_URL` to a fixed host for redirect computation.
- lytma injects `APP_URL`/`AUTH_URL`/`PREVIEW_PUBLIC_URL` = the live preview
  origin at runtime (you need NOT add them to compose). Prefer the forwarded
  host; these are a correct fallback. In `.env.preview` leave any self-URL var
  blank or set to the proxy origin — never a literal `localhost` that ships to
  the browser.

## Auth-reflecting UI must read the session at request time

Any UI that changes with whether the visitor is signed in — the header/nav auth
control, account/avatar menu, "my account / wallet / orders" links, sign-in vs
sign-out buttons, or personalized content — MUST read the CURRENT session per
request and render from it. Do not render the signed-out controls as a static
default.

- **Read the session server-side, per request.** Read the auth cookie/session in
  the component (or layout) that renders the auth UI. If the framework would
  cache it, opt that route/segment into dynamic rendering (in Next.js: reading
  `cookies()`/`headers()` makes it dynamic, or `export const dynamic =
  "force-dynamic"`) so it reflects the live request, not a build-time snapshot.
- **One source of truth, mutually exclusive.** Render EITHER signed-in controls
  (account link + a single Sign out) OR signed-out controls (Sign in + Register)
  — never both at once, and never two components each rendering half of it.
- **Update immediately after login/logout.** When a sign-in or sign-out changes
  the session, make the shell re-render (refresh/revalidate) so the nav flips
  right away instead of showing a stale state until the next hard navigation.

## Analytics, SEO & reporting (build these in by default)

Unless the spec explicitly says otherwise, include the following as sensible,
low-friction defaults — the founder should get them without configuring anything.

### Product analytics (first-party, privacy-respecting)
- Track a small, meaningful set of events — page/screen views plus the few
  KEY actions for THIS product (e.g. signup, listing posted, message sent,
  purchase, search). Pick events from the PRD's core workflows; do not track
  everything.
- Store events in the app's OWN database (a simple `events` table:
  name, timestamp, optional userId, and a small JSON `props`). This is
  self-contained, so it works in preview with NO external account or key.
- Be privacy-respecting: no PII in event props, honor Do-Not-Track, no
  third-party trackers by default. If a hosted analytics provider is wanted in
  production, make it OPTIONAL behind an env var (e.g. `ANALYTICS_WRITE_KEY`) —
  blank disables it; first-party tracking still works.
- Surface the data: a small **admin metrics view** showing the key counts and
  recent trend (e.g. signups, active users, top events over the last 7/30 days).
  Plain numbers + a simple chart — no heavy BI.

### SEO (for public-facing pages)
- Per-page `<title>` and meta description derived from real content; Open Graph
  + Twitter card tags so shared links render a preview.
- A canonical URL on each page, and absolute URLs (sitemap, OG) built from the
  REQUEST host (forwarded host) — never a baked `localhost`.
- Generate `sitemap.xml` (key + dynamic public routes) and `robots.txt`.
- Server-render (or statically generate) public, indexable pages; use semantic
  HTML and meaningful headings. Set the page language.
- Skip indexing for private/authenticated areas (`noindex`).

### Reporting / exports
- Where the PRD calls for reports or data exports, give an admin a simple way to
  view and export the relevant records (CSV is enough). Reuse the analytics
  metrics view rather than building a separate reporting stack.

Keep all of this lightweight and dependency-light — these are defaults, not a
data platform. Do not block the core product on them.

## lytma platform services — the managed backend (build on these; don’t bundle alternatives)

The app deploys on lytma’s managed backend, which provides these shared,
per-project, managed services — reached ONLY through env, like a cloud provider:

**Ports — lytma owns ALL host-port binding; never hardcode one.** The web/app service must
EXPOSE only its container port — `expose: ["3000"]`, or container-only `ports: ["3000"]` — and
NEVER a host mapping like `3000:3000` or `127.0.0.1:3000:3000`. Backing services bind NO host
port at all (internal-only). lytma assigns a free host port in dev and routes via the proxy in
prod; a hardcoded host port is discarded at best and collides at worst.

- **Postgres** (`DATABASE_URL`) — the relational database, with capabilities
  pre-provisioned, so use Postgres for them INSTEAD of a separate service:
  - **Full-text search → Postgres FTS BY DEFAULT** (`tsvector` + GIN, `pg_trgm`
    for fuzzy/typo). This covers search in almost every app, where search is a
    feature, not the product. A dedicated search engine (Meilisearch /
    Elasticsearch / Typesense) is warranted ONLY when search IS the core
    product — typo-tolerant instant/as-you-type search, deep relevance tuning,
    or search at large scale. In that (rare) case, justify it in ASSUMPTIONS.md
    and follow the SHARED-SEARCH convention so lytma runs ONE managed instance
    for it: **prefix every index/collection name with the `MEILI_INDEX_PREFIX`
    env value** (e.g. `` `${MEILI_INDEX_PREFIX}listings` ``) and authenticate
    with the **`MEILI_API_KEY`** env — lytma injects `MEILI_URL`, a per-project
    scoped `MEILI_API_KEY`, and `MEILI_INDEX_PREFIX`, and stands in your bundled
    Meili. Keep the bundled `meilisearch` service in your compose for local dev;
    do NOT add a search engine just for ordinary search.
  - **Vectors / embeddings / similarity → `pgvector`** (the `vector` type +
    ivfflat/hnsw indexes) — covers semantic search / RAG / recommendations.
    Only at a scale pgvector genuinely cannot serve is a dedicated vector DB
    warranted; default is pgvector.
  - Extensions postgis, ltree, pg_trgm, pgcrypto, uuid-ossp, citext, hstore,
    unaccent are present — `CREATE EXTENSION IF NOT EXISTS` (it no-ops).
- **Object storage** (`S3_*`, S3-compatible) — files, images, uploads (full
  contract below).
- **Cache / queue** (`REDIS_URL`) — caching and background-job queues (BullMQ etc.).

Rules:
- Default to THIS catalog: search = Postgres FTS, vectors = pgvector, files = S3,
  cache/queue = Redis. Don’t add a parallel service for something the catalog
  already covers UNLESS that capability is the product’s core (per the search
  note above) — an unmanaged extra container for ordinary needs is waste.
- **Need a backing service the catalog does NOT cover** (e.g. a message broker, a
  specialized engine, a protocol-specific dependency)? Don’t silently bundle it —
  declare it so lytma runs it as a managed shared service, the same way it runs
  Postgres/storage:
  1. add it to your single `docker-compose.yml` as a normal service (official
     image, internal-only, no host port) so local dev works;
  2. reach it ONLY via an env var (`<NAME>_URL` or host/port/creds — never
     hardcoded), so the endpoint can be swapped for the managed instance; and
  3. record it in `ASSUMPTIONS.md` AND in a `lytma.services.json` manifest at the
     repo root, e.g.
     `{ "extraServices": [ { "name": "rabbitmq", "image": "rabbitmq:3", "envVar": "AMQP_URL", "purpose": "task queue" } ] }`.
  lytma reads that manifest and provisions a shared, per-project instance with
  injected creds — so it persists and scales like the other rented services. Do
  NOT depend on a bundled container to hold persistent data.

### Preview / demo seeding (so demo data + demo-credential UI actually appear)

Previews are demos. lytma sets **`SEED_ON_BOOT=true`** in every preview (via the
process env, which outranks all `.env` files), so make that the canonical switch:
- Gate demo seeding AND any "demo credentials" UI on **`SEED_ON_BOOT`**. Keep the
  seed idempotent / seed-when-empty; production keeps `SEED_ON_BOOT` false, so the
  demo data + UI appear in previews and never in production.
- Read it at RUNTIME, not baked at build: a Next.js server component that reads
  it must be dynamic (`export const dynamic = 'force-dynamic'`), or the value
  freezes at build time and the demo UI never renders even when the flag is true.
- For any OTHER preview-only env, put it in **`.env.preview`** (lytma makes it
  AUTHORITATIVE for the preview). Do NOT gate preview behavior on
  `environment: FLAG: ${FLAG:-true}` in compose — `${FLAG}` interpolates from
  `.env` (often `false`) and shadows `.env.preview`; use `env_file` or a literal.

### Object storage contract (when the app stores images / files)

Configure S3-compatible storage ENTIRELY from env, using these EXACT names:
- `S3_ENDPOINT` — the S3 API URL the SERVER uses (e.g. an internal host).
- `S3_PUBLIC_ENDPOINT` — the BROWSER-facing base URL for objects (may differ
  from `S3_ENDPOINT`; used to build public/presigned URLs the browser loads).
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`,
  `S3_FORCE_PATH_STYLE` (true for MinIO-style path addressing).

- The app MUST run identically against an EXTERNAL S3 (different host, a single
  shared bucket, scoped creds) using ONLY those env vars — never hardcode an
  endpoint/bucket/keys, and never assume the bundled MinIO is reachable. A
  bundled MinIO in compose is fine for LOCAL dev, but the app must not REQUIRE it.
- Build browser image URLs from `S3_PUBLIC_ENDPOINT` (path-style:
  `${S3_PUBLIC_ENDPOINT}/${S3_BUCKET}/${key}`), or presign with the PUBLIC
  endpoint so the signature matches the host the browser hits. Make the bucket
  public-read for demo media or use presigned URLs — never link the internal
  `S3_ENDPOINT` to the browser.
- **Seed demo media from the APP** (seed routine / web or worker entrypoint),
  uploading to the configured S3 via the SDK — so seeding works against ANY S3
  endpoint. Do NOT rely solely on a one-shot `minio/mc` init container targeting
  a local minio (that breaks against external storage); a bucket-creation init is
  fine but must be optional (the bucket may already exist).
- Do not block startup on the bundled MinIO being healthy beyond a short wait;
  read the S3 config and connect lazily.
- **Demo images: prefer REAL generated photos, declared for lytma to fill.** For
  each seeded item that shows an image (a listing/product/tool photo, a cover, an
  avatar), add ONE entry to `docs/seed-assets/manifest.json` — a JSON array of
  `{ "file": "<repo-root-relative path INSIDE your API build context, e.g.
  apps/api/prisma/seed-assets/tool-1.jpg>", "prompt": "<one-line realistic photo
  description of THIS specific item>" }`. lytma generates a real photo into each
  `file` after the build (via its image tool), so your seed just reads that file
  and uploads it like any image. ONE image per posting — keep the list small, a
  handful of realistic photos, not 5 per item. Make sure the seed-assets directory
  is COPY'd into your API Docker image so the files exist at seed time.
- **Offline-safe fallback (never break the demo).** If a declared `file` is absent
  at seed time (image tool unavailable), generate a deterministic local placeholder
  instead (Sharp/canvas) — do NOT fetch demo photos from an external host
  (loremflickr / unsplash / picsum) at seed time; those are flaky and a failed
  fetch silently degrades the demo to blank tiles. A reseed must always produce a
  valid image for every seeded reference, with no runtime network dependency.

## Database — Postgres, env-driven, managed-instance ready

Use **Postgres** and configure it ENTIRELY from `DATABASE_URL` (a standard
`postgresql://user:pass@host:5432/db?schema=public`). The app MUST run unchanged
against an EXTERNAL managed Postgres (a provisioned database + a scoped login
role on a shared instance) using only that env var:

- **Adapt the injected `DATABASE_URL` to YOUR stack's driver — do not assume the
  verbatim URL "just works."** The injected URL is a standard, Prisma-flavored
  `postgresql://user:pass@host:5432/db?schema=public`. Many non-Prisma stacks will
  CRASH ON BOOT if handed it as-is, because the bare `postgresql://` scheme selects
  a default driver they have NOT installed, and `?schema=public` is a Prisma-only
  param other drivers reject. At startup, normalize the URL to what your driver
  expects and strip params it cannot use. Concretely:
    - SQLAlchemy + psycopg 3 → rewrite `postgresql://` to `postgresql+psycopg://`
      (a bare `postgresql://` picks the psycopg2 dialect, which you likely did NOT
      install → `ModuleNotFoundError: psycopg2`), and DROP `?schema=public`.
    - SQLAlchemy + asyncpg → `postgresql+asyncpg://`; Django → its own DB config
      from the URL; Rails → `postgres://` in `database.yml`; Go `pgx`/Node `pg`/
      Prisma → use it as-is.
  Install the matching driver in your dependencies, and normalize the scheme in ONE
  place (your settings/config) so both the app and your migration tool use it.
- Never hardcode the host/db/credentials, and never assume a bundled Postgres
  container is reachable. A bundled Postgres in docker-compose is fine for LOCAL
  dev, but the app must not REQUIRE it (previews run against a shared instance).
- **The DB role is NOT a superuser.** It owns its own database (so CREATE
  TABLE / ALTER / migrations work), but must not need superuser/owner-of-cluster
  privileges — do NOT rely on `CREATE ROLE`, `CREATE DATABASE`, `ALTER SYSTEM`,
  or installing untrusted extensions at runtime.
- **Extensions are pre-provisioned.** The shared instance ships postgis, ltree,
  pgvector (`vector`), pg_trgm, pgcrypto, uuid-ossp, citext, hstore, unaccent.
  Reference them with `CREATE EXTENSION IF NOT EXISTS <name>` in your migrations
  — that no-ops when already present (a non-superuser can run it then). If you
  truly need a different extension, say so in ASSUMPTIONS.md (it gets added to
  the shared image); do not assume you can install arbitrary extensions.
- Run schema changes via real migrations (e.g. `prisma migrate`/SQL), idempotent
  and re-runnable. Seed data idempotently (seed only when empty / upsert) so a
  relaunch against a persistent database does not duplicate or clobber rows.
- Do not block startup on the bundled Postgres being healthy beyond a short
  wait; read `DATABASE_URL` and connect (with a brief retry) instead.

## Build performance (Docker image) — cache-friendly + concurrency-safe

Previews are built with BuildKit, and multiple projects build concurrently on
one shared daemon. Make the image build fast and isolated:

- **Multi-stage, deps before source.** Stages: `base` → `deps` (install only) →
  `build` → `runner`. Copy the lockfile and install deps BEFORE copying source
  so a code-only change reuses the dependency layer.
- **BuildKit cache mounts — with the right `id`:**
  - Dependency download/store cache is global and SAFE TO SHARE across apps —
    give it a stable shared id, e.g.
    `RUN --mount=type=cache,id=npm,target=/root/.npm npm ci --include=dev`
    (pnpm: `id=pnpm-store,target=/pnpm/store`).
  - Framework BUILD cache (`.next/cache`, Vite, etc.) is PER-APP — give it an
    app-UNIQUE id so concurrent builds of different apps do not evict or corrupt
    each other's cache and each app's rebuilds stay warm:
    `RUN --mount=type=cache,id=<app-slug>-next,target=/app/.next/cache npm run build`
    (use this project's name as `<app-slug>` — a literal, stable string).
- **Lean production runner.** Do NOT `COPY` the whole `/app` (dev deps + source)
  into the final stage. Set Next.js `output: "standalone"` and copy only
  `.next/standalone`, `.next/static`, and `public`, then START the web with
  `node .next/standalone/server.js` — NOT `next start`, which does not work with
  standalone output (it warns and ignores the lean server). If a separate worker
  needs the full toolchain (e.g. a tsx worker), give it its own stage or prune to
  prod deps (`npm prune --omit=dev`) — never ship dev dependencies in the runner.
- **Skip redundant checks INSIDE the image build.** The build/iteration agent
  already runs typecheck + lint + tests to green BEFORE any image is built, so
  re-running them inside `next build` only slows every rebuild. In the app's
  `next.config`, set `eslint: { ignoreDuringBuilds: true }` and
  `typescript: { ignoreBuildErrors: true }` — this only turns them off for the
  in-image production build; they stay in the agent's verify loop and in CI.
- **Use the faster bundler for the production build.** On Next.js 15 build with
  Turbopack (`next build --turbopack`) — it is substantially faster than the
  webpack build. Fall back to the default bundler only if a dependency is
  incompatible.
- **Deterministic + offline.** Pin the base image (e.g. `node:20-bookworm-slim`),
  install from the lockfile (`npm ci`), and do not fetch anything else over the
  network during the build. Builds must reproduce identically and run with no
  internet.
- Keep `RUN` steps that change often LAST, and combine apt/`RUN` layers to keep
  the layer count and image size down.

## Tech stack

Next.js App Router + React + Tailwind + shadcn/ui frontend/API, Node.js BullMQ worker tier, Prisma over Postgres with FTS/pgvector, Auth.js (Google + Microsoft OAuth), OpenAI for triage, Stripe billing, Web Push notifications.

- **Frontend:** Next.js (App Router) + React + Tailwind CSS + shadcn/ui
- **Backend:** Next.js Route Handlers (Node.js runtime) + Prisma ORM; separate Node.js worker process with BullMQ
- **Database:** Postgres (lytma managed) with pg_trgm, unaccent, uuid-ossp, citext, pgvector
- **Hosting:** lytma managed platform — web service + worker service + managed Postgres/Redis
- **Key libraries:** next, react, tailwindcss, shadcn/ui, prisma, @prisma/client, bullmq, ioredis, next-auth, @auth/prisma-adapter, openai, stripe, web-push, googleapis, @microsoft/microsoft-graph-client, zod

## Milestones

### 1. Scaffold project, Prisma schema, and base tooling

Set up the Next.js app, Prisma schema matching the Tech Spec data model, worker process skeleton, and base configuration.

**Tasks:**
- Initialize Prisma schema with all tables from TECH_SPEC.md (user_accounts, subscriptions, subscription_ledger_entries, connected_mailboxes, category_folders, email_metadata, triage_decisions, triage_rules, review_queue_items, triage_summary_stats, notification_subscriptions, demo_accounts, events) including all indexes, enums, and constraints.
- Create the worker process entry point (src/workers/index.ts) that connects to Redis via BullMQ and registers empty queue consumers for triage, mailbox-action, web-push, sync-back, and token-refresh queues.
- Set up Auth.js configuration with Google and Microsoft providers, Prisma adapter, database session strategy, and the session type augmentation.
- Create the base app layout with Tailwind theme tokens, shadcn/ui provider, and the persistent left sidebar navigation shell (Review queue, Category folders, Compose, Stats, Settings).
- Add a Prisma client singleton (src/server/db/prisma.ts), env validation helper (src/server/lib/env.ts), and token encryption/decryption utilities (src/server/lib/crypto.ts) for OAuth tokens.
- Create the events table schema and a server-side track() helper per the analytics spec.

**Suggested subagents (run in parallel):**
- Schema: write the complete Prisma schema from TECH_SPEC.md data model with all tables, enums, indexes, and relations
- Auth: configure Auth.js with Google + Microsoft providers, Prisma adapter, session types
- Worker: scaffold the BullMQ worker process with all five queue definitions and empty consumers
- Frontend: set up base layout, sidebar navigation shell, Tailwind tokens, shadcn/ui providers

**Done when:**
- npx prisma validate passes with no errors
- npx prisma migrate dev --name init creates and applies the initial migration successfully
- npm run build passes with no type errors
- The worker process starts and connects to Redis without crashing (npm run worker)
- The Next.js dev server boots and renders a placeholder home page

### 2. Auth, roles, and tenant isolation

Implement authentication flows for User and DemoUser roles with session-based tenant isolation and the reconnect banner infrastructure.

**Tasks:**
- Implement the sign-in/sign-out flows for Google and Microsoft OAuth per the Auth.js config, including the OAuth scopes for mail.readwrite, mail.send, and mailbox modification.
- Create the DemoUser session flow: a demo token lookup that creates a limited session scoped to demo_accounts seed data, with no access to real user endpoints.
- Implement Prisma query middleware that injects user_account_id filtering on all tenant-scoped models, and set up Postgres RLS policies as a backstop.
- Build the Reconnect banner component that reads disconnected mailbox status from the session/API and displays the persistent amber banner with Reconnect and Dismiss actions.
- Create the /api/auth/session, /api/auth/signin/*, /api/auth/signout endpoints and the session type returning { id, email, displayName, subscriptionStatus, isDemo }.
- Add the noindex meta tag to all authenticated layouts and index,follow to public layouts per the SEO spec.

**Suggested subagents (run in parallel):**
- Backend: implement Auth.js providers, session strategy, Prisma middleware for tenant isolation, RLS policies
- Backend: implement DemoUser token-based session flow with demo_accounts scoping
- Frontend: build the Reconnect banner component, auth guard wrappers, and layout-level noindex/index meta tags

**Done when:**
- Google and Microsoft OAuth sign-in redirects work (with placeholder client IDs, the redirect URL is correct)
- A demo token session can be created and is scoped to demo data only — real user endpoints return 401 for demo sessions
- Prisma middleware enforces user_account_id on all tenant-scoped queries — a test with mismatched user_id returns no rows
- The Reconnect banner renders when a mailbox has sync_state='disconnected' and is hidden otherwise
- npm run build passes

### 3. Review queue and category folder CRUD

Build the core Review queue and category folder list/detail screens with their API endpoints, reading from seeded or triaged data.

**Tasks:**
- Implement GET /api/review-queue (paginated, ordered by importance_score DESC then created_at DESC) and PATCH /api/review-queue/:itemId (archive or mark done) per the API spec.
- Implement GET /api/category-folders (list folders with item counts) and GET /api/category-folders/:folderId/emails (paginated, filtered by sender/date/mailbox/flag).
- Build the Review queue screen: ordered list with sender, subject, date, source mailbox icon, confidence badge (green/yellow/red), AI reason, low-confidence flag, inline action buttons (Reply, Forward, Archive, Mark done), toggleable reading pane, empty state, and keyboard shortcuts (J/K, R, F, E, Shift+E).
- Build the Category folder view: filter bar, multi-select checkboxes with shift-click range select, select-all, sticky bulk action bar with Archive button, low-confidence flag indicators, and empty state.
- Implement POST /api/category-folders/:folderId/bulk-archive for multi-select archive.
- Add optimistic UI updates for archive/mark-done with a 5-second Undo toast.

**Suggested subagents (run in parallel):**
- Backend: build review-queue and category-folders API endpoints with pagination, filtering, and tenant scoping
- Frontend: build Review queue screen with keyboard shortcuts, reading pane, confidence badges, and action buttons
- Frontend: build Category folder view with multi-select, bulk action bar, filters, and optimistic updates
- Tests: write integration tests for review-queue ordering, archive, mark-done, and bulk-archive flows

**Done when:**
- GET /api/review-queue returns items ordered by importance then recency with correct fields
- PATCH /api/review-queue/:itemId with {status:'archived'} or {status:'done'} updates the item and removes it from the pending list
- The Review queue screen renders items with confidence badges, AI reasons, source mailbox icons, and keyboard shortcuts work
- Category folder view supports multi-select, select-all, and bulk-archive with optimistic UI and Undo toast
- npm run build passes

### 4. Triage engine: rules, LLM classification, and worker pipeline

Implement the full triage pipeline — plain-English rule parsing/evaluation, OpenAI classification, and the BullMQ worker that processes incoming emails end to end.

**Tasks:**
- Implement the triage worker (src/server/queues/workers/triage.ts): fetch message metadata from provider API, evaluate active TriageRules in priority order, call OpenAI if no rule matches, persist EmailMetadata + TriageDecision, route to ReviewQueueItem or category folder, and enqueue web-push if important.
- Implement the plain-English rule parser: an LLM-assisted parse that converts natural-language text into structured parsed_conditions (b) with a cached parse result per rule, plus a Postgres FTS-based keyword matching layer for rule evaluation at triage time.
- Implement the rule evaluation engine: evaluate parsed_conditions against incoming email metadata (sender, subject, domain), with priority ordering and conflict resolution (higher priority wins, ties broken by recency).
- Implement the OpenAI classification prompt: structured prompt sending sender, subject, snippet, and headers (no body persistence), requesting category, importance, confidence (0-1), and one-sentence reason.
- Implement low-confidence handling: confidence < 0.70 flags the item, files it in best-guess category, and excludes it from the Review queue.
- Implement the triage_summary_stats aggregation: a daily rollup job or inline update that increments the correct category count, flagged count, and rule-overridden count per user per day.

**Suggested subagents (run in parallel):**
- Worker: build the triage BullMQ consumer with provider fetch, rule eval, OpenAI call, persistence, and routing
- Rules: implement the LLM-assisted rule parser, FTS keyword matching, and rule evaluation engine with priority/conflict resolution
- LLM: implement the OpenAI classification prompt, response parsing, and low-confidence flagging logic
- Stats: implement the daily triage_summary_stats aggregation logic

**Done when:**
- A triage job processes a mock incoming email: evaluates rules, calls OpenAI (or mock), persists EmailMetadata + TriageDecision, and creates a ReviewQueueItem or category assignment
- A matching TriageRule overrides the AI classification — finalCategory reflects the rule, overriddenByRuleId is set, and the AI decision is still recorded
- Low-confidence items (confidence < 0.70) are flagged and excluded from the Review queue
- triage_summary_stats rows are created/updated correctly per day per user
- The worker retries with exponential backoff on OpenAI failures and dead-letters after 5 attempts

### 5. Mailbox connection, sync, and two-way action propagation

Implement Gmail and Outlook OAuth mailbox connection, push notification webhooks, incremental sync, and two-way action sync for archive/move/send/reply/forward.

**Tasks:**
- Implement POST /api/connected-mailboxes (initiate OAuth with mail scopes), DELETE /api/connected-mailboxes/:mailboxId (disconnect), and POST /api/connected-mailboxes/:mailboxId/reconnect (re-auth flow), storing encrypted refresh tokens.
- Implement GET /api/connected-mailboxes listing all connected mailboxes with sync_state, last_synced_at, and last_sync_error.
- Implement the Gmail provider adapter (src/server/lib/providers/gmail.ts): fetch messages, send/reply/forward, archive (remove INBOX label), Pub/Sub webhook ingestion, and incremental sync via historyId.
- Implement the Outlook provider adapter (src/server/lib/providers/outlook.ts): fetch messages via Graph API, send/reply/forward, archive (move to Archive folder), change notification webhook ingestion, and incremental sync via delta token.
- Implement POST /api/webhooks/gmail and POST /api/webhooks/outlook: verify provider tokens, parse the notification, and enqueue a triage job.
- Implement the mailbox-action worker: processes archive/move/send/delete jobs by calling the provider API, with retry/backoff and auth-failure detection that marks the mailbox as disconnected.
- Implement the sync-back worker: periodic full reconciliation per mailbox to catch native-client changes, and the token-refresh worker for proactive OAuth refresh.

**Suggested subagents (run in parallel):**
- Backend: build connected-mailboxes API endpoints and OAuth flow with encrypted token storage
- Provider-Gmail: implement Gmail API adapter (fetch, send, archive, Pub/Sub webhook, incremental sync)
- Provider-Outlook: implement Graph API adapter (fetch, send, archive, change notifications, delta sync)
- Worker: build mailbox-action, sync-back, and token-refresh BullMQ consumers with retry and auth-failure handling

**Done when:**
- OAuth flow for Gmail and Outlook redirects to provider consent and stores encrypted refresh tokens on callback (with placeholder client IDs, the redirect URLs are correct)
- Gmail and Outlook webhook endpoints verify provider tokens and enqueue triage jobs
- Archive action from the Review queue enqueues a mailbox-action job that calls the provider API (Gmail removes INBOX label / Outlook moves to Archive)
- Reply/forward/compose actions enqueue mailbox-action jobs that send via the provider API
- Auth failures during sync mark the mailbox as disconnected and trigger the Reconnect banner
- The token-refresh worker proactively refreshes expiring access tokens

### 6. Compose, reply, forward, and triage rules UI

Build the Compose screen (new email, reply, forward), the triage rules management UI, and the Settings screen.

**Tasks:**
- Implement POST /api/compose for sending new emails, POST /api/review-queue/:itemId/reply and /api/review-queue/:itemId/forward for threaded replies — all enqueue mailbox-action jobs.
- Build the Compose screen: From dropdown (connected mailboxes with provider icons), To/CC/BCC with autocomplete, subject, rich-text editor (bold/italic/lists/links), attachment upload (passed to provider API, not stored), Send button with validation, Cmd/Ctrl+Enter to send, Esc to cancel, quoted original metadata for replies/forwards.
- Implement GET/POST/PATCH/DELETE /api/triage-rules: list, create (with LLM-assisted parse returning parsed_conditions and a plain-English summary), edit, toggle active, reorder priority, and delete.
- Build the Triage Rules section in Settings: ordered list with drag-to-reorder, add/edit form with plain-English text input and parsed-summary preview, toggle active/inactive, and delete.
- Build the full Settings screen: Connected Accounts section (list with status, connect/disconnect/reconnect), Triage Rules section, Notification Preferences section (toggle + test button), Subscription section (plan, renewal, Stripe portal link), and Account section (sign out).
- Implement the notification_subscriptions API endpoints (GET, POST, DELETE) and GET /api/notifications/vapid-public-key.

**Suggested subagents (run in parallel):**
- Backend: build compose, reply, forward API endpoints and triage-rules CRUD with LLM-assisted parsing
- Frontend: build Compose screen with rich-text editor, From selector, recipient autocomplete, and reply/forward pre-population
- Frontend: build Settings screen with Connected Accounts, Triage Rules (drag-reorder, add/edit/delete), Notification Preferences, and Subscription sections
- Backend: build notification subscription endpoints and VAPID key endpoint

**Done when:**
- Compose screen sends a new email via the provider API (enqueues mailbox-action job) and shows a confirmation toast
- Reply from Review queue opens Compose pre-populated with From=source mailbox, To=original sender, subject prefixed 'Re:', and quoted metadata
- Forward opens Compose with blank To, subject prefixed 'Fw:', and quoted metadata
- Triage rules can be created, edited, toggled, reordered, and deleted — the LLM parse returns a readable summary
- Settings screen shows connected mailboxes with status, supports connect/disconnect/reconnect, and notification toggle works
- npm run build passes

### 7. Web push notifications, stats dashboard, and demo account

Implement web push delivery, the triage stats dashboard, and the pre-seeded demo account with realistic sample data.

**Tasks:**
- Implement the web-push worker (src/server/queues/workers/web-push.ts): retrieves active notification_subscriptions for the user, sends a VAPID push with sender and subject, retries on failure, and deactivates subscriptions returning 410 Gone.
- Build the service worker (public/sw.js) for push reception and the client-side push subscription flow using the VAPID public key.
- Implement GET /api/triage-stats with date range filtering (7/30/90 days), returning daily stats and summary aggregates.
- Build the Triage summary stats screen: date range selector, summary cards (total, avg/day, clearance rate, low-confidence rate), category breakdown bar chart, daily trend line chart (received vs cleared), rules-vs-AI pie chart, top senders list, and click-category-to-navigate interaction.
- Implement GET /api/demo/:demoToken and the demo account seeding: create a demo UserAccount with 3 simulated mailboxes, 200+ sample EmailMetadata across all categories, 15 ReviewQueueItems (including 2 low-confidence), 2 sample TriageRules, and 30 days of TriageSummaryStats.
- Build the demo account landing page and the 'Connect your real mailbox' CTA banner; ensure all demo actions (archive, mark done, bulk archive, compose) are simulated with toast confirmations.

**Suggested subagents (run in parallel):**
- Worker: build the web-push BullMQ consumer with VAPID signing, retry, and stale-subscription pruning
- Frontend: build the stats dashboard with charts (bar, line, pie), summary cards, top senders, and date range toggle
- Backend: implement demo account seeding logic and GET /api/demo/:demoToken endpoint
- Frontend: build demo landing page, demo CTA banner, and simulated action handlers

**Done when:**
- When an email is triaged as important, a web-push job is enqueued and delivers a notification with sender and subject to active subscriptions
- Expired push subscriptions (410 Gone) are deactivated and not retried
- Stats screen shows correct counts by category, daily trends, clearance rate, and rules-vs-AI ratio for the selected date range
- Demo account is accessible via a demo token without signup and contains 200+ emails across all categories with 15 Review queue items
- Demo actions (archive, mark done, bulk archive, compose) show 'Demo mode: email not actually sent' toasts and do not call real provider APIs
- npm run build passes

### 8. Stripe billing, marketing pages, SEO, and analytics

Implement subscription billing via Stripe, public marketing/pricing/demo pages with SEO, and the first-party analytics tracking.

**Tasks:**
- Implement POST /api/subscription/checkout (Stripe Checkout session for monthly/yearly), POST /api/subscription/cancel, GET /api/subscription, and POST /api/webhooks/stripe (verify signature, update subscriptions table and subscription_ledger_entries).
- Build the marketing landing page, pricing page ($12/month, $108/year, 14-day trial), and demo sign-up page as server-rendered public pages with semantic HTML, OG/Twitter tags, canonical URLs from buildCanonicalUrl helper, sitemap.xml, and robots.txt.
- Wire the track() helper into all key event fire points: review_queue_opened, email_triaged, review_queue_cleared, item_replied, item_forwarded, email_composed, rule_created, mailbox_connected, mailbox_reconnect_required, category_bulk_archived, low_confidence_flagged, push_subscribed, subscription_started, demo_account_opened.
- Build the auth-gated admin metrics view: server-rendered page with daily review_queue_opened counts, triage throughput by category, queue clearance rate, rule-vs-AI ratio, and 30-day sparkline.
- Implement trial flow: new users get 14-day trial with trial_ends_at; trial-expiring-soon and payment-failed in-app banners per the notifications spec.
- Implement subscription-lapse behavior: sync and triage paused on past_due/canceled, read-only access for 30 days, then data deletion.

**Suggested subagents (run in parallel):**
- Backend: build Stripe checkout, cancel, status endpoints, webhook handler, and subscription ledger entries
- Frontend: build marketing landing, pricing, and demo sign-up pages with full SEO metadata, sitemap, robots.txt
- Analytics: wire track() calls into all API routes and server actions; build the admin metrics view
- Backend: implement trial lifecycle, subscription-lapse pausing, and in-app banners for trial/payment events

**Done when:**
- Stripe Checkout session creation returns a checkout URL for monthly and yearly plans
- Stripe webhook updates subscription status and creates ledger entries on charge/refund/cancellation events
- Marketing pages are server-rendered with correct title, meta description, OG tags, canonical URLs, and noindex on authenticated pages
- sitemap.xml lists only public routes (/ , /pricing, /demo) and robots.txt disallows /app/*
- All key analytics events fire and are queryable in the admin metrics view
- npm run build passes

### 9. Tests, seed data, and polish

Add comprehensive tests, realistic seed data, keyboard accessibility pass, and final polish.

**Tasks:**
- Write integration tests for: triage pipeline (rule override, AI classification, low-confidence flagging), review-queue ordering and clearing, bulk-archive, compose/reply/forward, triage-rule CRUD, and demo account access.
- Create a seed script (prisma/seed.ts) that generates realistic demo data: 3 mailboxes, 200+ emails across all categories, 15 review queue items, 2 triage rules, 30 days of stats, and a demo account with a known token.
- Perform a keyboard accessibility pass: verify all queue actions have shortcuts, focus states are visible, tab order is logical, and screen-reader semantics are correct on lists and actions.
- Verify WCAG AA color contrast on confidence badges, category icons, and the reconnect banner.
- Add the PWA manifest and service worker for installability.
- Run the full test suite and fix any failures.

**Suggested subagents (run in parallel):**
- Tests: write integration tests for triage pipeline, review queue, bulk archive, compose, rules CRUD, and demo access
- Seed: create the seed script with realistic demo data covering all entities and categories
- Accessibility: audit keyboard navigation, focus states, ARIA semantics, and color contrast across all screens
- PWA: add manifest., icons, and service worker for installability

**Done when:**
- All integration tests pass (npm test)
- Seed script runs successfully and creates 200+ emails, 15 review queue items, 2 rules, and 30 days of stats
- Keyboard shortcuts work on Review queue (J/K/R/F/E/Shift+E) and Compose (Cmd+Enter/Esc) with visible focus states
- PWA manifest is valid and the app is installable
- npm run build passes with no errors

### 10. Deployment packaging and preview

Produce the single docker-compose.yml, Dockerfiles, preview/deploy scripts, and env files that boot the complete app locally and target lytma's managed platform.

**Tasks:**
- Write a multi-stage Dockerfile for the web service: install deps (COPY package. + package-lock. + prisma/ before npm ci for postinstall prisma generate), build Next.js with BuildKit cache mounts for .next/cache and npm cache, and run as a production Next.js server.
- Write a Dockerfile for the worker service: same base, installs deps, runs the worker entry point with BullMQ consumers.
- Write docker-compose.yml (the SINGLE deploy file): web service (builds from Dockerfile, publishes "${PREVIEW_PORT:-3000}:3000", healthcheck on /api/health), worker service (same image, different command), postgres (official image, no host port), redis (official image, no host port). All env-driven via environment: block and env_file.
- Write .env.preview with working values for the preview profile (DATABASE_URL pointing to compose postgres, REDIS_URL pointing to compose redis, stub modes for OpenAI/Stripe/OAuth, SEED_ON_BOOT=true, FORCE_RESEED=false).
- Write scripts/preview.sh (boots full preview from clean clone: docker compose up --build -d, waits for healthcheck, runs migrations + seed if empty), scripts/check-env.sh (validates required env vars), scripts/deploy.sh (deploys to lytma).
- Write deploy/ directory with DEPLOY.md go-live checklist for lytma managed platform (create Postgres/Redis services, set env vars, run prisma migrate, deploy web + worker services, configure webhook URLs, smoke test).
- Implement the preview entrypoint: migrate schema, then seed ONLY when the database is empty or FORCE_RESEED=true (cheap emptiness check on a core table).
- Add a /api/health endpoint returning 200 for the compose healthcheck.
- Line-by-line review of both Dockerfiles against the layer-hygiene rule: each RUN step sees only files COPY'd so far, dependency install is in its own cached stage, and prisma/schema.prisma is copied before npm ci.

**Suggested subagents (run in parallel):**
- Docker: write multi-stage Dockerfiles for web and worker with BuildKit cache mounts and layer hygiene
- Compose: write the single docker-compose.yml with web, worker, postgres, redis — all env-driven, no host ports on backing services
- Scripts: write preview.sh, check-env.sh, deploy.sh, and the idempotent seed-on-boot entrypoint
- Deploy: write DEPLOY.md go-live checklist and deploy/ config for lytma platform

**Done when:**
- ./scripts/preview.sh on a clean clone brings the app up healthy on one port with seeded data, with no real cloud credentials
- docker compose up boots web, worker, postgres, and redis with no errors
- The web service healthcheck passes on /api/health
- Seed runs only on first boot or when FORCE_RESEED=true — a second docker compose up skips seeding
- Production-mode smoke test of the running preview confirms every primary route returns 200 and renders with no server error: home/landing, pricing, demo, review queue, category folder, compose, settings, stats
- Grep the built app + all config for browser-facing localhost:<fixed-port> — confirm there are NONE (all browser URLs use PREVIEW_*_PORT variables)
- Postgres and Redis have no published host ports in docker-compose.yml
- Both Dockerfiles pass the layer-hygiene review: prisma/schema.prisma is COPY'd before npm ci, dependency install is cached separately from build

## Definition of done

The build is complete only when all of these hold — verify each:
- User can connect Gmail and Outlook mailboxes via OAuth from Settings, and the app begins syncing mail metadata within 60 seconds
- Review queue displays items ordered by importance then recency, each showing sender, subject, date, source mailbox, AI reason, and confidence badge
- User can reply, forward, compose, archive, and mark done from the Review queue, with actions two-way synced to the original mailbox
- Items remain in the Review queue until manually archived or marked done — replying/forwarding adds a badge but does not auto-clear
- AI triage classifies every incoming email into one of: important, FYI, newsletters, marketing, receipts, automated notifications, with a short reason and confidence level
- Low-confidence items (confidence < 0.70) are filed in their best-guess category folder with a flag indicator and do NOT appear in the Review queue
- Plain-English triage rules can be created, edited, deleted, toggled, and reordered; rules always override AI classification on new incoming mail only
- Category folder view supports multi-select, select-all, and bulk-archive with two-way sync
- Web push notifications fire only when important mail enters the Review queue, with enable/disable toggle in Settings
- Reconnect banner appears persistently when a mailbox loses access and initiates re-auth on click; sync resumes within 60 seconds of reconnection
- Triage summary stats screen shows counts by category, daily trends, queue clearance rate, rules-vs-AI ratio, and top senders for 7/30/90 day ranges
- Demo account is accessible without signup with 200+ sample emails across all categories, 15 review queue items, and simulated actions
- Stripe subscription billing works for monthly ($12) and yearly ($108) plans with 14-day free trial
- Only email metadata is stored — no email body content is persisted in the database
- App is a responsive, keyboard-first PWA with WCAG AA accessibility
- ./scripts/preview.sh on a clean clone brings the app up healthy on one port with seeded data and no real cloud credentials, and a production-mode smoke test confirms all primary routes return 200

## Guardrails

- Match the Tech Spec's Prisma data model exactly — do not add, rename, or remove tables, fields, enums, or indexes
- Every external dependency (database, Redis, OpenAI, Stripe, OAuth providers, VAPID) is reached through env vars — never hardcoded
- Side-effecting services (OpenAI, Stripe, email providers, web push) must support a stub/console mode so the preview boots with no real keys
- The web tier never calls OpenAI or provider sync APIs directly — all async work goes through BullMQ queues
- The worker tier never serves HTTP — it only consumes BullMQ jobs
- Only email metadata is persisted — full email body content is read transiently for LLM triage and discarded, never stored
- All tenant-scoped queries are filtered by user_account_id from the session — no cross-tenant data access
- DemoUser sessions are restricted to demo data — they cannot access real user endpoints, connected mailboxes, or billing
- Rules apply to new incoming mail only — never retroactively re-triage already-processed emails
- Keep the app runnable at every milestone — npm run build must pass before marking a milestone done
- Commit per milestone with a clear message
- Do not add features beyond MVP scope: no IMAP, no one-click unsubscribe, no custom categories, no learning-from-corrections, no mobile apps, no team features
- Production deploy artifacts target exactly lytma's managed platform (web service + worker service + managed Postgres/Redis)
- Write exactly ONE docker-compose.yml — do not split into multiple compose files; backing services (postgres, redis) have no published host ports
- Every browser-facing URL must be built from PREVIEW_*_PORT variables — never a static localhost:<port> in env files
- Use Postgres FTS for rule keyword matching — do not add a dedicated search engine (Meilisearch/Elasticsearch/Typesense)
- Use pgvector only if future embedding features are added — not required for MVP

## Assumptions baked into this plan

These decisions are already made for you — follow them rather than re-deciding:
- OpenAI API is called with a stub/mock mode in preview that returns deterministic classifications based on sender/subject heuristics — no real API key needed for preview
- Stripe uses test mode with stub webhook handling in preview — checkout URLs point to Stripe test mode or a stub confirmation page
- Gmail and Microsoft OAuth use placeholder client IDs in preview — the OAuth flow redirects correctly but cannot complete without real credentials; DEPLOY.md documents setting these up
- Provider webhooks (Gmail Pub/Sub, Graph change notifications) are stubbed in preview — the triage pipeline can be tested by manually enqueuing triage jobs with mock email data
- The seed script creates a demo account with token 'demo' for easy access in preview
- Token encryption uses AES-256-GCM with TOKEN_ENCRYPTION_KEY env var (32-character key)
- The rich-text editor in Compose uses a lightweight solution (e.g. contentEditable with execCommand or @tiptap/react) — no heavyweight editor dependency
- Charts on the stats screen use inline SVG or a lightweight charting library (e.g. recharts) consistent with the Next.js + shadcn/ui stack
- The worker process runs via a separate npm script (npm run worker) and as a separate container in docker-compose.yml
- Prisma migrations run as a pre-deploy step; the preview entrypoint runs prisma migrate deploy on boot
- The events table is included in the initial migration alongside all other tables
- Demo account actions that require provider APIs (reply, forward, compose) are intercepted in demo mode and return a success toast without calling the provider

# syntax=docker/dockerfile:1.7
# ---- Web service (Next.js standalone) ----
# Multi-stage, deps-before-source for cache-friendly, concurrency-safe builds.

FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app
# openssl is required by Prisma engines.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- deps: install node_modules from the lockfile only ----
FROM base AS deps
# Copy manifest + prisma schema BEFORE install so postinstall `prisma generate` works
# and a code-only change reuses this layer.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci --include=dev

# ---- build: compile the Next.js app ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Per-app build cache id keeps concurrent app builds from evicting each other.
RUN --mount=type=cache,id=triage-mail-next,target=/app/.next/cache \
    npm run build

# ---- runner: lean production image ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Lean standalone server + static assets + public. DB migration + seeding run in
# the dedicated `migrate` init service (docker-compose.yml), which uses the worker
# image's complete, correctly-linked node_modules — so this stays minimal.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

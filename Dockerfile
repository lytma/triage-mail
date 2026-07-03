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

# Standalone server + static assets + public.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma CLI + engines + schema/migrations + seed for migrate/seed on boot.
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=build /app/node_modules/tsx ./node_modules/tsx
COPY --from=build /app/node_modules/.bin/tsx ./node_modules/.bin/tsx
COPY --from=build /app/node_modules/dotenv ./node_modules/dotenv
# Seed + its imports resolve against src via tsx path alias.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

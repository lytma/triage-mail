#!/bin/sh
# Web service entrypoint: apply migrations, seed (idempotent / when-empty), start.
set -e

echo "[entrypoint] applying database migrations…"
# Brief retry loop so a just-started DB is tolerated.
n=0
until node_modules/.bin/prisma migrate deploy 2>&1; do
  n=$((n+1))
  if [ "$n" -ge 10 ]; then
    echo "[entrypoint] migrate failed after retries; continuing to start server"
    break
  fi
  echo "[entrypoint] migrate not ready, retrying ($n)…"
  sleep 3
done

# Seed only when SEED_ON_BOOT=true (idempotent: the seed no-ops when the admin
# already exists unless FORCE_RESEED=true).
if [ "$SEED_ON_BOOT" = "true" ]; then
  echo "[entrypoint] seeding (SEED_ON_BOOT=true)…"
  node_modules/.bin/tsx prisma/seed.ts || echo "[entrypoint] seed step failed (continuing)"
fi

echo "[entrypoint] starting: $*"
exec "$@"

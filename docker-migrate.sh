#!/bin/sh
# One-shot DB init (used by the compose `migrate` service on the worker image,
# which has a complete, correctly-linked node_modules). Applies migrations, then
# seeds idempotently when SEED_ON_BOOT=true.
set -e

echo "[migrate] applying database migrations…"
n=0
until node_modules/.bin/prisma migrate deploy; do
  n=$((n+1))
  if [ "$n" -ge 15 ]; then
    echo "[migrate] migrate failed after retries"
    exit 1
  fi
  echo "[migrate] db not ready, retrying ($n)…"
  sleep 3
done

if [ "$SEED_ON_BOOT" = "true" ]; then
  echo "[migrate] seeding (SEED_ON_BOOT=true)…"
  node_modules/.bin/tsx prisma/seed.ts
fi

echo "[migrate] done."

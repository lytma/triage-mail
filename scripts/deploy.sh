#!/usr/bin/env bash
# Deploy Triage Mail to lytma's managed platform.
# lytma builds the images from Dockerfile (web) + Dockerfile.worker and runs them
# as separate services against managed Postgres/Redis. This script performs the
# pre-deploy checks and migration step; the platform handles image build + rollout.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Validating production environment…"
./scripts/check-env.sh production

echo "==> Applying database migrations (prisma migrate deploy)…"
if command -v npx >/dev/null 2>&1; then
  npx prisma migrate deploy
else
  node_modules/.bin/prisma migrate deploy
fi

echo ""
echo "==> Migrations applied. Hand off to the lytma platform to deploy:"
echo "    - web service    (Dockerfile,        command: node server.js via entrypoint)"
echo "    - worker service (Dockerfile.worker, command: tsx src/workers/index.ts)"
echo ""
echo "    Ensure the platform env has real GOOGLE_/MICROSOFT_/GMAIL_ OAuth creds,"
echo "    OPENAI_API_KEY, STRIPE_* keys, and VAPID_* keys for full functionality."
echo "    See deploy/DEPLOY.md for the full go-live checklist."

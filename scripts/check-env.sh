#!/usr/bin/env bash
# Validate required environment variables before a real (production) deploy.
# In preview, side-effecting integrations are optional (stub modes), so only the
# core service vars are hard-required.
set -euo pipefail

MODE="${1:-preview}"
missing=0

req() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "  MISSING: $name"
    missing=1
  else
    echo "  ok:      $name"
  fi
}

opt() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "  (unset): $name  — feature runs in stub/disabled mode"
  else
    echo "  ok:      $name"
  fi
}

echo "== Core (required in all environments) =="
req DATABASE_URL
req REDIS_URL
req AUTH_SECRET
req TOKEN_ENCRYPTION_KEY

echo ""
echo "== Integrations =="
if [ "$MODE" = "production" ]; then
  echo "-- production: the following are recommended for full functionality --"
fi
opt GOOGLE_CLIENT_ID
opt GOOGLE_CLIENT_SECRET
opt MICROSOFT_CLIENT_ID
opt MICROSOFT_CLIENT_SECRET
opt GMAIL_CLIENT_ID
opt GMAIL_PUBSUB_TOPIC
opt OPENAI_API_KEY
opt STRIPE_SECRET_KEY
opt STRIPE_WEBHOOK_SECRET
opt STRIPE_PRICE_MONTHLY
opt STRIPE_PRICE_YEARLY
opt VAPID_PUBLIC_KEY
opt VAPID_PRIVATE_KEY

echo ""
if [ "$missing" -eq 1 ]; then
  echo "RESULT: missing required variables. Set them and re-run."
  exit 1
fi
echo "RESULT: core environment OK."

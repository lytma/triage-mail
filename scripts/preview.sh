#!/usr/bin/env bash
# Boot the full Triage Mail preview from a clean clone with NO real cloud creds.
# Brings up web + worker + postgres + redis; migrations + seed run in the web
# entrypoint. Discovers the lytma-assigned host port and smoke-tests /api/health.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose"
$COMPOSE version >/dev/null 2>&1 || COMPOSE="docker-compose"

echo "==> Building and starting services…"
$COMPOSE up --build -d

echo "==> Waiting for the web service to become healthy…"
CID="$($COMPOSE ps -q web)"
for i in $(seq 1 60); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo starting)"
  if [ "$STATUS" = "healthy" ]; then
    break
  fi
  if [ "$i" = "60" ]; then
    echo "!! web did not become healthy in time. Recent logs:"
    $COMPOSE logs --tail=50 web
    exit 1
  fi
  sleep 3
done

# Discover the ephemeral host port lytma/Docker assigned to container port 3000.
HOSTPORT="$($COMPOSE port web 3000 2>/dev/null | awk -F: '{print $NF}' | head -1 || true)"
echo ""
echo "==> Triage Mail preview is UP and healthy."
if [ -n "${HOSTPORT:-}" ]; then
  echo "    Local URL:   http://localhost:${HOSTPORT}"
  echo "    Health:      http://localhost:${HOSTPORT}/api/health"
fi
echo "    Sign in:     admin@example.com / Admin!2345   (or 'View demo account')"
echo ""
echo "    Logs:   $COMPOSE logs -f web worker"
echo "    Stop:   $COMPOSE down        (add -v to wipe data)"

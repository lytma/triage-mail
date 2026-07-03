#!/usr/bin/env bash
# Production-mode smoke test: logs in as the seeded admin and checks every
# primary route returns 200 and renders without a server error or leaked
# placeholder. Usage: ./scripts/smoke-test.sh [BASE_URL]
set -uo pipefail

BASE="${1:-http://127.0.0.1:3111}"
JAR="$(mktemp)"
fail=0

check_public() {
  local path="$1"
  local code
  code=$(curl -s -o /tmp/smoke_body -w '%{http_code}' "$BASE$path")
  if [ "$code" != "200" ]; then
    echo "  FAIL $path -> $code"; fail=1; return
  fi
  if grep -qiE "Application error|Internal Server Error|Coming in a later milestone" /tmp/smoke_body; then
    echo "  FAIL $path -> 200 but error/placeholder content leaked"; fail=1; return
  fi
  echo "  ok   $path -> 200"
}

check_authed() {
  local path="$1"
  local code
  code=$(curl -s -b "$JAR" -o /tmp/smoke_body -w '%{http_code}' "$BASE$path")
  if [ "$code" != "200" ]; then
    echo "  FAIL $path -> $code (authed)"; fail=1; return
  fi
  if grep -qiE "Application error|Internal Server Error|Coming in a later milestone" /tmp/smoke_body; then
    echo "  FAIL $path -> 200 but error/placeholder content leaked"; fail=1; return
  fi
  echo "  ok   $path -> 200 (authed)"
}

echo "== Public routes =="
check_public /
check_public /pricing
check_public /demo
check_public /signin
check_public /api/health
check_public /sitemap.xml
check_public /robots.txt

echo ""
echo "== Sign in as admin =="
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
curl -s -b "$JAR" -c "$JAR" -o /dev/null \
  -X POST "$BASE/api/auth/callback/password" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=admin@example.com" \
  --data-urlencode "password=Admin!2345"
SESSION=$(curl -s -b "$JAR" "$BASE/api/auth/session")
if echo "$SESSION" | grep -q '"email":"admin@example.com"'; then
  echo "  ok   session established"
else
  echo "  FAIL could not establish session: $SESSION"; fail=1
fi

echo ""
echo "== Authenticated routes =="
check_authed /review
check_authed /folders/marketing
check_authed /folders/newsletters
check_authed /compose
check_authed /settings
check_authed /stats
check_authed /admin

echo ""
echo "== Authenticated API =="
for api in /api/review-queue /api/category-folders /api/triage-rules /api/connected-mailboxes /api/triage-stats /api/subscription; do
  code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE$api")
  if [ "$code" = "200" ]; then echo "  ok   $api -> 200"; else echo "  FAIL $api -> $code"; fail=1; fi
done

rm -f "$JAR" /tmp/smoke_body
echo ""
if [ "$fail" -eq 0 ]; then echo "SMOKE TEST PASSED ✔"; else echo "SMOKE TEST FAILED ✗"; exit 1; fi

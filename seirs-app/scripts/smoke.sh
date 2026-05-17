#!/usr/bin/env bash
# SEIRS backend smoke test
#
# Run after every deploy to confirm the production API is live and the
# endpoints from every shipped wave are registered. Reports green/red
# per check + a final pass/fail summary. Exits non-zero if any check fails
# so it can also run from CI.
#
# Usage:
#   ./scripts/smoke.sh                     # hits Railway production
#   API=http://localhost:3000 ./scripts/smoke.sh   # hits local dev
#
# What this covers:
#   - Health + version (catches "stuck on old commit" silent failures
#     like the one that hid 16B-16G's deploys for a full day)
#   - One public endpoint per wave (proves the route is registered)
#   - One auth-required endpoint per wave (expects 401, NOT 404)
#
# What this DOES NOT cover:
#   - Authenticated flows (would need a test JWT — see manual checklist
#     in docs/launch/17-smoke-test.md)
#   - Mobile UI behaviour (only a real device can do that)
#   - Vercel-hosted website + admin (Vercel has its own status page)

set -u
API="${API:-https://seirs-logistics-mobile-production.up.railway.app/api/v1}"

PASS=0
FAIL=0
RED='\033[0;31m'
GRN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

# check NAME METHOD PATH EXPECTED_CODE
check() {
  local name="$1" method="$2" path="$3" expected="$4"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" "${API}${path}")
  if [ "$code" = "$expected" ]; then
    printf "  ${GRN}PASS${NC}  %-50s  ${DIM}%s %s → %s${NC}\n" "$name" "$method" "$path" "$code"
    PASS=$((PASS+1))
  else
    printf "  ${RED}FAIL${NC}  %-50s  ${DIM}%s %s → %s (expected %s)${NC}\n" \
      "$name" "$method" "$path" "$code" "$expected"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "SEIRS smoke test — ${API}"
echo ""

# ── Health + deploy version ─────────────────────────────────────────────────
echo "Health"
HEALTH=$(curl -sS "${API}/health")
VER=$(printf "%s" "$HEALTH" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
UP=$(printf "%s" "$HEALTH"  | sed -n 's/.*"uptimeSec":\([0-9]*\).*/\1/p')
if [ -n "$VER" ]; then
  printf "  ${GRN}PASS${NC}  deployed version: %s  ${DIM}(uptime %ss)${NC}\n" "$VER" "$UP"
  PASS=$((PASS+1))
else
  printf "  ${RED}FAIL${NC}  could not read version from /health\n"
  FAIL=$((FAIL+1))
fi

# ── Public endpoints (expect 200) ───────────────────────────────────────────
echo ""
echo "Public endpoints"
check "maintenance status (16E)"     GET  "/maintenance/status"      200
check "rate card (pricing v2)"       GET  "/config/rate-card"        200
check "service catalog (categories)" GET  "/config/service-catalog"  200

# ── Auth-required endpoints (expect 401 — proves route is registered) ──────
# 404 here = the route DOESN'T EXIST. 401 = exists, just needs a JWT.
# This is the check that caught buckets 16B-16G being un-deployed.
echo ""
echo "Auth-gated endpoints (expecting 401 = route exists)"
check "users/me (baseline)"          GET   "/users/me"                          401
check "users/me/notification-prefs (16A)" GET "/users/me/notification-prefs"  401
check "addresses (16B)"              GET   "/addresses"                        401
check "tickets/mine (16B)"           GET   "/tickets/mine"                     401
check "deliveries/me (baseline)"     GET   "/deliveries"                       401
check "deliveries/:id/claim (16C)"   POST  "/deliveries/abc/claim"             401
check "deliveries/:id/email-receipt (16A)" POST "/deliveries/abc/email-receipt" 401
check "drivers/me/vehicle (16C)"     PATCH "/drivers/me/vehicle"               401
check "drivers/me/subscription (16F)" GET  "/drivers/me/subscription"          401
check "admin/wallet/summary (16D)"   GET   "/admin/wallet/summary"             401
check "admin/referrals (16D)"        GET   "/admin/referrals"                  401
check "admin/settings (16D)"         GET   "/admin/settings"                   401

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
TOTAL=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  printf "${GRN}All %d checks passed.${NC}\n" "$TOTAL"
  exit 0
else
  printf "${RED}%d / %d checks failed.${NC}\n" "$FAIL" "$TOTAL"
  echo ""
  echo "A 404 on an auth-gated endpoint usually means Railway didn't deploy"
  echo "the latest commit. Compare the version above to:"
  echo "  git log --oneline -1"
  exit 1
fi

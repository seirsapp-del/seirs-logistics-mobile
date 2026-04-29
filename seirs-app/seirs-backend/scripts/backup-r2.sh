#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# backup-r2.sh — dump PostgreSQL and upload to Cloudflare R2
#
# Prerequisites:
#   1. aws CLI installed: https://aws.amazon.com/cli/
#   2. pg_dump available (install PostgreSQL client tools)
#
# Usage:
#   bash scripts/backup-r2.sh
#
# The backup is uploaded to: R2_BUCKET/db-backups/seirs_YYYYMMDD_HHMMSS.sql.gz
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Load .env ─────────────────────────────────────────────────────
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | xargs)
fi

# ── Validate required vars ─────────────────────────────────────────
: "${DB_HOST:?DB_HOST not set}"
: "${DB_PORT:?DB_PORT not set}"
: "${DB_USERNAME:?DB_USERNAME not set}"
: "${DB_NAME:?DB_NAME not set}"
: "${DB_PASSWORD:?DB_PASSWORD not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY not set}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME not set}"

# ── Config ────────────────────────────────────────────────────────
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="seirs_${TIMESTAMP}.sql.gz"
TMP_FILE="/tmp/${FILENAME}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
R2_PREFIX="db-backups"

# ── Step 1: Dump ──────────────────────────────────────────────────
echo "▶ Dumping database '${DB_NAME}'..."
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USERNAME" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$TMP_FILE"

SIZE=$(du -sh "$TMP_FILE" | cut -f1)
echo "✓ Dump complete: ${SIZE}"

# ── Step 2: Upload to R2 ──────────────────────────────────────────
echo "▶ Uploading to R2 bucket '${R2_BUCKET_NAME}/${R2_PREFIX}/'..."
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp "$TMP_FILE" \
  "s3://${R2_BUCKET_NAME}/${R2_PREFIX}/${FILENAME}" \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

echo "✓ Uploaded: ${R2_PREFIX}/${FILENAME}"

# ── Step 3: Cleanup temp file ─────────────────────────────────────
rm "$TMP_FILE"
echo "✓ Temp file removed"

# ── Step 4: Prune R2 — keep last 30 backups ───────────────────────
echo "▶ Pruning old R2 backups (keeping last 30)..."
ALL_BACKUPS=$(
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 ls "s3://${R2_BUCKET_NAME}/${R2_PREFIX}/" \
    --endpoint-url "$R2_ENDPOINT" \
    --region auto \
  | sort \
  | awk '{print $4}'
)

COUNT=$(echo "$ALL_BACKUPS" | grep -c . || true)
if [ "$COUNT" -gt 30 ]; then
  TO_DELETE=$(echo "$ALL_BACKUPS" | head -n $(( COUNT - 30 )))
  for KEY in $TO_DELETE; do
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3 rm "s3://${R2_BUCKET_NAME}/${R2_PREFIX}/${KEY}" \
      --endpoint-url "$R2_ENDPOINT" \
      --region auto
    echo "  Deleted: ${KEY}"
  done
fi

echo "✓ Done. Total backups in R2: $([ "$COUNT" -gt 30 ] && echo 30 || echo $COUNT)"

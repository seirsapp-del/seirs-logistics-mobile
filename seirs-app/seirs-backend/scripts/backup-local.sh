#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# backup-local.sh — dump Seirs PostgreSQL to a local .sql.gz file
#
# Usage:
#   bash scripts/backup-local.sh
#
# Output:
#   backups/seirs_YYYYMMDD_HHMMSS.sql.gz
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Load env vars from .env if present ───────────────────────────
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | grep -v '^\s*$' | xargs)
fi

# ── Config (falls back to .env values or defaults) ────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-seirs_db}"
BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="seirs_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "▶ Backing up database '${DB_NAME}' from ${DB_HOST}:${DB_PORT}..."

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USERNAME" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

SIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "✓ Backup saved: backups/${FILENAME} (${SIZE})"

# ── Keep only the last 14 local backups ───────────────────────────
cd "$BACKUP_DIR"
ls -t seirs_*.sql.gz | tail -n +15 | xargs -r rm --
echo "✓ Old backups pruned (kept last 14)"

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# restore-local.sh — restore a local .sql.gz backup into PostgreSQL
#
# Usage:
#   bash scripts/restore-local.sh backups/seirs_20260428_120000.sql.gz
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_FILE="${1:?Usage: bash scripts/restore-local.sh <backup-file.sql.gz>}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "✗ File not found: $BACKUP_FILE"
  exit 1
fi

# ── Load .env ─────────────────────────────────────────────────────
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | xargs)
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-seirs_db}"

echo "⚠  This will REPLACE all data in '${DB_NAME}' with the backup."
read -p "   Type YES to continue: " CONFIRM
[ "$CONFIRM" = "YES" ] || { echo "Aborted."; exit 0; }

echo "▶ Dropping and recreating database '${DB_NAME}'..."
PGPASSWORD="${DB_PASSWORD}" psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" \
  -c "DROP DATABASE IF EXISTS ${DB_NAME};" postgres
PGPASSWORD="${DB_PASSWORD}" psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" \
  -c "CREATE DATABASE ${DB_NAME};" postgres

echo "▶ Restoring from ${BACKUP_FILE}..."
gunzip -c "$BACKUP_FILE" | PGPASSWORD="${DB_PASSWORD}" psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" \
  -d "$DB_NAME"

echo "✓ Restore complete."

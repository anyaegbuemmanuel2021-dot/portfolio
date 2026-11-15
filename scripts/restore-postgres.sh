#!/usr/bin/env bash
# Destructive restore into the DATABASE_URL database. Use only after verifying the target.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the target PostgreSQL connection string}"
BACKUP_FILE="${1:?Usage: bash scripts/restore-postgres.sh path/to/backup.dump}"
if [ ! -f "$BACKUP_FILE" ]; then echo "Backup file not found: $BACKUP_FILE" >&2; exit 1; fi
if [ "${CONFIRM_DATABASE_RESTORE:-}" != "YES" ]; then
  echo "This restore can overwrite existing objects in the target database."
  echo "Set CONFIRM_DATABASE_RESTORE=YES only after checking DATABASE_URL and backup integrity." >&2
  exit 2
fi
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname "$DATABASE_URL" "$BACKUP_FILE"
echo "Restore completed. Run application verification and inspect the restored data."

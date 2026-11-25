#!/usr/bin/env bash
# Destructive restore into DATABASE_URL. Verify the target and backup before proceeding.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the target PostgreSQL connection string}"
BACKUP_FILE="${1:?Usage: bash scripts/restore-postgres.sh path/to/backup.dump[.gpg]}"
if [ ! -f "$BACKUP_FILE" ]; then echo "Backup file not found: $BACKUP_FILE" >&2; exit 1; fi

DECRYPTED=""
cleanup() { [ -z "$DECRYPTED" ] || rm -f "$DECRYPTED"; }
trap cleanup EXIT

if [[ "$BACKUP_FILE" == *.gpg ]]; then
  : "${BACKUP_ENCRYPTION_PASSPHRASE:?Set BACKUP_ENCRYPTION_PASSPHRASE}"
  command -v gpg >/dev/null 2>&1 || { echo "gpg is required to decrypt this backup." >&2; exit 127; }
  command -v openssl >/dev/null 2>&1 || { echo "openssl is required to verify this backup." >&2; exit 127; }
  for sidecar in "$BACKUP_FILE.sha256" "$BACKUP_FILE.hmac"; do
    [ -f "$sidecar" ] || { echo "Required integrity sidecar missing: $sidecar" >&2; exit 1; }
  done
  EXPECTED_SHA="$(tr -d '[:space:]' < "$BACKUP_FILE.sha256")"
  ACTUAL_SHA="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
  [[ "$EXPECTED_SHA" == "$ACTUAL_SHA" ]] || { echo "Backup SHA-256 check failed." >&2; exit 1; }
  EXPECTED_HMAC="$(tr -d '[:space:]' < "$BACKUP_FILE.hmac")"
  ACTUAL_HMAC="$(openssl dgst -sha256 -hmac "$BACKUP_ENCRYPTION_PASSPHRASE" "$BACKUP_FILE" | awk '{print $NF}')"
  [[ "$EXPECTED_HMAC" == "$ACTUAL_HMAC" ]] || { echo "Backup HMAC check failed." >&2; exit 1; }
  DECRYPTED="$(mktemp)"
  printf '%s' "$BACKUP_ENCRYPTION_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --decrypt --output "$DECRYPTED" "$BACKUP_FILE"
  BACKUP_FILE="$DECRYPTED"
fi

if [ "${CONFIRM_DATABASE_RESTORE:-}" != "YES" ]; then
  echo "This restore can overwrite existing objects in the target database."
  echo "Set CONFIRM_DATABASE_RESTORE=YES only after checking DATABASE_URL and backup integrity." >&2
  exit 2
fi
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname "$DATABASE_URL" "$BACKUP_FILE"
echo "Restore completed. Run application verification and inspect the restored data."

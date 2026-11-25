#!/usr/bin/env bash
# Creates, encrypts, uploads and verifies a PostgreSQL backup in Dbrij Storage.
# Requires: pg_dump/pg_restore (matching server major), gpg, aws CLI, openssl.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the direct Neon PostgreSQL connection string}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?Set BACKUP_ENCRYPTION_PASSPHRASE}"
: "${DBRIJ_BACKUP_BUCKET:?Set DBRIJ_BACKUP_BUCKET}"
: "${AWS_ACCESS_KEY_ID:?Set the Dbrij backup access key ID}"
: "${AWS_SECRET_ACCESS_KEY:?Set the Dbrij backup secret key}"

ENDPOINT="${DBRIJ_S3_ENDPOINT:-https://s3.dbrij.com}"
REGION="${DBRIJ_S3_REGION:-auto}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-56}"
BACKUP_KEEP_MIN="${BACKUP_KEEP_MIN:-4}"

for command in pg_dump pg_restore gpg aws openssl sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 127; }
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$WORK_DIR/portfolio-$STAMP.dump"
ENCRYPTED="$DUMP.gpg"
KEY="backups/$(basename "$ENCRYPTED")"

echo "Creating PostgreSQL custom-format dump..."
pg_dump --no-owner --no-acl --format=custom "$DATABASE_URL" --file "$DUMP"
test -s "$DUMP"
pg_restore --list "$DUMP" > "$WORK_DIR/restore-list.txt"
grep -q 'TOC Entries' "$WORK_DIR/restore-list.txt"

echo "Encrypting backup before upload..."
printf '%s' "$BACKUP_ENCRYPTION_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 --output "$ENCRYPTED" "$DUMP"
test -s "$ENCRYPTED"
sha256sum "$ENCRYPTED" | awk '{print $1}' > "$ENCRYPTED.sha256"
openssl dgst -sha256 -hmac "$BACKUP_ENCRYPTION_PASSPHRASE" "$ENCRYPTED" | awk '{print $NF}' > "$ENCRYPTED.hmac"

aws configure set default.s3.addressing_style path
echo "Uploading encrypted backup to private Dbrij bucket..."
aws --endpoint-url "$ENDPOINT" --region "$REGION" s3 cp "$ENCRYPTED" "s3://$DBRIJ_BACKUP_BUCKET/$KEY" --only-show-errors
aws --endpoint-url "$ENDPOINT" --region "$REGION" s3 cp "$ENCRYPTED.sha256" "s3://$DBRIJ_BACKUP_BUCKET/$KEY.sha256" --only-show-errors
aws --endpoint-url "$ENDPOINT" --region "$REGION" s3 cp "$ENCRYPTED.hmac" "s3://$DBRIJ_BACKUP_BUCKET/$KEY.hmac" --only-show-errors

echo "Verifying uploaded objects..."
REMOTE_SIZE="$(aws --endpoint-url "$ENDPOINT" --region "$REGION" s3api head-object --bucket "$DBRIJ_BACKUP_BUCKET" --key "$KEY" --query ContentLength --output text)"
LOCAL_SIZE="$(wc -c < "$ENCRYPTED" | tr -d ' ')"
[[ "$REMOTE_SIZE" == "$LOCAL_SIZE" ]] || { echo "Uploaded backup size does not match local encrypted file." >&2; exit 1; }
aws --endpoint-url "$ENDPOINT" --region "$REGION" s3api head-object --bucket "$DBRIJ_BACKUP_BUCKET" --key "$KEY.sha256" >/dev/null
aws --endpoint-url "$ENDPOINT" --region "$REGION" s3api head-object --bucket "$DBRIJ_BACKUP_BUCKET" --key "$KEY.hmac" >/dev/null

echo "Encrypted backup verified: s3://$DBRIJ_BACKUP_BUCKET/$KEY"
BACKUP_RETENTION_DAYS="$BACKUP_RETENTION_DAYS" BACKUP_KEEP_MIN="$BACKUP_KEEP_MIN" \
  DBRIJ_BACKUP_BUCKET="$DBRIJ_BACKUP_BUCKET" DBRIJ_S3_ENDPOINT="$ENDPOINT" DBRIJ_S3_REGION="$REGION" \
  AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  bash scripts/prune-backups.sh

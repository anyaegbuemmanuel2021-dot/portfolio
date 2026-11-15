#!/usr/bin/env bash
# Deletes Dbrij backups older than BACKUP_RETENTION_DAYS, always retaining BACKUP_KEEP_MIN newest dumps.
# Requires: DBRIJ_BACKUP_BUCKET, AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, DBRIJ_S3_ENDPOINT, DBRIJ_S3_REGION.
set -euo pipefail
: "${DBRIJ_BACKUP_BUCKET:?Set DBRIJ_BACKUP_BUCKET}"
: "${AWS_ACCESS_KEY_ID:?Set the Dbrij backup access key ID}"
: "${AWS_SECRET_ACCESS_KEY:?Set the Dbrij backup secret key}"
ENDPOINT="${DBRIJ_S3_ENDPOINT:-https://s3.dbrij.com}"
REGION="${DBRIJ_S3_REGION:-auto}"
DAYS="${BACKUP_RETENTION_DAYS:-56}"
KEEP="${BACKUP_KEEP_MIN:-4}"
[[ "$DAYS" =~ ^[0-9]+$ && "$DAYS" -ge 7 ]] || { echo "BACKUP_RETENTION_DAYS must be an integer >= 7" >&2; exit 2; }
[[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -ge 1 ]] || { echo "BACKUP_KEEP_MIN must be an integer >= 1" >&2; exit 2; }
aws configure set default.s3.addressing_style path
CUTOFF="$(date -u -d "-${DAYS} days" +%Y-%m-%dT%H:%M:%S)"
LIST="$(aws --endpoint-url "$ENDPOINT" --region "$REGION" s3api list-objects-v2 --bucket "$DBRIJ_BACKUP_BUCKET" --prefix backups/ --query 'Contents[?ends_with(Key, `.dump.enc`)].[Key,LastModified]' --output text | sort -t$'\t' -k2,2 -r || true)"
[ -n "$LIST" ] && [ "$LIST" != "None" ] || { echo "No backups found; nothing to prune."; exit 0; }
N=0; DELETED=0
while IFS=$'\t' read -r KEY MODIFIED; do
  [ -n "${KEY:-}" ] || continue
  N=$((N+1)); [ "$N" -le "$KEEP" ] && continue
  if [[ "$MODIFIED" < "$CUTOFF" ]]; then
    aws --endpoint-url "$ENDPOINT" --region "$REGION" s3 rm "s3://${DBRIJ_BACKUP_BUCKET}/${KEY}" --only-show-errors
    aws --endpoint-url "$ENDPOINT" --region "$REGION" s3 rm "s3://${DBRIJ_BACKUP_BUCKET}/${KEY}.sha256" --only-show-errors || true
    aws --endpoint-url "$ENDPOINT" --region "$REGION" s3 rm "s3://${DBRIJ_BACKUP_BUCKET}/${KEY}.hmac" --only-show-errors || true
    echo "Pruned ${KEY}"; DELETED=$((DELETED+1))
  fi
done <<< "$LIST"
echo "Retention ${DAYS} days: pruned ${DELETED}, kept $((N-DELETED)) backups."

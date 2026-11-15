#!/usr/bin/env bash
# Creates a compressed PostgreSQL backup. Set DATABASE_URL and BACKUP_DIR first.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the direct Neon PostgreSQL connection string}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/portfolio-$STAMP.dump"
pg_dump --no-owner --no-acl --format=custom "$DATABASE_URL" --file "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
echo "Backup created: $OUT"
echo "Keep backups outside the application repository and test restores regularly."

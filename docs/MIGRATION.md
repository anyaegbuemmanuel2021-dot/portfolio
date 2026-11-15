# Backups, restore & moving to another PostgreSQL host

## Export (any time)
- Admin → Security & system → Backups → **Export backup (JSON)**, or `npm run export -- backup.json`.
- Format `portfolio-backup` v1: every table, FK-ordered, with a SHA-256. It contains **password hashes and lead data — treat as secret**. Sessions / reset tokens / security events are excluded.
- For physical dumps use `pg_dump "$DATABASE_URL" -Fc -f db.dump` as well (Neon free plans have limited history; don't rely on provider backups).

## Move to a new Postgres host
1. Create the new database; get its URL.
2. `TARGET_DATABASE_URL=postgres://new… npm run import -- backup.json`
   The importer: checks connectivity → **applies migrations** → refuses a non-empty target unless `--force` → imports in FK order in one transaction (rollback on error) → **verifies per-table row counts** → prints a migration summary.
3. Change `DATABASE_URL` on the API host → redeploy. No code changes.

## Media
Records are in Postgres; files are in object storage. Copy them: `FROM_STORAGE=local TO_STORAGE=dbrij npm run media-migrate` (re-downloads each object from the destination and compares SHA-256). Then rewrite URLs if the public base changed:
`UPDATE media_files SET url = replace(url,'<old base>','<new base>');` and the same for `articles.content_md/content_html`, `projects.cover_url`, `advertisements.image_url`, etc.

## Scheduled backups
Run `npm run export -- "/backups/portfolio-$(date +%F).json"` from cron/Actions and upload to a private bucket. Verify by importing into a scratch DB monthly. The admin "Backup history" records manual exports only.

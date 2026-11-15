# Portfolio Platform

An upgrade of the existing Anyaegbu Emmanuel portfolio. The original HTML/CSS/Vanilla JavaScript site and six demo projects remain in place. A custom Node.js API, PostgreSQL schema, admin CMS and supporting services are included.

## Architecture

- `public/` — original public site, article routes, CMS binding script and six demo sites.
- `admin/` — responsive Vanilla JavaScript admin dashboard.
- `server/` — Node.js API, authentication, services, PostgreSQL adapter, SQLite local-test adapter and SQL migrations.
- `scripts/` — admin bootstrap, migration, export/import and media migration.
- `docs/` — audit, deployment, migration and security guidance.
- `test/` — API integration tests, DB adapter regression test and optional Playwright responsive sweep.

Production database is PostgreSQL. SQLite is intended only for local development and automated tests.

## Local setup (Windows CMD)

```bat
npm install
copy .env.example .env
```

Edit `.env` and set a strong `AUTH_SECRET` (at least 32 characters). For local development, use:

```env
NODE_ENV=development
DATABASE_URL=sqlite:./data/dev.sqlite
STORAGE_PROVIDER=local
EMAIL_PROVIDER=log
```

For local development, create an owner account with hidden password entry:

```bat
npm run bootstrap-admin:interactive
```

Start the app:

```bat
npm start
```

Open `http://localhost:8787/` and `http://localhost:8787/admin/`.

Run automated tests:

```bat
npm test
```

## Current local verification

- **31/31 automated tests pass** on Node.js 22.16.0 using the local SQLite adapter, including Dbrij S3 request-signing tests.
- The regression test covers PostgreSQL-style numbered parameter binding in the SQLite adapter, including reordered and repeated placeholders.
- Server, CMS and route JavaScript files pass `node --check`.
- The public site now requests `/api/content` and binds editable biography, hero copy, homepage featured projects, projects, services, skills, experience, social links, navigation and selected site settings. If the API is unavailable, the original static markup remains as a fallback.
- Generic content create/update/delete/reorder/restore operations invalidate the public content cache so published edits can appear without waiting for the cache TTL.

**Not verified here:** a live PostgreSQL/Neon connection, Dbrij Storage credentials/uploads, Brevo email delivery, a production host, AdSense approval/delivery, and real-device testing on physical phones/tablets. The optional Playwright responsive sweep is included in `test/e2e-responsive.mjs`; Playwright must be installed and an authenticated test server started before running it. Do not interpret SQLite tests as proof of PostgreSQL production readiness.

## Environment providers

- Database: PostgreSQL (`pg`) for production; SQLite only for local tests/dev.
- Media: local disk for development; Dbrij S3-compatible Storage for production after credentials are configured.
- Email: log mode for local development; Brevo only after API key and sender verification.
- AI: built-in rules by default; external OpenAI-compatible endpoint optional.

Never commit `.env`, credentials, private keys, database files or production backups.

## Important feature boundaries

- WhatsApp handoff creates a prefilled `wa.me` link. It does not send a WhatsApp message automatically; automated sending requires WhatsApp Business Platform access.
- Email log mode records attempted messages but does not deliver them.
- Rule-based AI assistance works without an external model; real model assistance requires provider credentials.
- AdSense requires Google's eligibility review, account approval, consent handling where required and valid publisher configuration.
- The included GitHub Actions workflow schedules weekly PostgreSQL backups to a separate private Dbrij bucket. Export and restore scripts are also provided; test restores into a separate database before relying on backups.
- The Settings & SEO screen also manages the supported story paragraphs, pricing/process/certification JSON, contact introduction and service CTA fields. Published testimonials render on the About page when present. Some original fallback copy remains in static HTML for offline resilience.

## Production checklist

1. Provision PostgreSQL and run `npm run migrate` against a scratch database first.
2. Set a unique `AUTH_SECRET`, production `DATABASE_URL`, correct `SITE_URL`, trusted proxy settings and allowed origins.
3. Configure Dbrij Storage and verify upload, retrieval and deletion using non-production data.
4. Keep email in log mode initially; configure Brevo later and verify sender authentication and delivery logs before enabling it.
5. Create the owner account securely (email + password; use a long, unique password).
6. Run `npm test` against a test database, then run the browser sweep at all documented viewport widths.
7. Create a backup, restore it into a separate database and verify media files independently.
8. Review `docs/SECURITY.md`, `docs/DEPLOYMENT.md` and `docs/MIGRATION.md` before go-live.


## CMS coverage update (2026-11-14)

The public CMS payload now includes owner-editable contact phone/location, education, portfolio URL, four About story paragraphs, certifications JSON, service pricing cards JSON, process cards JSON, contact introduction, service CTA copy, and footer tagline. The Settings & SEO screen exposes these fields. Pricing/process/certifications JSON must be valid JSON arrays; the original static HTML remains the offline fallback. Published testimonials are rendered on the About page when present.

Example pricing JSON:

```json
[{"title":"Starter","icon":"🌱","price":"₦30,000+","description":"Single-page website","features":["Responsive layout","Contact form"],"popular":false}]
```

Example process JSON:

```json
[{"title":"Discover","icon":"💬","description":"Discuss goals and requirements."}]
```

External credentials and real provider delivery (PostgreSQL/Neon, Dbrij Storage, Brevo, AdSense) must be configured and verified in the deployment environment; this local package cannot certify those external accounts without credentials.


## Zero-budget Render + Neon + Dbrij Storage deployment

This repository includes a Render Blueprint (`render.yaml`) for **one Node.js web service**. The existing server serves the public site, admin dashboard and API from the same origin. PostgreSQL stays on Neon; media and encrypted backups use Dbrij Storage. No Cloudflare Workers rewrite or frontend split is required.

### Automated deployment files

- `.github/workflows/deploy.yml` runs tests and syntax checks on pull requests and pushes to `main`. A successful push to `main` triggers Render through a Deploy Hook.
- `render.yaml` provisions the free Node.js web service and generates `AUTH_SECRET`; other credentials are entered privately in Render.
- `.github/workflows/backup-neon-to-dbrij.yml` creates a weekly PostgreSQL custom-format dump, encrypts it locally and stores it under `backups/` in the private Dbrij bucket. The workflow prunes older backups while retaining at least four.
- `scripts/windows-prepare-deploy.cmd` installs dependencies, runs tests and generates a strong secret on Windows CMD.
- `scripts/bootstrap-admin-interactive.js` creates the first owner account against the configured Neon database with password input hidden.
- `scripts/deployment-check.js` checks required production variables without printing their values.
- `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh` provide manual PostgreSQL backup and restore. Restore is destructive and requires explicit confirmation. Automated backups use a **separate private Dbrij bucket** and a second access key. On Dbrij Free, keys are space-wide rather than bucket-scoped, so the workflow encrypts database dumps before upload; never place database dumps in the public media bucket.

See `docs/DEPLOYMENT.md` for the exact setup sequence and GitHub secret names.

### Important free-tier boundaries

Render Free web services sleep after 15 minutes without inbound traffic, have ephemeral filesystems, no SSH shell and limited monthly usage. The first request after sleep can take around a minute. Neon Free has usage and storage limits. Dbrij Storage Free advertises no-card signup, 5 GB storage, two buckets and two keys. Its product page lists 25 GB monthly transfer while its detailed developer docs list 10 GB; plan around 10 GB until the account dashboard confirms the quota. Free keys are not bucket-scoped.

This setup is suitable for a no-cost initial launch/testing target, not an always-on production SLA. The `.com.ng` domain is intentionally deferred and will be connected later without changing the application architecture.


### No-card provider setup (updated 2026-11-14)

The selected setup removes Cloudflare R2. Dbrij Storage Free is the media and backup object store; its S3 endpoint is `https://s3.dbrij.com`. Configure `DBRIJ_KEY_ID`, `DBRIJ_KEY_SECRET`, `DBRIJ_BUCKET`, `DBRIJ_S3_ENDPOINT`, `DBRIJ_S3_REGION` and `DBRIJ_MEDIA_PUBLIC_BASE` in Render. Keep the backup key and `BACKUP_ENCRYPTION_PASSPHRASE` in GitHub Actions Secrets. See `docs/DEPLOYMENT.md` for exact setup. Cloudinary is not required.

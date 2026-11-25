# Project audit and repair record

## Original foundation

The project retains the existing portfolio pages (`index`, `about`, `projects`, `services`, `contact`) and the six demo sites (`restaurant`, `agency`, `blog`, `shop`, `event`, `calculator`). It remains HTML/CSS/Vanilla JavaScript on the frontend, with a custom Node.js API and PostgreSQL production schema.

## Repair performed in this package

1. Fixed the local SQLite adapter's PostgreSQL placeholder conversion. The previous adapter transformed `$1` into `?1` and passed positional values to Node's `node:sqlite` API, which raised `ERR_SQLITE_ERROR: column index out of range`. The adapter now converts placeholders to anonymous `?` and orders values according to the placeholder occurrences, preserving repeated/reordered `$n` parameters.
2. Added a dedicated regression test for the placeholder conversion.
3. Updated the default test script to run all `test/*.test.js` files.
4. Added public CMS binding through `public/assets/js/cms.js` while retaining the original static HTML as an offline/API-failure fallback.
5. Connected published biography data, homepage featured projects, project listings, services, skills, experience, social links, navigation and selected site settings to the public pages.
6. Added cache invalidation after generic CMS create/update/delete/reorder/restore operations.
7. Updated the README to distinguish what is implemented and locally verified from external integrations and remaining static content.

## Verification record

- Node.js: 22.16.0.
- `npm test`: 18 tests passed, 0 failed.
- `node --check` passed for the changed server and CMS JavaScript files.
- The automated browser sweep exists at `test/e2e-responsive.mjs`, but was not run in this environment because the Playwright package is not installed. Physical device testing and a real PostgreSQL/Neon integration test remain outstanding.

## Remaining work / known boundaries

- Run migrations and all API tests against a real PostgreSQL test database before production.
- Verify Dbrij Storage, Brevo, AdSense and hosting using real credentials/accounts.
- Bind the remaining static about-story paragraphs, pricing/process sections, complete contact details, testimonial display and arbitrary homepage-section blocks to CMS controls.
- Complete full browser-based responsive testing across the 12 viewport widths and test authenticated admin workflows.
- Configure scheduled backups at the hosting provider and verify an actual database + media restore.


## Completion pass (2026-11-14)

- Expanded the public settings allowlist and owner Settings screen to manage About story paragraphs, contact details, education, portfolio URL, certifications, service pricing cards, process cards, service CTA copy, and footer tagline.
- Added public rendering for CMS-managed pricing/process/certification collections and published testimonials. Static HTML remains the deliberate fallback when the API is unavailable.
- Added a production preflight script: `npm run verify:production` checks a live PostgreSQL connection and migration state, performs a Dbrij S3 put/get/delete round trip, and reports Brevo readiness without sending email.
- Added mocked provider tests for the Dbrij S3-compatible request-signing path and Brevo transactional-email request.
- Added an authenticated API regression test for the expanded CMS settings allowlist and public payload.
- Final local suite: 21 tests passed. JavaScript syntax sweep passed.

## External checks still require the owner's credentials / browser environment

A real Neon/PostgreSQL connection, live Dbrij Storage credentials, Brevo sender/domain verification and live message delivery, AdSense approval, host deployment, and browser-based responsive sweep were not performed in this offline build environment. The responsive Playwright script is included but Playwright/Chromium is not installed in this package environment. Run the production preflight after setting credentials and run `PORT=... node test/e2e-responsive.mjs` in an environment with Playwright installed and the app running.


## Full audit pass (2026-11-14): MFA removal, security probes, workflow hardening

Environment limits: no network (npm registry, Neon, R2, Render, GitHub unreachable), no PostgreSQL server. Database-dependent checks ran on the SQLite adapter only.

**Changed**
- Removed all mandatory/optional two-factor code: TOTP/AES helpers, `/api/auth/totp/*` routes, login `code` field, 2FA gate middleware, `REQUIRE_ADMIN_2FA` (config, `render.yaml`, `.env.example`, deployment check), admin enrollment UI, docs and tests. Admin sign-in is email + password.
- The `admins.totp_secret_enc` / `totp_enabled` columns remain in migration 001 (unused) so no existing data is dropped and the migration checksum is unchanged. Drop them later with a deliberate migration if wanted.
- Session cookie lifetime now follows `SESSION_HOURS` (previously hard-coded to 12 h while the server session used the env value).
- Pagination (`limit`, `offset`, `page`) is clamped to positive integers; fractional values returned HTTP 500 and negative values would error on PostgreSQL.
- Static server no longer serves `*.md`, `README*`, `HOW_TO*`, `_headers`, `_redirects`.
- Long unbroken CMS text no longer overflows service rows at 320 px.
- Backup workflow: matching `pg_dump` major version, archive verification, sha256 file, post-upload check, retention pruning (`scripts/prune-backups.sh`, default 56 days, always keeps newest 4). Removed the `awscli` apt install (AWS CLI v2 is preinstalled on `ubuntu-latest`).
- Deploy workflow and `render.yaml` use `npm ci` when `package-lock.json` exists. `.node-version` aligned to 22.16.0.

**Verified here:** 30/30 automated tests, syntax check of every JS file, 377 browser viewport checks (13 widths incl. 320/375/390/430/768/1024/1366/1920, public and admin pages, no overflow or console/CSP errors), live probes for traversal, auth, CSRF, cross-origin, lockout, SQL-injection and XSS strings, upload sniffing.

**Not verified:** real PostgreSQL/Neon migration, Dbrij Storage, Brevo, Turnstile, Render deploy, GitHub Actions runs, `npm audit`, backup/restore against a real database, the rewritten backup workflow.


## Storage provider update (2026-11-14)

Cloudflare R2 configuration was removed after account activation required a payment method. The production media provider is now Dbrij S3-compatible Storage, and the weekly Neon backup workflow targets a private Dbrij bucket. A live Dbrij upload/download/delete and a real encrypted backup/restore have not been run in this environment; perform those checks with the credentials from your own account before accepting customer uploads. Dbrij Free keys are space-wide rather than bucket-scoped, so backups are encrypted client-side before upload.


## Dbrij source update verification (2026-11-14)

- Replaced the production Cloudflare R2 storage provider with a path-style S3-compatible Dbrij provider using the documented `https://s3.dbrij.com` endpoint and `auto` signing region.
- Updated Render variables, `.env.example`, media migration defaults, deployment preflight, production storage verification and deployment/backup documentation.
- Replaced the R2 backup workflow with a Dbrij workflow. PostgreSQL dumps are encrypted before upload, with SHA-256 and HMAC verification files, and old dumps are pruned while keeping at least four.
- Added mocked Dbrij SigV4 path-style tests. Current suite: 31 tests passed, 0 failed.
- No live Dbrij account/key, live object upload, Render deploy, Neon production database, GitHub Actions backup run or encrypted restore was available for testing. These remain mandatory before the site handles real uploads or customer information.


## Completion pass (2026-11-25): RSS distribution, profile accuracy and production checks

**Implemented and merged**
- Added curated external RSS/Atom aggregation for Withubb, OpenAI, Google AI, Google DeepMind, Hugging Face, TechCrunch AI, freeCodeCamp and GitHub Blog. External feed fetching uses a fixed source allowlist, bounded responses, HTTPS-only article links, timeouts and cached/stale fallback responses.
- Completed RSS autodiscovery metadata, the Atom self-link and RSS namespace declarations. The owner's feed now exposes featured images through Media RSS and standard enclosures.
- Kept the owner's own published articles separate from the external reading list: `/feed.xml` is the personal publication feed and `/api/feeds` supplies external cards for `/articles.html`.
- Corrected the remaining contact/project SEO descriptions and static footer fallbacks that still advertised full-stack/backend services. The public offer now reflects frontend-first work and digital content.
- Added a CMS legacy-copy sanitizer so older saved biography/tagline content cannot reintroduce the outdated positioning.
- Fixed a flaky outbound-link security test so its tampered token always differs from the original token.
- Added a Chromium browser workflow for public pages and authenticated admin routes. It uses an isolated SQLite test owner and does not require production credentials.

**Verified**
- Latest production application startup logged `db: postgres`; the database-backed health endpoint passed.
- Live checks passed for the homepage, `/robots.txt`, `/sitemap.xml`, `/api/health`, `/feed.xml`, `/api/feeds` and `/articles.html`.
- The external feed endpoint returned at least eight configured sources and included Withubb. The live check did not emit the warning used when Withubb is unavailable.
- Main-branch automated suite: 104 tests passed, 0 failed.
- Production dependency audit: 0 vulnerabilities.
- Backup/restore shell syntax checks passed.
- Browser sweep: 377 viewport checks across 13 viewport widths, with no horizontal overflow and no browser console/CSP errors.

**Production operations still requiring owner-side verification**
- The Render service currently reports Auto-Deploy enabled and an empty health-check path, while `render.yaml` specifies Auto-Deploy off and `/api/health`. The live service has not yet been synchronized to those Blueprint settings.
- GitHub Actions reported that `RENDER_DEPLOY_HOOK` is not configured. The quality-gated deploy workflow therefore does not trigger a deployment itself. The current Render service's Auto-Deploy setting still causes direct deployments on pushes, so CI is not yet the exclusive release gate.
- A real Dbrij media upload/download/delete round trip and a real encrypted PostgreSQL backup restore have not been verified in this pass. No successful backup/restore run was confirmed.
- Live transactional email delivery and sender-domain verification have not been confirmed. The repository's default email mode is `log`; a provider and verified sender must be configured before relying on email notifications.
- Turnstile and AdSense are optional integrations and have not been verified as active.
- Production admin sign-in and authenticated CMS editing have not been exercised with the owner's actual account in this pass; the browser workflow uses a temporary local test account only.

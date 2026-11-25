# Zero-card deployment guide: Render + Neon + Dbrij Storage

This package keeps the existing application architecture intact:

- **Render Free** runs one Node.js web service serving the existing `public/` website, `admin/` dashboard and `/api/*` API.
- **Neon Free PostgreSQL** remains the production database. Do not replace it with SQLite or Render's temporary local filesystem.
- **Dbrij Storage Free** provides S3-compatible object storage for the public media bucket and a separate private PostgreSQL backup bucket.
- **GitHub Actions** runs tests and syntax checks before triggering Render deployment, and runs a weekly encrypted PostgreSQL backup to Dbrij.
- The `.com.ng` domain is deferred. Start with the Render `onrender.com` hostname and connect the paid domain later.

> **Free-tier warning:** Free tiers have quotas, sleep/suspension behaviour and can change. Render explicitly says Free instances are for hobby/testing, not production applications or an uptime SLA. Dbrij's product page advertises 5 GB storage and 25 GB monthly transfer with no card, while its detailed developer documentation currently states 10 GB monthly transfer. Plan conservatively around **10 GB/month** until your account dashboard confirms the allowance. Dbrij Free allows 2 buckets and 2 keys; the advertised 5 GB storage allowance is shared across both buckets (not 5 GB per bucket). Free keys are not bucket-scoped; bucket/prefix/IP/date-scoped keys require Pro or higher. The backup workflow therefore encrypts PostgreSQL dumps before upload, but a compromised Dbrij free key can still access both buckets in the same storage space.

## A. Accounts and card-verification status

| Service | Purpose | Free signup / card status | Required now? |
|---|---|---|---|
| GitHub Free | Source repository and Actions | Free plan; no paid subscription required | Yes |
| Neon Free | PostgreSQL | Free plan; Neon advertises no-card signup | Yes |
| Dbrij Storage Free | Media and database backup objects | Product page explicitly says 5 GB free, no card needed | Yes |
| Render Free | Node.js hosting | Render's free-deploy guide says no payment is required to deploy a free resource | Yes |
| Cloudflare Turnstile | Optional form bot challenge | Free Turnstile product; does not require activating R2 | Optional |
| Brevo Free | Transactional email | Free plan, up to 300 emails/day; no card required | Later, if real email delivery is wanted |
| Cloudinary Free | Alternative image platform | No card required, but not used in this selected architecture | No |

**Services deliberately removed or not required:** Cloudflare R2 is no longer used because the R2 activation checkout asked for a payment method. Cloudinary is not required because Dbrij handles both media and backups. OpenAI API is not required: `AI_PROVIDER=rules` remains the no-key default. WhatsApp Business Cloud API is not required: the current project generates a prefilled WhatsApp handoff link and does not send API messages. AdSense is optional and subject to Google approval; no AdSense API key is required for ordinary ad-code placement.

**Potential future costs / payment setup:**
- A `.com.ng` domain is a paid registration and is intentionally postponed. The registrar may offer bank transfer or other payment methods; check before purchase.
- OpenAI API usage is paid if you later switch from the built-in rules provider to a paid model.
- WhatsApp Business Platform may require a valid payment method for chargeable outbound messages. Do not add it for the current click-to-WhatsApp handoff feature.
- Any paid Render, Neon, Dbrij or Cloudinary upgrade is optional and must not be enabled for this zero-budget setup.

Official references:
- Dbrij Storage plans: https://forge.dbrij.com/products/storage
- Dbrij Storage S3/API docs: https://developer.dbrij.com/products/storage/docs
- Render Free: https://render.com/docs/free
- Render first deploy (states no payment is required for free resources): https://render.com/docs/your-first-deploy
- Neon pricing: https://neon.com/pricing
- Neon Free plan: https://neon.com/docs/introduction/plans
- GitHub pricing: https://github.com/pricing
- Brevo Free plan: https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans
- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/get-started/
- Cloudinary pricing (not used): https://cloudinary.com/pricing

## B. Prepare the project on Windows CMD

Extract the delivered ZIP. Open CMD in the directory containing `package.json` (the project root, not its parent folder).

```bat
node -v
npm -v
scripts\windows-prepare-deploy.cmd
```

Use Node.js 22 LTS or newer. The script creates `.env` only if one does not already exist, installs dependencies, runs tests and prints a randomly generated `AUTH_SECRET`. Copy that secret into Render's `AUTH_SECRET` environment variable. Never send it in chat or commit it.

After `npm install`, commit the generated `package-lock.json` for reproducible installs. This ZIP intentionally does not contain a lockfile because no dependency change was needed for the Dbrij S3 integration.

## C. Push to GitHub

Create a private GitHub repository. From CMD in the project root:

```bat
git init
git add .
git commit -m "Prepare portfolio platform for deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the URL with your repository. Confirm `.env`, `data/`, local database files and backups are not staged. Never commit credentials, database dumps, private keys or customer data.

## D. Create Neon PostgreSQL

1. Create a Neon project on the Free plan.
2. Copy the PostgreSQL connection string. Use the pooled connection string for the running web app if Neon provides it; keep a **direct** connection string separately for `pg_dump` backups.
3. Keep `sslmode=require` in the connection string.
4. In Render, set `DATABASE_URL` to the app connection string. `DB_POOL_MAX=3` keeps connection usage conservative.
5. The app runs the existing SQL migrations at startup (`AUTO_MIGRATE=true`). The first successful start creates the schema. If migrations fail, `/api/health` fails and Render will not mark the service healthy.

Neon's Free quotas are limited and may change. The Neon Free plan announcement dated October 2, 2026 advertises 1 GB storage per project; monitor the current dashboard for compute/storage usage. Do not treat provider restore history as your only backup.

## E. Create Dbrij buckets and access keys

Official service: https://forge.dbrij.com/products/storage  
Official S3 docs: https://developer.dbrij.com/products/storage/docs

### Create the two buckets

1. Sign in to Dbrij and open **Storage**.
2. Create `portfolio-media` and set its visibility to **Public** (or make only the media upload prefix public). This bucket contains website images and public portfolio assets.
3. Create `portfolio-backups` and keep it **Private**. Never publish this bucket.
4. Copy the **bucket ID** for `portfolio-media`. This is different from its bucket name.

Dbrij's public delivery URL format is `https://files.dbrij.com/<bucketId>/<object-key>`. Therefore set `DBRIJ_MEDIA_PUBLIC_BASE` to `https://files.dbrij.com/YOUR_MEDIA_BUCKET_ID` (no trailing slash). Do not set the bucket name in place of the bucket ID.

### Create the two access keys

Dbrij Free advertises two access keys. Create two fresh S3-compatible keys from the Storage **Access keys** page. Use the `Both` (read/write) permission required by the application and backup workflow. Dbrij displays the secret only once, so copy it immediately into a password manager.

- First key: for the Render application. Save its ID as `DBRIJ_KEY_ID` and its secret as `DBRIJ_KEY_SECRET`.
- Second key: for GitHub Actions backups. Save its ID as GitHub secret `DBRIJ_BACKUP_KEY_ID` and its secret as `DBRIJ_BACKUP_KEY_SECRET`.

**Important Free-plan security limit:** Dbrij's documentation says bucket/prefix/IP/expiry-scoped keys require Pro or higher. On Free, these keys are scoped to the storage space, not to one bucket. Using two keys separates where secrets are stored and makes rotation easier, but it does **not** prevent the Render key from reaching the private backup bucket or the GitHub key from reaching the media bucket. The backup files are encrypted before upload to reduce data exposure. Keep both keys secret and rotate them immediately if exposed.

### Set Render environment variables

- `STORAGE_PROVIDER=dbrij`
- `DBRIJ_S3_ENDPOINT=https://s3.dbrij.com`
- `DBRIJ_S3_REGION=auto`
- `DBRIJ_BUCKET=portfolio-media`
- `DBRIJ_KEY_ID` — Render media key ID
- `DBRIJ_KEY_SECRET` — Render media key secret
- `DBRIJ_MEDIA_PUBLIC_BASE=https://files.dbrij.com/YOUR_MEDIA_BUCKET_ID`

The media bucket must be public (or have a public media prefix) for the stored public URLs to load in visitors' browsers. The backup bucket must remain private.

## F. Configure encrypted GitHub database backups

In GitHub repository **Settings → Secrets and variables → Actions**, add:

- `NEON_BACKUP_DATABASE_URL` — Neon direct (non-pooled) PostgreSQL connection string.
- `DBRIJ_BACKUP_BUCKET` — `portfolio-backups`.
- `DBRIJ_BACKUP_KEY_ID` — second Dbrij access key ID.
- `DBRIJ_BACKUP_KEY_SECRET` — second Dbrij access key secret.
- `BACKUP_ENCRYPTION_PASSPHRASE` — a unique, strong passphrase generated locally and kept separately from the storage keys. Store a secure offline copy; without it, encrypted backups cannot be restored.

The workflow detects the Neon server's PostgreSQL major version, installs the matching `pg_dump` client, creates a custom-format dump, verifies its archive table of contents, encrypts it with GPG/AES-256 before upload, writes SHA-256 and HMAC sidecars, verifies the uploaded object sizes/metadata, and prunes old backups while retaining at least four recent dumps. It runs every Sunday at 04:17 UTC and can also be started manually from GitHub Actions.

The Dbrij Free plan currently lists no versioning. The scheduled workflow's retention script is therefore responsible for pruning old dump files; it is not a substitute for testing recovery. Run a manual workflow once after deployment and verify that the encrypted files appear in the private bucket.

## G. Create the Render service

1. In Render, choose **New → Blueprint** and connect the GitHub repository.
2. Render reads `render.yaml` and proposes one Free Node.js Web Service named `portfolio-platform`.
3. `AUTH_SECRET` is generated by the Blueprint. Supply `DATABASE_URL`, `OWNER_EMAIL`, `WHATSAPP_NUMBER`, and the Dbrij media variables from Section E.
4. The Blueprint uses an 8-hour session lifetime. Admin sign-in is email + password only; two-factor authentication is not enabled or required.
5. Keep `EMAIL_PROVIDER=log` and `AI_PROVIDER=rules` initially. Log email mode does not deliver email. Brevo can be configured later after sender verification if real email delivery is needed.
6. Confirm `STORAGE_PROVIDER=dbrij` and all Dbrij media variables are set before the first successful application start.
7. Create the service. Render builds with `npm install` and starts with `npm start`.

The application uses Render's `RENDER_EXTERNAL_URL` as its canonical base URL when `SITE_URL` is not set. After buying and connecting a custom domain later, set `SITE_URL` to the chosen `https://yourname.com.ng` address.

### Test-gated Render deployments

1. Open the Render service → Settings → Deploy Hook and create a hook.
2. Copy the hook URL.
3. In GitHub repository Settings → Secrets and variables → Actions, add `RENDER_DEPLOY_HOOK` with that URL.
4. The Blueprint sets `autoDeploy: false`. GitHub Actions runs tests, production dependency audit and backup-script syntax checks. The `Deploy portfolio after quality checks` workflow triggers the hook only after the `Portfolio quality checks` workflow succeeds on `main`. Never put the hook URL in code or logs.
5. **Existing live service:** because the current Render service was created before this Blueprint setting, verify Render Dashboard → service → Settings → Build & Deploy and switch Auto-Deploy off if it still shows enabled. The Render API connection used for this pass can inspect deployment status but cannot change that existing service toggle. Until it is switched off, the existing service may still deploy on a push independently of CI.

## H. Create the first owner account

The free Render instance does not provide shell/SSH access. Create the first owner account from your Windows PC using the local project copy and the same Neon database connection string.

1. In the project root, copy `.env.example` to `.env` if needed.
2. In `.env`, set `NODE_ENV=production`, the same `AUTH_SECRET` as Render and the Neon `DATABASE_URL`. The bootstrap script does not need Dbrij credentials.
3. In CMD, run:

```bat
npm run bootstrap-admin:interactive
```

Enter your owner email and a unique password of at least 12 characters. Password entry is hidden. This creates the initial owner and refuses to create a duplicate owner if an administrator already exists.
4. Open `https://YOUR-RENDER-SERVICE.onrender.com/admin/` and sign in.
5. After bootstrapping, remove the production `.env` from the local machine or securely clear the production secrets. Never commit it.

## I. Verify the live deployment

With real production settings privately configured in `.env`, run:

```bat
npm run deploy:check
npm run verify:production
```

`deploy:check` validates required settings without printing secret values. `verify:production` tests a real PostgreSQL connection, migration status and a Dbrij S3 put/get/delete round trip. It does not send an email. If any check fails, do not start accepting real leads or uploads until corrected.

Also test manually:

- Homepage, About, Services, Projects, Contact, Articles and all original demo projects.
- Admin login/logout, create/edit/publish a project and article.
- Upload an image and confirm the image loads from the Dbrij public delivery URL after a Render redeploy.
- Submit a test contact form and confirm the lead appears in admin and the WhatsApp handoff link is correct.
- `/api/health`, `/sitemap.xml` and `/robots.txt`.
- Responsive layouts on narrow mobile, tablet and desktop widths.

## J. Backups and restore

The weekly GitHub workflow stores encrypted database dumps in the **private** `portfolio-backups` bucket. The encryption passphrase is mandatory. Never store it in the repository or in the Dbrij bucket. Verify the first successful GitHub Actions run and perform a restoration drill into a separate empty Neon database before relying on backups.

To run the same encrypted backup pipeline manually, set `DATABASE_URL` to the direct Neon connection string and provide the four Dbrij/passphrase environment variables listed in Section F, then run `bash scripts/backup-postgres.sh`. The script does not leave a plaintext dump in the repository; it uploads only the encrypted dump and integrity sidecars.

To restore a cloud backup, download the `.dump.gpg`, `.dump.gpg.sha256` and `.dump.gpg.hmac` files from the private bucket using the backup key. Set `BACKUP_ENCRYPTION_PASSPHRASE` and point `DATABASE_URL` to a separate recovery database. The restore script verifies the SHA-256 checksum and HMAC, decrypts the GPG archive into a temporary file, and then restores it:

```bash
export BACKUP_ENCRYPTION_PASSPHRASE='YOUR_BACKUP_PASSPHRASE'
export DATABASE_URL='YOUR_SEPARATE_RECOVERY_DATABASE_URL'
export CONFIRM_DATABASE_RESTORE=YES
bash scripts/restore-postgres.sh portfolio-YYYYMMDDTHHMMSSZ.dump.gpg
```

The restore script requires the matching `.sha256` and `.hmac` sidecars in the same directory. It removes its temporary plaintext dump when it exits. Restore is destructive to objects with matching names in the target database. Never experiment on the only production database.

Restore is destructive to objects with matching names in the target database. Never experiment on the only production database. Verify the restored data and public media independently.

## K. Add the `.com.ng` domain later

1. Register the chosen `.com.ng` name when budget permits.
2. Add it to the Render service under Settings → Custom Domains.
3. Follow Render's exact DNS instructions at the registrar. Do not guess DNS targets.
4. Wait for DNS and the managed TLS certificate to validate.
5. Update Render `SITE_URL` to your chosen canonical HTTPS domain.
6. Update the canonical URL in Admin → Settings & SEO.
7. Confirm HTTPS, cookies, login, contact form, sitemap and canonical URLs.

No frontend/backend split or application rewrite is required.

## Free-tier limitations and safety

- **Render Free:** services sleep after 15 minutes without inbound traffic, may restart, have ephemeral filesystems and no SSH shell or persistent disk. Render describes Free as suitable for hobby/testing, not production applications. Unusual high outbound traffic to external APIs/storage can also trigger free-service suspension. Monitor usage.
- **Neon Free:** storage and compute quotas apply. Keep independent backups and monitor the current dashboard.
- **Dbrij Storage Free:** 5 GB total storage shared across the account's buckets/drive, and 2 buckets/2 keys are advertised. The product page lists 25 GB monthly transfer but the detailed developer docs list 10 GB; design around the lower 10 GB figure until the account confirms. Free uploads stop at quota rather than automatically billing. Free keys are space-wide; bucket-scoped keys require Pro. Free-plan versioning is not included in the current plan table.
- **Cloudinary:** no longer part of the deployment; its free plan also advertises no-card signup, but the 25 monthly credits are shared across storage, transformations and bandwidth.
- **Cloudflare:** R2 is removed. Turnstile remains optional and does not require an R2 subscription. Cloudflare WAF/proxy can be evaluated later after a domain is registered and connected; it is not a deployment prerequisite now.
- **Email:** `EMAIL_PROVIDER=log` does not deliver mail. Brevo Free advertises 300 emails/day and no card, but sender identity/domain verification is still required for production email.
- **GitHub scheduled workflows** can be delayed. Check backup runs and test restores periodically.
- This free-tier design is not an always-on production SLA. Upgrade services before the website becomes business-critical.

## Security hardening

Follow [`SECURITY.md`](./SECURITY.md) before public launch. It covers password/session security, rate limiting, optional Turnstile, host restrictions, Cloudflare edge controls for later domain use, and the origin-bypass limitation. The `.env.example` documents every required storage variable.

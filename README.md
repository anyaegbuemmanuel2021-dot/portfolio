# Portfolio Platform

Personal portfolio and content management platform for Anyaegbu Emmanuel Ikenna.

The application combines the public portfolio, project demonstrations, article pages, admin dashboard and API in one Node.js service. The public website uses HTML, CSS and vanilla JavaScript, while the application includes a Node.js backend, API routes and PostgreSQL data storage. Together, these provide a full-stack web application architecture.

## Project structure

| Path | Purpose |
|---|---|
| `public/` | Public website, articles, assets and project demonstrations |
| `admin/` | Content management dashboard |
| `server/` | HTTP API, authentication, application services and database access |
| `scripts/` | Database migration, account setup, import/export and deployment utilities |
| `docs/` | Deployment, security and migration documentation |
| `test/` | Automated tests |

PostgreSQL is the production database. The SQLite adapter is provided for local development and automated tests.

## Requirements

- Node.js 22 or later
- npm
- PostgreSQL for a production deployment
- A compatible object-storage account for remote media storage
- Provider credentials only for the external services you enable

## Local development

Run these commands from the project directory in Windows CMD:

```bat
npm install
copy .env.example .env
```

Edit `.env` and set a unique `AUTH_SECRET` of at least 32 characters. A local development configuration can use:

```env
NODE_ENV=development
DATABASE_URL=sqlite:./data/dev.sqlite
STORAGE_PROVIDER=local
EMAIL_PROVIDER=log
```

Create the first owner account:

```bat
npm run bootstrap-admin:interactive
```

Start the application:

```bat
npm start
```

- Website: http://localhost:8787/
- Admin dashboard: http://localhost:8787/admin/

For automatic restart during development, run `npm run dev`.

## Useful commands

| Command | Description |
|---|---|
| `npm test` | Run the automated test suite |
| `npm run migrate` | Apply database migrations |
| `npm run bootstrap-admin:interactive` | Create an owner account with hidden password entry |
| `npm run export` | Export application data |
| `npm run import` | Import application data |
| `npm run media-migrate` | Migrate stored media |
| `npm run deploy:check` | Check required deployment configuration |
| `npm run verify:production` | Run production verification checks |
| `npm run security:audit` | Audit production dependencies |

## Content management

The admin dashboard manages supported site content, including profile information, CV and media assets, projects, services, articles, navigation, social links, site settings and contact enquiries. Published content is served through the application API; static page content remains available as a fallback where implemented.

Use the dashboard for routine content changes rather than editing generated or database-backed content directly. Before deleting media or records, confirm that they are no longer referenced elsewhere on the site.

## Publishing and RSS feeds

The articles area keeps the portfolio owner's writing separate from selected external publications:

- `/feed.xml` is the portfolio's own RSS 2.0 feed. Only published portfolio articles are included.
- `/api/feeds` supplies the external publication cards shown on `/articles.html`. The curated list includes Withubb, OpenAI, Google AI, Google DeepMind, Hugging Face, TechCrunch AI, freeCodeCamp and GitHub Blog.
- External article cards link readers to the original publisher. The portfolio does not republish the full external article.
- Feed responses are cached, source requests are bounded, and the aggregator retains previously retrieved items when an upstream publication is temporarily unavailable.

The personal feed and external publication list have different purposes. Share `/feed.xml` when inviting readers to subscribe to your own writing; use the Articles page to browse the wider technology reading list.

## Configuration and external services

Copy `.env.example` to `.env` and configure only the providers required by the deployment. Keep all credentials in environment variables or the hosting provider's secret manager.

- **Database:** PostgreSQL for production; SQLite for local development and tests.
- **Media storage:** local storage for development; S3-compatible object storage for production.
- **Email:** log mode for development; a verified email provider for delivery.
- **Ads:** ad placements require valid publisher configuration and approval from the relevant advertising network.

Important operational limits:

- The contact form stores enquiries in the application. Email delivery depends on a configured provider.
- WhatsApp handoff opens a pre-filled link for the visitor; it does not send a WhatsApp message automatically.
- External provider credentials, live uploads, email delivery and advertising approval must be tested in their respective accounts.
- Local SQLite tests do not establish that a production PostgreSQL service is configured correctly.

## Deployment

The repository includes a Render Blueprint, Dockerfile and GitHub Actions workflows. The current deployment design serves the website, admin dashboard and API from one Render web service, with PostgreSQL hosted separately and media stored in an S3-compatible object store.

Important deployment behavior: the current Render service has Auto-Deploy enabled. Render starts a deployment on each `main` push independently of GitHub Actions; the quality checks run in parallel and are not currently a release gate. For strict CI-gated releases, turn off Auto-Deploy in the Render service settings and configure a Render Deploy Hook to run only after the quality-check workflow succeeds.

Before deploying:

1. Provision the production PostgreSQL database.
2. Configure the required environment variables and a unique authentication secret.
3. Run migrations against the intended database.
4. Configure media storage and verify upload, retrieval and deletion.
5. Configure email delivery and verify the sender.
6. Create the owner account using the interactive bootstrap script or the documented secure procedure.
7. Run the test suite and deployment checks.
8. Verify backups by restoring one into a separate test database.
9. Review the deployment and security guides in `docs/`.

The Render free service may sleep when idle and uses an ephemeral filesystem. Persistent user uploads must use configured object storage, not the service's local filesystem. Review current provider limits before relying on a free-tier deployment for production workloads.

## Security

- Never commit `.env`, API keys, passwords, private keys, database files or production backups.
- Use a unique, high-entropy `AUTH_SECRET` and a strong owner password.
- Keep production credentials in the hosting provider's secret settings.
- Restrict access to backup storage and retain encrypted off-site backups.
- Review `docs/SECURITY.md` before making the application public.

## Further documentation

- [Deployment guide](docs/DEPLOYMENT.md)
- [Security guide](docs/SECURITY.md)
- [Migration guide](docs/MIGRATION.md)

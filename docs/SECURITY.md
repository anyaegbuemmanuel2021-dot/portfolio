# Security hardening and deployment runbook

This project has application-level controls, but no website can be described as “maximum secure” or immune to attack. Security is layered and must be maintained. The controls below are intended to raise the cost of common attacks while keeping legitimate visitors and search engines working.

## Built into this release

- **Admin authentication:** scrypt password hashing, minimum password policy, random 256-bit session tokens (only hashes stored), configurable expiry (`SESSION_HOURS`), session revocation and hashed one-hour password reset tokens.
- **No two-factor authentication:** admin sign-in is email + password by design. Compensating controls are the scrypt password policy, per-IP and per-account lockout, CSRF tokens, short-lived sessions and password-reset tokens that are stored hashed.
- **Login abuse controls:** database-backed shared request throttles plus database-backed failed-login lockout and non-enumerating password-reset responses. `CF-Connecting-IP` is used only when `TRUST_PROXY=true` is explicitly set after confirming the actual ingress proxy overwrites that header and direct-origin traffic cannot spoof it. The default is to use the socket peer address. Caller-controlled `X-Forwarded-For` and `True-Client-IP` are never trusted. Login, password-reset, contact, newsletter, analytics, and outbound-link endpoint throttles use atomic database counters shared across app instances; stale windows are pruned opportunistically. Cloudflare edge limits are an additional layer, not a replacement.
- **CSRF and sessions:** SameSite=Strict, HttpOnly, Secure cookies in production, CSRF header on state-changing authenticated requests, and exact-origin validation for supplied Origin headers. Missing Origin is not treated as proof of trust; authenticated writes still require a valid CSRF token.
- **Authorization:** permissions checked server-side on admin routes; no public admin registration.
- **Input and database safety:** schema validation, parameterized SQL, allowlisted dynamic table/column names, bounded JSON request bodies, generic production error responses, safe malformed-cookie handling, and real-path containment checks (including symlinks) before serving static files. Public media reads are restricted to storage keys registered in `media_files` and supported upload MIME types.
- **Uploads:** magic-byte inspection, allowed MIME types only, SVG refused, request/file size caps, a 40-megapixel image-dimension ceiling, mandatory verified positive dimensions even when the optional decoder is unavailable, plus decoder pixel limit; animated GIF, WebP and APNG files are bounded to 500 frames and 40 megapixels of cumulative frame area; and DOCX OOXML package validation (central-directory structure, required Word XML parts, entry/path/count/expanded-size/compression-ratio bounds and CRC checks). Random object keys are used and uploaded content is never executed.
- **Browser protections:** CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS in production, no-store for admin/API responses, and admin `noindex`. The Node application removes application-controlled `X-Powered-By` and `Server` headers; an upstream hosting proxy may still add its own `Server` header outside application control.
- **Contact abuse:** honeypot, validation, per-IP throttling and optional Cloudflare Turnstile with server-side Siteverify. The inbound email webhook uses a constant-time shared-secret comparison and a separate shared per-IP throttle. When Turnstile secret is configured, requests without a valid token are rejected. Tokens are checked for expected hostname and action.
- **Supply chain:** GitHub Actions runs tests, syntax checks and `npm audit --omit=dev --audit-level=high`; Dependabot checks npm dependencies and GitHub Actions monthly.
- **Host restriction (optional):** `ENFORCE_SITE_HOST=true` restricts requests to `SITE_URL` and `SITE_HOST_ALLOWLIST`; `/api/health` remains available for platform health checks. Enable only after the custom domain is attached and the platform health-check behavior has been verified.

## Dbrij Storage credential limitation

The Dbrij Free plan allows two access keys and two buckets, but bucket/prefix/IP/expiry-scoped keys require Pro or higher. Free keys can reach all buckets in the same storage space. The project uses separate media and backup keys for credential location and rotation, but that is not bucket-level isolation. GitHub backup dumps are encrypted before they are uploaded; keep the encryption passphrase separately from the Dbrij keys. A compromised free Dbrij key can still affect objects in both buckets.

## 1. Cloudflare Free plan setup (after the .com.ng domain is registered)

1. Add the domain to Cloudflare and change nameservers at the registrar.
2. Set the web host record to the Render service hostname and enable the orange-cloud proxy. Keep the DNS-only records needed for domain verification as instructed by Render.
3. Set SSL/TLS mode to **Full (strict)** after confirming the origin has HTTPS. Do not use Flexible mode.
4. Leave automatic DDoS protection enabled.
5. In Security → Settings, enable **Bot Fight Mode** if it does not interfere with legitimate integrations. It is a coarse domain-wide toggle and does not provide per-path exceptions on Free. Observe traffic and false positives before enabling it on a site with external integrations.
6. Keep the Free Managed Ruleset enabled where available. Review Security Events after launch.
7. The Free plan currently allows one rate-limiting rule. Configure it for `http.request.uri.path eq "/api/auth/login"`, threshold **8 requests per 10 minutes per IP**, action **Managed Challenge** or **Block** for a short mitigation period. Align this with the app login throttles; do not apply a broad rule to all `/api/*` because it can block legitimate article, media and admin use.
8. Use the Free plan's available custom rules sparingly. Do not challenge `/api/health` or verified search crawlers. Do not blindly block all bots: search engines are important for portfolio discovery.
9. Enable Block AI Bots only if you explicitly do not want AI crawlers to access public pages. It is a content-access choice, not a requirement for security.

Cloudflare Free features and rule limits change. Confirm the current dashboard entitlements before relying on a feature. Bot Fight Mode is domain-wide and cannot be bypassed with custom skip rules on Free. A Cloudflare proxy does not protect requests that reach the Render origin hostname directly; see origin caveat below.

## 2. Turnstile setup (free widget, optional until configured)

1. In Cloudflare dashboard, open Turnstile and create a widget for the final domain (and a development hostname if needed).
2. Choose Managed challenge mode and allow only the exact hostnames used by the site.
3. Add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to Render Environment. Configure both or neither; never expose the secret key in browser code or GitHub.
4. Redeploy. The contact form fetches `/api/security/config`, renders the widget, and submits its short-lived token. The server calls Cloudflare Siteverify and checks the configured site hostname and `contact` action.
5. Test a valid challenge, missing token, expired token and invalid token. The server fails closed when Turnstile is configured but cannot be verified. If Cloudflare's verification service is temporarily unavailable, the contact endpoint returns 503 rather than silently accepting an unverified submission.

The web database-restore endpoint is disabled in production regardless of the legacy `ALLOW_WEB_IMPORT` variable because accepting a caller-supplied database URL can enable server-side request forgery. Use the offline CLI restore procedure. The current newsletter API also requires a Turnstile token when Turnstile is enabled. If a newsletter signup UI is added, it must render a widget with action `newsletter` and send `turnstileToken`.

## 3. Render configuration

- Use a long, unique owner password and keep the owner email account itself well protected, because it is the password-reset channel.
- Keep `AUTH_SECRET` generated and private. Rotating it invalidates existing sessions (CSRF tokens derive from it); plan a controlled rotation rather than changing it casually.
- Set `SITE_URL` to the canonical HTTPS domain after attaching it.
- Set `ALLOWED_ORIGINS` only to exact trusted origins if cross-origin clients are intentionally used. This project is designed to serve frontend and API from the same origin.
- After the custom domain is connected and tested, set `ENFORCE_SITE_HOST=true`; set `SITE_HOST_ALLOWLIST` to any intentional alternate hostnames such as `www.example.com`. The Render health check path is exempt.
- Do not expose database or Dbrij credentials in GitHub, frontend JavaScript, logs or support messages.
- Render Free has no persistent local disk and sleeps; never store production uploads in `data/media` on Render.

### Origin-bypass limitation

Cloudflare WAF and bot controls only inspect traffic that passes through Cloudflare. A Render `onrender.com` hostname can remain a direct route to the origin. Host restriction reduces casual access but is not cryptographic proof that a request passed through Cloudflare; clients can forge ordinary HTTP headers. On a free Render service without private networking/static-IP origin firewall controls, do not claim Cloudflare is the only entry point. Keep application authentication, CSRF, validation and rate limits active even behind Cloudflare. A stronger origin lock-down may require a paid plan or a different hosting architecture.

## 4. Verification before public launch

Run in the project root:

```cmd
npm install
npm test
npm audit --omit=dev --audit-level=high
npm run deploy:check
```

Then verify manually in a staging deployment:

- Admin login with email and password succeeds with no second-factor prompt.
- Admin API requests without a session return 401; requests without a valid CSRF token return 403.
- Contact requests with no Turnstile token fail when Turnstile is enabled; a valid token passes once; a replayed/expired token fails at Siteverify.
- Honeypot submissions are silently accepted without creating a lead.
- Login/contact/newsletter rate limits return 429 after configured thresholds.
- Oversized JSON and unsupported content types are rejected.
- Upload tests reject SVG, executable content, spoofed MIME types and oversized files.
- Production responses include security headers; admin/API responses are not cacheable.
- Public HTML remains usable and search engine pages are not accidentally blocked by bot controls.
- Restore a database backup into a separate test database before trusting the backup schedule.

The application cannot hide headers emitted by Render's edge proxy or prevent direct access to a Render origin through application code alone. Shared database throttles work across instances, but they do not replace edge DDoS controls. Those controls require hosting/edge configuration. Admin sign-in currently has no MFA; protect the owner email and use a unique high-entropy password. A green automated test suite is not a penetration test. Before handling sensitive customer data at scale, commission an independent security review and keep dependencies patched.

## 5. Incident response

If an admin account may be compromised: disable the account at database level, revoke all its sessions, rotate the affected credentials/secrets, inspect `security_events` and `audit_logs`, check GitHub Actions and Render deploy history, and restore from a known-good backup only after identifying the entry point. Do not delete logs before preserving evidence.

## External guidance

- OWASP Node.js Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_security_cheat_sheet.html
- Cloudflare WAF overview: https://developers.cloudflare.com/waf/
- Cloudflare Free plan WAF and rate-limit feature matrix: https://developers.cloudflare.com/waf/
- Cloudflare Bot Fight Mode: https://developers.cloudflare.com/bots/
- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/


## 6. Public RSS feeds

The portfolio exposes two read-only feed features:

- `/feed.xml` publishes up to 50 **published** portfolio articles. It does not query admin drafts or expose credentials, settings, or database data. The Articles page advertises this feed with an RSS subscribe link.
- `/api/feeds` returns a curated selection of external technology publications for the Articles page. It does not fetch arbitrary URLs supplied by visitors.

RSS is public by design. Assume that anything in `/feed.xml` can be copied, indexed, cached, or republished by third-party feed readers. Do not put private drafts, client information, unpublished work, or confidential material in a published article.

The implementation applies XML escaping to portfolio article fields, emits a standard RSS self-discovery link, and rate-limits both public feed endpoints. External feed fetching uses a fixed HTTPS source list, rejects redirects, has an eight-second timeout and a one-megabyte streamed response limit, rejects DTD/entity declarations, and returns generic errors instead of exposing upstream details. External titles and descriptions are rendered as text in the browser; they are not inserted as HTML.

When adding a feed source, keep its URL hard-coded in the trusted source list after reviewing the publisher. Never accept arbitrary feed URLs from query parameters or admin content without a separate SSRF-safe design. Continue to keep the feed cache and response limits in place. A public RSS endpoint cannot prevent ordinary scraping or copying; rate limits are abuse controls, not access control.

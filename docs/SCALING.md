# Portfolio scaling and load-balancer readiness

## Current deployment

The portfolio runs as one Render Free web-service instance. There is no application-level load balancer in this repository, and none should be added: Render provides the managed load balancer when a web service is scaled to multiple instances.

The current Free plan is limited to one instance. Keep the active `plan: free` setting and the paid scaling lines commented in `render.yaml` until an upgrade is approved.

## Enable Render's managed load balancing later

When ready to pay for multiple instances:

1. Confirm the application-readiness checklist below is complete.
2. In `render.yaml`, change `plan: free` to `plan: starter` (or another eligible paid plan).
3. Uncomment `numInstances: 2` under the service. Two instances are the minimum useful configuration for distributing requests and surviving one instance going unhealthy.
4. Sync/apply the Blueprint in Render, or set the same paid plan and instance count in the service's Compute settings. The repository's `autoDeploy: false` means a Git push alone does not apply Blueprint settings or deploy the service.
5. Confirm Render reports two healthy instances and verify the public site, admin login, article pages, uploads, and API.
6. Increase instance count only after checking database connection limits and measured traffic.

Render routes incoming requests across healthy instances automatically. Do not add Nginx, HAProxy, or a custom Node reverse proxy inside this application just to achieve load balancing.

## Application-readiness checklist before scaling

- [x] Admin sessions are stored in PostgreSQL, not process memory.
- [x] Production media is configured for Dbrij S3-compatible object storage, not instance-local disk.
- [x] A health endpoint exists at `/api/health` and the Blueprint declares it as the health-check path.
- [ ] Replace the in-memory `buckets` rate limiter in `server/lib/http.js` with a shared limiter (PostgreSQL or managed Redis/Key Value). With multiple instances, each current in-memory map is separate, so limits can be multiplied and inconsistent.
- [ ] Ensure scheduled article publishing runs on only one worker or uses a PostgreSQL advisory lock/atomic claim. The current `setInterval` scheduler starts in every web instance; scaling the web service would start duplicate schedulers.
- [ ] Check PostgreSQL's connection limit before increasing instances. The current pool is configured with `DB_POOL_MAX=3`; total possible application connections grow with instance count.
- [ ] Verify all runtime-generated files and sessions use shared services. Never rely on a file written to one container being available on another.
- [ ] Verify graceful shutdown and health checks during a rolling deploy.

## Important distinction

This repository can be prepared for Render's managed load balancer while the service remains on Free, but actual load balancing cannot run on the Free instance. The commented paid settings are a documented switch, not an active paid configuration. The application-readiness items marked incomplete must be fixed before enabling multiple instances.

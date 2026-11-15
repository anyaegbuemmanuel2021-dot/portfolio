import { verifyTurnstile } from '../lib/turnstile.js';
import { config } from '../config.js';
import { HttpError, validate } from '../lib/validate.js';
import { rateLimit } from '../lib/http.js';
import { tableRepo, kv, fixRow } from '../repositories/base.js';
const PUBLIC_SETTINGS = ['site_title', 'site_tagline', 'contact_email', 'whatsapp_number', 'footer_text', 'seo_default_title', 'seo_default_description', 'canonical_base', 'adsense_enabled', 'adsense_client', 'contact_phone', 'contact_location', 'education', 'portfolio_url', 'about_story_1', 'about_story_2', 'about_story_3', 'about_story_4', 'certifications_json', 'pricing_json', 'process_json', 'contact_intro', 'service_cta_title', 'service_cta_body', 'footer_tagline'];
export function publicRoutes(app, { db, leads, articles, analytics, ads, email, aiOn }) {
  const settings = kv(db, 'site_settings'); let cache = { t: 0, v: null };
  const pub = async t => (await tableRepo(db, t, ['is_published']).list({ publishedOnly: true, limit: 500 })).rows;
  async function content() {
    if (cache.v && Date.now() - cache.t < 30e3) return cache.v; const s = await settings.all(); const settingsPub = Object.fromEntries(PUBLIC_SETTINGS.filter(k => k in s).map(k => [k, s[k]]));
    const net = await ads.network(); const bio = fixRow((await db.query('SELECT headline, body, photo_url, cv_url FROM biography LIMIT 1')).rows[0]) || null;
    cache = { t: Date.now(), v: { settings: settingsPub, biography: bio, navigation: await pub('navigation_items'), services: await pub('services'), projects: await pub('projects'), skills: await pub('skills'), experience: await pub('experience'), testimonials: await pub('testimonials'), social_links: await pub('social_links'), homepage_sections: await pub('homepage_sections'), ads: { adsense: { enabled: !!net.adsense?.enabled, client: net.adsense?.enabled ? net.adsense.value : null }, self_managed_enabled: net.self_managed ? net.self_managed.enabled : true } } }; return cache.v;
  }
  app.invalidate = () => { cache.t = 0; };
  app.get('/api/security/config', async () => ({ turnstile: { enabled: Boolean(config.turnstile.siteKey && config.turnstile.secretKey), siteKey: config.turnstile.siteKey || null } }));
  app.get('/api/content', async () => ({ data: await content(), headers: { 'Cache-Control': 'public, max-age=30' } }));
  app.get('/api/services', async () => (await content()).services);
  app.get('/api/projects', async () => (await content()).projects);
  app.get('/api/projects/:slug', async ctx => { const p = (await content()).projects.find(x => x.slug === ctx.params.slug); if (!p) throw new HttpError(404, 'Project not found'); return p; });
  app.get('/api/articles', async ctx => { const r = await articles.listPublic(ctx.query); return { data: r.rows, meta: { total: r.total, page: r.page, limit: r.limit }, headers: { 'Cache-Control': 'public, max-age=30' } }; });
  app.get('/api/articles/categories', async () => (await db.query('SELECT name, slug FROM article_categories ORDER BY name')).rows);
  app.get('/api/articles/:slug', async ctx => ({ data: await articles.getPublic(ctx.params.slug), headers: { 'Cache-Control': 'public, max-age=30' } }));
  const CONTACT = { name: { required: true, max: 100 }, email: { type: 'email' }, phone: { max: 30, pattern: /^[+\d][\d\s().-]{5,29}$/ }, service: { max: 120 }, budget: { max: 60 }, message: { required: true, max: 4000 } };
  app.post('/api/contacts', async ctx => {
    rateLimit('contact:' + ctx.ipHash, 8, 3600e3); if (ctx.body.website) return { status: 201, data: { id: null, status: 'new', whatsapp_url: null, received: true } }; // honeypot
    await verifyTurnstile(ctx.body.turnstileToken, ctx.ip, { secret: config.turnstile.secretKey, expectedHostname: new URL(config.siteUrl).hostname, expectedAction: 'contact' });
    const d = validate(CONTACT, ctx.body); if (!d.email && !d.phone) throw new HttpError(422, 'Validation failed', { email: 'Provide an email or a phone/WhatsApp number' }); if (d.message.length < 10) throw new HttpError(422, 'Validation failed', { message: 'Please write a little more detail' });
    const r = await leads.submit(d, { ipHash: ctx.ipHash }); return { status: 201, data: { ...r, received: true } };
  });
  app.post('/api/analytics/track', async ctx => { rateLimit('track:' + ctx.ipHash, 120, 60e3); const b = ctx.body || {}; const o = { ip: ctx.ip, ua: ctx.req.headers['user-agent'], dnt: ctx.req.headers.dnt === '1' || ctx.req.headers['sec-gpc'] === '1' };
    await analytics.track({ path: b.path, referrer: b.referrer, type: b.type, slug: b.slug }, o); if (b.type === 'article' && b.slug) await articles.countView(String(b.slug), new Date().toISOString().slice(0, 10)); return { status: 202, data: { ok: true } }; });
  app.get('/api/advertisements/serve', async ctx => { const ad = await ads.serve(String(ctx.query.placement || ''), { ua: ctx.req.headers['user-agent'] }); return { data: ad, headers: { 'Cache-Control': 'no-store' } }; });
  app.get('/api/advertisements/:id/click', async ctx => { const url = await ads.click(ctx.params.id, { ua: ctx.req.headers['user-agent'] }); if (!url) throw new HttpError(404, 'Not found'); return { __raw: true, status: 302, headers: { Location: url, 'Cache-Control': 'no-store' }, body: '' }; });
  app.post('/api/email/subscribe', async ctx => { rateLimit('sub:' + ctx.ipHash, 5, 3600e3); await verifyTurnstile(ctx.body.turnstileToken, ctx.ip, { secret: config.turnstile.secretKey, expectedHostname: new URL(config.siteUrl).hostname, expectedAction: 'newsletter' }); const d = validate({ email: { type: 'email', required: true }, name: { max: 100 } }, ctx.body); await email.subscribe(d.email, d.name); return { status: 201, data: { subscribed: true } }; });
  app.get('/api/email/unsubscribe/:token', async ctx => { const ok = await email.unsubscribe(ctx.params.token); return { __raw: true, status: ok ? 200 : 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: ok ? 'You have been unsubscribed.' : 'Link not valid.' }; });
  app.get('/api/health', async () => { await db.query('SELECT 1'); return { status: 'ok', time: new Date().toISOString() }; });
}

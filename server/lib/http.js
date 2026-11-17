// Tiny HTTP framework: routing, JSON envelope, cookies, security headers, rate limiting, static files.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { config } from '../config.js';
import { HttpError } from './validate.js';
import { hmac } from './security.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2' };
export const mimeFor = p => MIME[extname(p).toLowerCase()] || 'application/octet-stream';

export function securityHeaders(res, { admin = false, api = false } = {}) {
  const csp = api ? "default-src 'none'; frame-ancestors 'none'"
    : admin ? "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"
    : "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://pagead2.googlesyndication.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' https: https://challenges.cloudflare.com; frame-src https://googleads.g.doubleclick.net https://challenges.cloudflare.com; frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'";
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', admin || api ? 'DENY' : 'SAMEORIGIN'); res.setHeader('X-Permitted-Cross-Domain-Policies', 'none'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (admin || api) res.setHeader('X-Robots-Tag', 'noindex');
  if (admin || api) res.setHeader('Cache-Control', 'no-store');
}
export const parseCookies = h => Object.fromEntries((h || '').split(';').map(c => c.trim().split(/=(.*)/s)).filter(p => p[0]).map(([k, v]) => [k, decodeURIComponent(v || '')]));
export const cookie = (name, val, { maxAge, path = '/' } = {}) => `${name}=${encodeURIComponent(val)}; Path=${path}; HttpOnly; SameSite=Strict${config.isProd ? '; Secure' : ''}${maxAge != null ? `; Max-Age=${maxAge}` : ''}`;

const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now(); const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (b.length >= limit) { buckets.set(key, b); throw new HttpError(429, 'Too many requests. Please slow down and try again later.'); }
  b.push(now); buckets.set(key, b); if (buckets.size > 20000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 3600e3) buckets.delete(k); }, 600e3).unref();

export const clientIp = req => (process.env.TRUST_PROXY === 'false' ? null : (req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress || '0.0.0.0';
export const ipHash = ip => hmac('ip:' + ip).slice(0, 24);

export function readBody(req, limit) {
  return new Promise((res, rej) => {
    const len = Number(req.headers['content-length'] || 0); if (len > limit) return rej(new HttpError(413, 'Payload too large'));
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { rej(new HttpError(413, 'Payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks))); req.on('error', rej);
  });
}

export function createApp({ log }) {
  const routes = [];
  const app = {
    add(method, path, opts, handler) { if (!handler) { handler = opts; opts = {}; } const keys = []; const re = new RegExp('^' + path.replace(/:([a-z_]+)/gi, (_, k) => (keys.push(k), '([^/]+)')) + '/?$'); routes.push({ method, re, keys, opts, handler }); },
    get: (p, o, h) => app.add('GET', p, o, h), post: (p, o, h) => app.add('POST', p, o, h), put: (p, o, h) => app.add('PUT', p, o, h), patch: (p, o, h) => app.add('PATCH', p, o, h), delete: (p, o, h) => app.add('DELETE', p, o, h),
    middleware: null, // (ctx, route) => void, set by index.js to enforce auth
    async handle(req, res) {
      const url = new URL(req.url, 'http://x'); const started = Date.now();
      const ip = clientIp(req); const ctx = { req, res, url, query: Object.fromEntries(url.searchParams), ip, ipHash: ipHash(ip), cookies: parseCookies(req.headers.cookie), params: {}, body: null, setCookies: [] };
      const send = (status, payload, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers, ...(ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : {}) }); res.end(JSON.stringify(payload)); };
      ctx.send = send;
      try {
        if (config.isProd && config.enforceSiteHost && url.pathname !== '/api/health') {
          const allowed = new Set([new URL(config.siteUrl).host.toLowerCase(), ...config.siteHostAllowlist]);
          if (!allowed.has(String(req.headers.host || '').toLowerCase())) throw new HttpError(421, 'This host is not served by this application');
        }
        if (url.pathname.startsWith('/api/')) {
          securityHeaders(res, { api: true });
          const origin = req.headers.origin;
          if (origin && config.allowedOrigins.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Filename'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS'); }
          if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
          rateLimit('g:' + ctx.ipHash, 300, 60e3);
          if (url.pathname === '/api/auth/login') rateLimit('edge-login:' + ctx.ipHash, 8, 10 * 60e3);
          if (url.pathname === '/api/contacts') rateLimit('edge-contact:' + ctx.ipHash, 6, 60 * 60e3);
          if (url.pathname === '/api/email/subscribe') rateLimit('edge-subscribe:' + ctx.ipHash, 4, 60 * 60e3);
          const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
          if (!r) throw new HttpError(404, 'Not found');
          const m = url.pathname.match(r.re); r.keys.forEach((k, i) => (ctx.params[k] = decodeURIComponent(m[i + 1])));
          if (app.middleware) await app.middleware(ctx, r.opts);
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            const buf = await readBody(req, r.opts.maxBody || 1024 * 1024); const ct = req.headers['content-type'] || '';
            if (r.opts.raw) ctx.body = buf; else if (buf.length) { if (!ct.includes('application/json')) throw new HttpError(415, 'Expected application/json'); try { ctx.body = JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); } } else ctx.body = {};
          }
          const out = await r.handler(ctx);
          if (out && out.__raw) { res.writeHead(out.status || 200, { ...out.headers, ...(ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : {}) }); return res.end(out.body); }
          const env = out && typeof out === 'object' && 'data' in out && Object.keys(out).every(k => ['data', 'status', 'meta', 'headers'].includes(k)); // explicit envelope; anything else is plain data
          if (env) return send(out.status || 200, { ok: true, data: out.data ?? null, ...(out.meta ? { meta: out.meta } : {}) }, out.headers);
          return send(200, { ok: true, data: out ?? null });
        }
        return await serveStatic(ctx);
      } catch (e) {
        if (!e.status && e.code) { if (e.code === '22P02' || e.code === '22007') { e.status = 404; e.message = 'Not found'; } else if (e.code === '23505') { e.status = 409; e.message = 'A record with that unique value already exists'; } else if (e.code === '23503') { e.status = 409; e.message = 'This record is referenced by other data'; } } // PostgreSQL error classes
        const status = e.status || 500; if (status >= 500) log.error('request_failed', { path: url.pathname, err: e.stack || String(e) });
        if (!res.headersSent) { if (url.pathname.startsWith('/api/')) send(status, { ok: false, error: { message: status >= 500 ? 'Internal server error' : e.message, ...(e.details ? { details: e.details } : {}) } }); else { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(status === 404 ? 'Not found' : 'Error'); } }
      } finally { if (url.pathname.startsWith('/api/') && process.env.LOG_REQUESTS) log.info('req', { m: req.method, p: url.pathname, s: res.statusCode, ms: Date.now() - started }); }
    },
  };
  app.server = () => { const server = createServer({ maxHeaderSize: 16 * 1024 }, (req, res) => app.handle(req, res)); server.headersTimeout = 10_000; server.requestTimeout = 30_000; server.keepAliveTimeout = 5_000; server.maxHeadersCount = 100; return server; };
  return app;
}

async function tryFile(p) { try { const s = await stat(p); return s.isFile() ? p : null; } catch { return null; } }
async function serveStatic(ctx) {
  const { req, res, url } = ctx; if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed');
  let p = decodeURIComponent(url.pathname); if (p.includes('\0')) throw new HttpError(400, 'Bad path');
  if (/(^|\/)(_[^/]*|README[^/]*|HOW_TO[^/]*)$/i.test(p) || /\.(md|map)$/i.test(p)) throw new HttpError(404, 'Not found'); // never serve dev docs or hosting-platform config files
  const isAdmin = p === '/admin' || p.startsWith('/admin/'); let root = config.staticDirs.public, rel = p;
  if (isAdmin) { root = config.staticDirs.admin; rel = p.replace(/^\/admin/, '') || '/'; }
  else if (p.startsWith('/media/') && config.storage.provider === 'local') { root = join(process.cwd(), config.storage.localDir); rel = p.slice(6); }
  else if (/^\/articles\/[^/]+\/?$/.test(p)) rel = '/article.html';
  else if (p === '/articles' || p === '/articles/') rel = '/articles.html';
  else if (p === '/sitemap.xml' || p === '/robots.txt' || p === '/ads.txt' || p === '/feed.xml') { const { dynamicText } = await import('../routes/seo.js'); const t = await dynamicText(p); if (t) { securityHeaders(res); res.writeHead(200, { 'Content-Type': mimeFor(p), 'Cache-Control': 'public, max-age=300' }); return res.end(t); } }
  if (!isAdmin && !p.startsWith('/media/')) {
    const { dynamicHtml } = await import('../routes/seo.js');
    const generated = await dynamicHtml(p);
    if (generated) {
      securityHeaders(res);
      const status = typeof generated === 'object' ? (generated.status || 200) : 200;
      const body = Buffer.from(typeof generated === 'object' ? (generated.body || '') : generated);
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': status === 404 ? 'no-store' : 'public, max-age=300' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
  }
  const base = normalize(root); let file = normalize(join(base, rel)); if (!file.startsWith(base)) throw new HttpError(403, 'Forbidden');
  if (rel.endsWith('/')) file = join(file, 'index.html');
  let found = await tryFile(file) || await tryFile(file + '.html') || await tryFile(join(file, 'index.html'));
  if (!found) throw new HttpError(404, 'Not found');
  const ext = extname(found).toLowerCase(); securityHeaders(res, { admin: isAdmin });
  let data = await readFile(found);
  if (ext === '.html' && !isAdmin) {
    const { decorateHtml } = await import('../routes/seo.js');
    data = Buffer.from(await decorateHtml(data.toString('utf8'), p));
  }
  const long = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.woff2'].includes(ext);
  res.writeHead(200, { 'Content-Type': mimeFor(found), 'Content-Length': data.length, 'Cache-Control': isAdmin ? 'no-cache' : p.startsWith('/media/') ? 'public, max-age=31536000, immutable' : long ? 'public, max-age=86400' : 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : data);
}

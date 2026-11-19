// Generic admin CRUD for simple content tables, driven by a whitelist (no table/column names ever come from the client).
import { randomUUID } from "node:crypto";
import { tableRepo } from '../repositories/base.js';
import { validate, slugify, HttpError } from '../lib/validate.js';
const T = (max, req) => ({ type: 'string', max, required: req }); const U = { type: 'url' }; const I = (min, max) => ({ type: 'int', min, max }); const B = { type: 'bool' };
const common = { sort_order: I(0, 100000), is_published: B };
export const ENTITIES = {
  services: { perm: 'content', rev: 1, slug: 'title', unique: 'title', schema: { title: T(120, true), slug: T(100), summary: T(300), description: T(5000), seo_title: T(60), seo_description: T(160), canonical_url: U, icon: T(40), price_note: T(120), ...common } },
  projects: { perm: 'content', rev: 1, slug: 'title', unique: 'title', usage: ['cover_url'], schema: { title: T(120, true), slug: T(100), summary: T(400), description: T(5000), seo_title: T(60), seo_description: T(160), canonical_url: U, url: U, repo_url: U, category: T(60), tags: T(200), cover_url: U, is_featured: B, ...common } },
  skills: { perm: 'content', rev: 1, unique: 'name', schema: { name: T(80, true), category: T(60), level: I(0, 100), ...common } },
  experience: { perm: 'content', rev: 1, schema: { role: T(120, true), organization: T(120), location: T(120), start_date: T(30), end_date: T(30), description: T(3000), ...common } },
  testimonials: { perm: 'content', rev: 1, unique: 'author_name', schema: { author_name: T(100, true), author_role: T(120), quote: T(1500, true), avatar_url: U, rating: I(1, 5), ...common } },
  social_links: { perm: 'content', rev: 1, unique: 'platform', schema: { platform: T(40, true), url: { type: 'url', required: true, relative: false }, icon: T(60), ...common } },
  navigation_items: { perm: 'content', rev: 1, unique: 'label', schema: { label: T(60, true), url: { type: 'url', required: true }, location: { type: 'string', enum: ['header', 'footer'] }, ...common } },
  homepage_sections: { perm: 'content', rev: 1, unique: 'key', schema: { key: { type: 'string', required: true, max: 60, pattern: /^[a-z0-9_-]+$/ }, title: T(200), body: T(8000), data: T(8000), ...common } },
  article_categories: { perm: 'articles', slug: 'name', unique: 'name', schema: { name: T(80, true), slug: T(80), description: T(300) }, order: 'name ASC' },
  article_tags: { perm: 'articles', slug: 'name', unique: 'name', schema: { name: T(40, true), slug: T(60) }, order: 'name ASC' },
  media_folders: { perm: 'media', unique: 'name', timestamps: 'created', schema: { name: T(80, true), parent_id: T(40) }, order: 'name ASC' },
  email_templates: { perm: 'email', unique: 'name', schema: { name: T(80, true), subject: T(200, true), body: T(10000, true) }, order: 'name ASC' },
  email_saved_replies: { perm: 'email', unique: 'title', schema: { title: T(100, true), body: T(5000, true) }, order: 'title ASC' },
  email_campaigns: { perm: 'email', unique: 'name', timestamps: 'created', schema: { name: T(100, true), subject: T(200, true), body: T(20000, true) }, order: 'created_at DESC' },
  advertisers: { perm: 'ads', unique: 'name', schema: { name: T(120, true), contact_email: { type: 'email' }, notes: T(1000) }, order: 'name ASC' },
  ad_placements: { perm: 'ads', unique: 'key', schema: { key: { type: 'string', required: true, max: 40, pattern: /^[a-z0-9_-]+$/ }, label: T(80, true), description: T(200), is_active: B }, noTimestamps: 1, order: 'key ASC' },
  ad_campaigns: { perm: 'ads', unique: 'name', schema: { advertiser_id: T(40), name: T(120, true), start_at: { type: 'date' }, end_at: { type: 'date' }, is_active: B, notes: T(1000) }, order: 'created_at DESC' },
  advertisements: { perm: 'ads', unique: 'title', usage: ['image_url'], schema: { title: T(120, true), campaign_id: T(40), advertiser_id: T(40), image_url: U, alt: T(160), destination_url: { type: 'url', required: true, relative: false }, placement_key: T(40, true), start_at: { type: 'date' }, end_at: { type: 'date' }, is_active: B, weight: I(1, 100) }, order: 'created_at DESC' },
};
export function entityRoutes(app, { db, auth, syncUsage }) {
  const invalidate = () => { if (typeof app.invalidate === 'function') app.invalidate(); };
  const repos = {}; for (const [name, e] of Object.entries(ENTITIES)) repos[name] = tableRepo(db, name, Object.keys(e.schema), { order: e.order || 'sort_order ASC, created_at ASC', searchCols: ['title', 'name', 'label', 'subject', 'platform', 'role', 'author_name'].filter(c => c in e.schema), timestamps: e.timestamps ?? !e.noTimestamps });
  const ent = ctx => { const e = ENTITIES[ctx.params.entity]; if (!e) throw new HttpError(404, 'Unknown resource'); ctx.ent = e; ctx.repo = repos[ctx.params.entity]; return e; };
  const guard = { auth: true }; const check = async ctx => { ent(ctx); if (!ctx.admin.permissions.includes(ctx.ent.perm)) throw new HttpError(403, 'Forbidden'); };
  const prep = async (ctx, partial) => { const d = validate(ctx.ent.schema, ctx.body, { partial }); if (ctx.ent.slug && (d[ctx.ent.slug] || d.slug)) d.slug = slugify(d.slug || d[ctx.ent.slug]); else if (ctx.ent.slug && !partial) d.slug = slugify(d[ctx.ent.slug]); if ('is_active' in ctx.ent.schema && d.is_active === undefined && !partial) d.is_active = true; return d; };
  const snap = (ctx, row) => ctx.ent.rev && db.query('INSERT INTO content_revisions (id,entity,entity_id,snapshot,admin_id,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), ctx.params.entity, row.id, JSON.stringify(row), ctx.admin.id, new Date().toISOString()]);
  const saveUnique = async (ctx, data, id = null, old = null) => db.tx(async tx => {
    const field = ctx.ent.unique;
    if (field && data[field] != null && String(data[field]).trim()) {
      const value = String(data[field]).trim();
      if (tx.dialect === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['entity-name:' + ctx.params.entity + ':' + value.toLowerCase()]);
      const duplicate = (await tx.query(`SELECT id FROM ${ctx.params.entity} WHERE lower(trim(${field})) = lower(trim($1)) ${id ? 'AND id <> $2' : ''} LIMIT 1`, id ? [value, id] : [value])).rows[0];
      if (duplicate) throw new HttpError(409, 'Name already exists', { field });
    }
    if (id && old && ctx.ent.rev) await tx.query('INSERT INTO content_revisions (id,entity,entity_id,snapshot,admin_id,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), ctx.params.entity, id, JSON.stringify(old), ctx.admin.id, new Date().toISOString()]);
    return id ? ctx.repo.update(id, data, tx) : ctx.repo.create(data, tx);
  });
  const uniq = e => { if (/UNIQUE|unique|duplicate/i.test(e.message)) throw new HttpError(409, 'A record with that unique value already exists'); throw e; };
  app.get('/api/admin/:entity', guard, async ctx => { await check(ctx); const { rows, total } = await ctx.repo.list({ search: ctx.query.q, limit: ctx.query.limit, offset: ((+ctx.query.page || 1) - 1) * (+ctx.query.limit || 100) }); return { data: rows, meta: { total } }; });
  app.post('/api/admin/:entity', guard, async ctx => { await check(ctx); const row = await saveUnique(ctx, await prep(ctx, false)).catch(uniq); if (ctx.ent.usage) await syncUsage(ctx.params.entity, row.id, ctx.ent.usage.map(k => row[k])); invalidate(); await auth.audit(ctx, 'create', ctx.params.entity, row.id); return { status: 201, data: row }; });
  app.get('/api/admin/:entity/:id', guard, async ctx => { await check(ctx); const r = await ctx.repo.get(ctx.params.id); if (!r) throw new HttpError(404, 'Not found'); return r; });
  app.put('/api/admin/:entity/:id', guard, async ctx => { await check(ctx); const old = await ctx.repo.get(ctx.params.id); if (!old) throw new HttpError(404, 'Not found'); const row = await saveUnique(ctx, await prep(ctx, true), ctx.params.id, old).catch(uniq); if (ctx.ent.usage) await syncUsage(ctx.params.entity, row.id, ctx.ent.usage.map(k => row[k])); invalidate(); await auth.audit(ctx, 'update', ctx.params.entity, row.id); return row; });
  app.delete('/api/admin/:entity/:id', guard, async ctx => { await check(ctx); if (!(await ctx.repo.remove(ctx.params.id))) throw new HttpError(404, 'Not found'); await db.query('DELETE FROM media_usage_references WHERE entity = $1 AND entity_id = $2', [ctx.params.entity, ctx.params.id]); invalidate(); await auth.audit(ctx, 'delete', ctx.params.entity, ctx.params.id); return { deleted: true }; });
  app.post('/api/admin/:entity/reorder', guard, async ctx => { await check(ctx); if (!Array.isArray(ctx.body.ids)) throw new HttpError(422, 'ids required'); await ctx.repo.reorder(ctx.body.ids.map(String)); invalidate(); return { reordered: ctx.body.ids.length }; });
  app.get('/api/admin/:entity/:id/revisions', guard, async ctx => { await check(ctx); return (await db.query('SELECT id, created_at FROM content_revisions WHERE entity = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 30', [ctx.params.entity, ctx.params.id])).rows; });
  app.post('/api/admin/:entity/:id/restore/:rev', guard, async ctx => { await check(ctx); const r = (await db.query('SELECT snapshot FROM content_revisions WHERE id = $1 AND entity = $2 AND entity_id = $3', [ctx.params.rev, ctx.params.entity, ctx.params.id])).rows[0]; if (!r) throw new HttpError(404, 'Revision not found'); const s = JSON.parse(r.snapshot); const cur = await ctx.repo.get(ctx.params.id); const d = {}; for (const k of Object.keys(ctx.ent.schema)) if (k in s) d[k] = s[k]; await auth.audit(ctx, 'restore', ctx.params.entity, ctx.params.id); const restored = await saveUnique(ctx, d, ctx.params.id, cur); invalidate(); return restored; });
}

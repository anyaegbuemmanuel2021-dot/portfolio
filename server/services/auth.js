import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { HttpError, validate, isEmail } from '../lib/validate.js';
import { hashPassword, verifyPassword, passwordProblems, token, sha256, csrfFor } from '../lib/security.js';
import { fixRow } from '../repositories/base.js';

export const PERMISSIONS = ['content', 'articles', 'media', 'leads', 'email', 'ads', 'analytics', 'system', 'admins'];
const now = () => new Date().toISOString();
export function authService(db, mailer) {
  const event = (type, email, ipHash, details) => db.query('INSERT INTO security_events (id,type,email,ip_hash,details,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), type, email || null, ipHash || null, details || null, now()]);
  const perms = async id => { const r = (await db.query('SELECT DISTINCT p.key FROM admin_role_assignments a JOIN role_permissions rp ON rp.role_id = a.role_id JOIN permissions p ON p.id = rp.permission_id WHERE a.admin_id = $1', [id])).rows; return r.map(x => x.key); };
  const publicAdmin = async a => ({ id: a.id, email: a.email, display_name: a.display_name, permissions: await perms(a.id) });
  const svc = {
    async bootstrap({ email, password, name }) { // Used only by scripts/bootstrap-admin.js
      if (Number((await db.query('SELECT COUNT(*) AS c FROM admins')).rows[0].c) > 0) throw new Error('An admin already exists. Bootstrap is disabled.');
      if (!isEmail(email)) throw new Error('Invalid email'); const pr = passwordProblems(password); if (pr.length) throw new Error('Password needs ' + pr.join(', '));
      const id = randomUUID(), t = now(); await db.query('INSERT INTO admins (id,email,display_name,password_hash,is_active,created_at,updated_at) VALUES ($1,$2,$3,$4,TRUE,$5,$5)', [id, email.toLowerCase(), name || 'Owner', await hashPassword(password), t]);
      const role = (await db.query("SELECT id FROM roles WHERE name = 'owner'")).rows[0]; await db.query('INSERT INTO admin_role_assignments (admin_id, role_id) VALUES ($1,$2)', [id, role.id]); return id;
    },
    async login({ email, password }, { ipHash, userAgent }) {
      email = String(email || '').trim().toLowerCase(); const since = new Date(Date.now() - 15 * 60e3).toISOString();
      const fails = Number((await db.query("SELECT COUNT(*) AS c FROM security_events WHERE type = 'login_failed' AND created_at > $1 AND (email = $2 OR ip_hash = $3)", [since, email, ipHash])).rows[0].c);
      if (fails >= 8) { await event('login_locked', email, ipHash); throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.'); }
      const a = fixRow((await db.query('SELECT * FROM admins WHERE email = $1', [email])).rows[0]);
      const dummy = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '=='; const ok = await verifyPassword(password || '', a ? a.password_hash : dummy).catch(() => false);
      if (!a || !a.is_active || !ok) { await event('login_failed', email, ipHash, 'bad credentials'); throw new HttpError(401, 'Invalid email or password'); }
      const raw = token(32), t = now(); await db.query('INSERT INTO sessions (id,admin_id,token_hash,ip_hash,user_agent,expires_at,created_at,last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [randomUUID(), a.id, sha256(raw), ipHash, String(userAgent || '').slice(0, 200), new Date(Date.now() + config.sessionHours * 3600e3).toISOString(), t]);
      await db.query('UPDATE admins SET last_login_at = $1 WHERE id = $2', [t, a.id]); await event('login_ok', email, ipHash);
      return { raw, admin: await publicAdmin(a), csrf: csrfFor(raw) };
    },
    async resolve(raw) {
      if (!raw) return null; const s = (await db.query('SELECT * FROM sessions WHERE token_hash = $1', [sha256(raw)])).rows[0];
      if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) return null;
      const a = fixRow((await db.query('SELECT * FROM admins WHERE id = $1', [s.admin_id])).rows[0]); if (!a || !a.is_active) return null;
      if (Date.now() - new Date(s.last_seen_at) > 60e3) db.query('UPDATE sessions SET last_seen_at = $1 WHERE id = $2', [now(), s.id]).catch(() => {});
      return { session: s, admin: await publicAdmin(a), csrf: csrfFor(raw) };
    },
    logout: raw => db.query('UPDATE sessions SET revoked_at = $1 WHERE token_hash = $2', [now(), sha256(raw)]),
    revokeOthers: (adminId, currentId) => db.query('UPDATE sessions SET revoked_at = $1 WHERE admin_id = $2 AND id <> $3 AND revoked_at IS NULL', [now(), adminId, currentId]),
    sessions: async adminId => (await db.query('SELECT id, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE admin_id = $1 AND revoked_at IS NULL AND expires_at > $2 ORDER BY created_at DESC', [adminId, now()])).rows,
    async changePassword(adminId, current, next, currentSessionId) {
      const a = (await db.query('SELECT * FROM admins WHERE id = $1', [adminId])).rows[0]; if (!(await verifyPassword(current || '', a.password_hash))) throw new HttpError(403, 'Current password is incorrect');
      const pr = passwordProblems(next); if (pr.length) throw new HttpError(422, 'New password needs ' + pr.join(', '));
      await db.query('UPDATE admins SET password_hash = $1, updated_at = $2 WHERE id = $3', [await hashPassword(next), now(), adminId]); await svc.revokeOthers(adminId, currentSessionId);
    },
    async requestReset(email, ipHash) { // Always succeeds from the caller's view (no account enumeration)
      email = String(email || '').toLowerCase(); const a = (await db.query('SELECT id, email FROM admins WHERE email = $1 AND is_active = TRUE', [email])).rows[0]; await event('reset_requested', email, ipHash); if (!a) return;
      const raw = token(32); await db.query('INSERT INTO password_reset_requests (id,admin_id,token_hash,expires_at,created_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), a.id, sha256(raw), new Date(Date.now() + 3600e3).toISOString(), now()]);
      const link = `${config.siteUrl}/admin/#reset=${raw}`;
      try {
        if (mailer.real) {
          await mailer.send({ to: a.email, subject: 'Reset your admin password', text: `Use this link within 1 hour:\n${link}\n\nIgnore this email if you did not request it.` });
        } else if (!config.isProd) {
          // Local development convenience only. Never write password-reset tokens to production logs.
          console.info('[development password reset link]', link);
        } else {
          console.warn('Password reset email was not sent: configure a real email provider.');
        }
      } catch (e) {
        console.error('reset email failed', e.message);
      }
    },
    async resetPassword(raw, password) {
      const r = (await db.query('SELECT * FROM password_reset_requests WHERE token_hash = $1', [sha256(raw || '')])).rows[0]; if (!r || r.used_at || new Date(r.expires_at) < new Date()) throw new HttpError(400, 'Reset link is invalid or expired');
      const pr = passwordProblems(password); if (pr.length) throw new HttpError(422, 'Password needs ' + pr.join(', '));
      await db.tx(async t => { await t.query('UPDATE admins SET password_hash = $1, updated_at = $2 WHERE id = $3', [await hashPassword(password), now(), r.admin_id]); await t.query('UPDATE password_reset_requests SET used_at = $1 WHERE id = $2', [now(), r.id]); await t.query('UPDATE sessions SET revoked_at = $1 WHERE admin_id = $2 AND revoked_at IS NULL', [now(), r.admin_id]); });
    },
    audit: (ctx, action, entity, entityId, details) => db.query('INSERT INTO audit_logs (id,admin_id,action,entity,entity_id,ip_hash,details,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), ctx.admin?.id || null, action, entity || null, entityId || null, ctx.ipHash, details ? JSON.stringify(details).slice(0, 2000) : null, now()]).catch(() => {}),
  };
  return svc;
}

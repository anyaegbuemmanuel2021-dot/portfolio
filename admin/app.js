import { h, $, api, session, toast, modal, confirmBox, form, table, badge, fmtDate, bytes, lineChart } from './ui.js';
import { contentView, articlesView, categoriesTab, mediaView, leadsView, emailView, adsView, analyticsView } from './views.js';
const app = $('#app');
const NAV = [['dashboard', 'Dashboard', '▦'], ['content', 'Website content', '✎'], ['articles', 'Articles', '<i class="fa-solid fa-sparkles emoji-replacement-icon" aria-hidden="true"></i>'], ['media', 'Media', '<i class="fa-solid fa-image emoji-replacement-icon" aria-hidden="true"></i>'], ['leads', 'Leads & CRM', '<i class="fa-solid fa-phone emoji-replacement-icon" aria-hidden="true"></i>'], ['email', 'Email', '<i class="fa-solid fa-sparkles emoji-replacement-icon" aria-hidden="true"></i>'], ['ads', 'Advertising', '₦'], ['analytics', 'Analytics', '<i class="fa-solid fa-chart-line emoji-replacement-icon" aria-hidden="true"></i>'], ['system', 'Security & system', '<i class="fa-solid fa-gear emoji-replacement-icon" aria-hidden="true"></i>']];
session.onExpire = () => { session.admin = null; renderLogin('Your session expired. Please sign in again.'); };

// ---------- login / reset ----------
function renderLogin(note) {
  const reset = (location.hash.match(/^#reset=(.+)$/) || [])[1]; 
  const email = h('input', { type: 'email', id: 'em', autocomplete: 'username', required: true }), pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true }); const msg = h('div', { class: 'err', role: 'alert' }, note || '');
  if (reset) { const np = h('input', { type: 'password', autocomplete: 'new-password' }); app.replaceChildren(h('div', { class: 'login' }, h('h1', {}, 'Set a new password'), h('label', {}, 'New password (12+ chars, upper, lower, digit)'), np, msg, h('button', { class: 'btn primary', onclick: async () => { try { await api('POST', '/auth/reset', { token: reset, password: np.value }); history.replaceState(null, '', '/admin/'); toast('Password updated. Sign in.', 'ok'); renderLogin(); } catch (e) { msg.textContent = e.message; } } }, 'Update password'))); return; }
  const go = async ev => { ev.preventDefault(); msg.textContent = ''; try { const r = await api('POST', '/auth/login', { email: email.value, password: pw.value }); session.csrf = r.data.csrf; session.admin = r.data.admin; start(); } catch (e) { msg.textContent = e.message; } };
  app.replaceChildren(h('form', { class: 'login', onsubmit: go }, h('h1', {}, 'Admin sign in'), h('label', { for: 'em' }, 'Email'), email, h('label', { for: 'pw' }, 'Password'), pw, msg, h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'), h('button', { class: 'btn', type: 'button', onclick: async () => { if (!email.value) { msg.textContent = 'Enter your email first.'; return; } await api('POST', '/auth/forgot', { email: email.value }).catch(() => {}); toast('If that account exists, a reset link was sent.', 'ok'); } }, 'Forgot password'))));
  email.focus();
}

// ---------- shell + router ----------
function shell(content) {
  const side = h('nav', { class: 'side', 'aria-label': 'Main' }, h('div', { class: 'brand' }, 'Admin', h('span', {}, '.')), NAV.map(([k, l, i]) => h('a', { class: 'nav', href: '#/' + k, 'aria-current': route()[0] === k ? 'page' : undefined, onclick: () => closeNav() }, h('span', { 'aria-hidden': 'true' }, i), l)), h('a', { class: 'nav', href: '/', target: '_blank', rel: 'noopener' }, h('span', { 'aria-hidden': 'true' }, '<i class="fa-solid fa-sparkles emoji-replacement-icon" aria-hidden="true"></i>'), 'View site'), h('button', { class: 'btn', style: undefined, onclick: async () => { await api('POST', '/auth/logout').catch(() => {}); session.admin = null; renderLogin(); } }, 'Sign out'));
  const scrim = h('div', { class: 'scrim', onclick: () => closeNav() }); function closeNav() { side.classList.remove('open'); scrim.classList.remove('open'); }
  const top = h('header', { class: 'top' }, h('button', { class: 'btn sm', 'aria-label': 'Open menu', 'aria-expanded': 'false', onclick: e => { side.classList.add('open'); scrim.classList.add('open'); e.target.setAttribute('aria-expanded', 'true'); } }, '☰'), h('strong', {}, 'Admin'));
  app.replaceChildren(h('div', { class: 'shell' }, side, h('div', {}, top, h('main', { class: 'main', id: 'view', tabindex: '-1' }, content)), scrim));
}
const route = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard').split('/');
async function render() {
  if (!session.admin) return renderLogin();
  const [r, a, b] = route(); const qs = (location.hash.split('?')[1] || ''); let v;
  try {
    v = r === 'content' ? contentView(a) : r === 'articles' ? (a === 'categories' ? h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'Categories'), h('a', { href: '#/articles' }, '← Articles')), h('div', { class: 'panel' }, categoriesTab())) : h('div', {}, h('div', { class: 'row' }, h('a', { class: 'btn sm', href: '#/articles/categories' }, 'Manage categories')), articlesView(a))) : r === 'media' ? mediaView() : r === 'leads' ? leadsView() : r === 'email' ? emailView(a, qs) : r === 'ads' ? adsView(a) : r === 'analytics' ? analyticsView() : r === 'system' ? systemView(a) : await dashboard();
  } catch (e) { v = h('p', { class: 'err' }, e.message); }
  shell(v); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

// ---------- dashboard ----------
async function dashboard() {
  const o = (await api('GET', '/system/overview')).data; const c = (n, l) => h('div', { class: 'card' }, h('div', { class: 'n' }, n ?? '—'), h('div', { class: 'l' }, l));
  const health = o.health; const warn = []; if (!o.email.real_delivery) warn.push('Email provider is “log”: emails are recorded but NOT delivered.'); if (!health.https_cookie_secure) warn.push('Development mode: cookies are not Secure. Set NODE_ENV=production behind HTTPS.'); if (health.migrations_pending) warn.push(health.migrations_pending + ' database migration(s) pending.'); if (!o.backup) warn.push('No backup has been taken yet. Download one in Security & system → Backups.');
  return h('div', {}, h('h1', {}, 'Dashboard'), warn.map(w => h('div', { class: 'notice' }, w)),
    h('div', { class: 'cards' }, c(o.visitors, 'Visitors (30 d)'), c(o.page_views, 'Page views (30 d)'), c(o.articles.published, 'Published articles'), c(o.articles.draft, 'Draft articles'), c(o.articles.views, 'Article views'), c(o.project_views, 'Project views'), c(o.contact_submissions, 'Contact submissions'), c(o.leads.new, 'New leads'), c(o.leads.qualified, 'Qualified leads'), c(o.leads.converted, 'Converted leads'), c(`${o.email.sent} / ${o.email.failed}`, 'Emails sent / failed'), c(`${o.ads.impressions} / ${o.ads.clicks}`, 'Ad impressions / clicks')),
    h('div', { class: 'panel' }, h('h2', {}, 'Traffic — last 30 days'), lineChart(o.series, [{ k: 'views', color: '#c8a96e', label: 'views' }, { k: 'visitors', color: '#60a5fa', label: 'visitors' }])),
    h('div', { class: 'grid2' }, h('div', { class: 'panel' }, h('h2', {}, 'Recent leads'), table([{ label: 'Name', render: l => h('a', { href: '#/leads' }, l.name) }, { label: 'Status', render: l => badge(l.status) }, { label: 'When', render: l => fmtDate(l.created_at) }], o.recent_leads, { empty: 'No leads yet.' })),
      h('div', { class: 'panel' }, h('h2', {}, 'Storage & health'), h('dl', { class: 'kv' }, h('dt', {}, 'Database'), h('dd', {}, health.database + (o.storage.db_bytes != null ? ' · ' + bytes(o.storage.db_bytes) + ' used' : '')), h('dt', {}, 'Media'), h('dd', {}, `${o.storage.media_files} files · ${bytes(o.storage.media_bytes)} (${o.storage.provider})`), h('dt', {}, 'Last backup'), h('dd', {}, o.backup ? fmtDate(o.backup.created_at) + ' · ' + o.backup.status : 'never'), h('dt', {}, 'Email'), h('dd', {}, health.email_provider), h('dt', {}, 'AI assistant'), h('dd', {}, health.ai), h('dt', {}, 'Migrations'), h('dd', {}, health.migrations_pending ? health.migrations_pending + ' pending' : 'up to date')), db_bar(o.storage.db_bytes))));
}
const db_bar = b => b == null ? null : h('div', {}, h('div', { class: 'help' }, `Neon free tier ≈ 0.5–1 GB (verify current limits): ${(b / 1073741824 * 100).toFixed(1)}% of 1 GB`), h('progress', { max: 100, value: Math.min(100, b / 1073741824 * 100), 'aria-label': 'Database usage' }));

// ---------- security & system ----------
function systemView(tab = 'security') {
  const tabs = { security: 'Security', backups: 'Backups & migration', audit: 'Audit & logs' }; const body = h('div', { class: 'panel' });
  const views = {
    security: async () => {
      const me = (await api('GET', '/auth/me')).data.admin; const ss = (await api('GET', '/auth/sessions')).data; const cur = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Current password' }), nxt = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password' });
      {
        body.append(h('h2', {}, 'Change password'), h('label', {}, 'Current password'), cur, h('label', {}, 'New password (12+ chars, upper, lower, digit)'), nxt, h('p', {}, h('button', { class: 'btn primary', onclick: async () => { await api('POST', '/auth/password', { current: cur.value, next: nxt.value }).then(() => { toast('Password changed; other sessions signed out', 'ok'); cur.value = nxt.value = ''; }, e => toast(e.message, 'bad')); } }, 'Change password')),
          h('h2', {}, 'Active sessions'), table([{ label: 'Device', k: 'user_agent' }, { label: 'Signed in', render: s => fmtDate(s.created_at) }, { label: 'Last seen', render: s => fmtDate(s.last_seen_at) }, { label: '', render: s => s.current ? badge('ok') : '' }], ss), h('p', {}, h('button', { class: 'btn', onclick: async () => { await api('POST', '/auth/sessions/revoke-others'); toast('Other sessions revoked', 'ok'); render(); } }, 'Sign out other sessions')));
      }
    },
    backups: async () => {
      const hist = (await api('GET', '/backups')).data; const mg = (await api('GET', '/migrations')).data;
      body.append(h('h2', {}, 'Download a full database backup'), h('p', { class: 'help' }, 'A JSON export of every table (includes password hashes and leads — store it privately). Sessions and reset tokens are excluded. Media files are separate: use npm run media-migrate or your object-storage tools.'), h('button', { class: 'btn primary', onclick: async () => { try { const { blob, checksum } = await api('POST', '/backups/export', undefined, { blob: true }); const a = h('a', { href: URL.createObjectURL(blob), download: `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove(); toast('Backup downloaded. SHA-256: ' + (checksum || '').slice(0, 12) + '…', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }, 'Export backup (JSON)'),
        h('h2', {}, 'History'), table([{ label: 'When', render: b => fmtDate(b.created_at) }, { label: 'Kind', k: 'kind' }, { label: 'Status', render: b => badge(b.status) }, { label: 'Size', render: b => bytes(b.size_bytes) }, { label: 'SHA-256', render: b => (b.checksum || '').slice(0, 12) }], hist, { empty: 'No backups yet.' }),
        h('h2', {}, 'Migrations'), h('p', {}, `${mg.applied.length} applied · ${mg.pending.length} pending${mg.drift.length ? ' · DRIFT: ' + mg.drift.join(', ') : ''}`), table([{ label: 'Version', k: 'version' }, { label: 'Name', k: 'name' }, { label: 'Applied', render: m => fmtDate(m.applied_at) }], mg.applied),
        h('h2', {}, 'Move to another PostgreSQL host'), h('p', { class: 'help' }, 'Restoring into another database is done from the command line for safety: npm run migrate, npm run import — see docs/MIGRATION.md.'), h('h2', {}, 'Data retention'), h('button', { class: 'btn', onclick: async () => { if (await confirmBox('Delete analytics older than the retention period and logs older than 30 days?', 'Purge')) await api('POST', '/system/purge').then(r => toast(`Purged ${r.data.purged_rows} rows`, 'ok'), e => toast(e.message, 'bad')); } }, 'Purge old analytics'));
    },
    audit: async () => { const a = (await api('GET', '/system/audit')).data, s = (await api('GET', '/system/security-events')).data, l = (await api('GET', '/system/logs')).data; body.append(h('h2', {}, 'Audit log'), table([{ label: 'When', render: x => fmtDate(x.created_at) }, { label: 'Admin', k: 'email' }, { label: 'Action', k: 'action' }, { label: 'Entity', k: 'entity' }], a), h('h2', {}, 'Security events'), table([{ label: 'When', render: x => fmtDate(x.created_at) }, { label: 'Type', k: 'type' }, { label: 'Email', k: 'email' }], s), h('h2', {}, 'Application warnings/errors'), table([{ label: 'When', render: x => fmtDate(x.created_at) }, { label: 'Level', k: 'level' }, { label: 'Message', k: 'message' }], l, { empty: 'None.' })); },
  };
  views[tab]?.().catch(e => body.append(h('p', { class: 'err' }, e.message)));
  return h('div', {}, h('h1', {}, 'Security & system'), h('div', { class: 'tabs', role: 'tablist' }, Object.entries(tabs).map(([k, l]) => h('a', { class: 'btn', role: 'tab', 'aria-selected': String(k === tab), href: '#/system/' + k }, l))), body);
}

async function start() { await render(); }
(async () => { try { const r = await api('GET', '/auth/me', undefined, { quiet: true }); session.csrf = r.data.csrf; session.admin = r.data.admin; } catch { /* not signed in */ } render(); })();

// Tiny DOM + API helpers. All text goes through textContent (no innerHTML with data) → XSS-safe by construction.
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else if (k === 'checked' || k === 'disabled' || k === 'selected') e[k] = !!v; else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const fmtDate = d => d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const bytes = n => n == null ? 'n/a' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
export const session = { csrf: '', admin: null, onExpire: () => {} };
export async function api(method, path, body, opts = {}) {
  const headers = { Accept: 'application/json' }; if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
  let payload; let requestPath = path; if (opts.raw) { payload = body; if (opts.filename) requestPath += (requestPath.includes('?') ? '&' : '?') + 'filename=' + encodeURIComponent(opts.filename); } else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let r; let j;
  for (let attempt = 0; attempt < (opts.raw ? 3 : 1); attempt++) {
    r = await fetch('/api' + requestPath, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' });
    if (![423, 502, 503, 504].includes(r.status) || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
  }
  if (opts.blob) { if (!r.ok) throw new Error('Download failed'); return { blob: await r.blob(), checksum: r.headers.get('X-Backup-Checksum') }; }
  const responseText = await r.text();
  try { j = JSON.parse(responseText); } catch { j = { ok: false, error: { message: `Upload/request was blocked by the hosting layer (HTTP ${r.status}). Please retry in a moment.` } }; }
  if (r.status === 401 && !path.startsWith('/auth/login') && !opts.quiet) session.onExpire();
  if (!r.ok || j.ok === false) { const e = new Error(j.error?.message || 'Request failed'); e.status = r.status; e.details = j.error?.details; throw e; }
  return j;
}
export function toast(msg, kind = '') { const t = h('div', { class: 'toast ' + kind }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3500); }
export function modal(title, body, { onClose } = {}) {
  const prev = document.activeElement; const close = () => { bg.remove(); document.removeEventListener('keydown', esc); prev?.focus?.(); onClose?.(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) close(); } }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('div', { class: 'row between' }, h('h2', {}, title), h('button', { class: 'btn sm', 'aria-label': 'Close', onclick: close }, '✕')), body));
  document.addEventListener('keydown', esc); document.body.append(bg); (bg.querySelector('input,select,textarea,button.btn:not([aria-label=Close])') || bg.querySelector('button'))?.focus(); return { close, el: bg };
}
export const confirmBox = (msg, label = 'Delete') => new Promise(res => { let settled = false; let m; const finish = value => { if (settled) return; settled = true; m.close(); res(value); }; m = modal('Please confirm', h('div', {}, h('p', {}, msg), h('div', { class: 'row' }, h('button', { class: 'btn danger', type: 'button', onclick: () => finish(true) }, label), h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, 'Cancel'))), { onClose: () => { if (!settled) { settled = true; res(false); } } }); });
// Form builder: fields [{k,label,type,options,help,required}] → {el, get(), setErrors()}
export function form(fields, values = {}, { pickImage } = {}) {
  const inputs = {}, errs = {}; const el = h('div', {});
  for (const f of fields) {
    const id = 'f_' + f.k + Math.random().toString(36).slice(2, 6); let inp; const v = values[f.k];
    if (f.type === 'textarea') inp = h('textarea', { id, rows: f.rows || 4, value: v ?? '' });
    else if (f.type === 'bool') inp = h('input', { id, type: 'checkbox', checked: v === undefined ? f.def ?? false : !!v });
    else if (f.type === 'select') inp = h('select', { id }, f.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return h('option', { value: val, selected: String(v ?? f.def ?? '') === String(val) }, lab); }));
    else if (f.type === 'datetime') inp = h('input', { id, type: 'datetime-local', value: v ? new Date(v).toISOString().slice(0, 16) : '' });
    else inp = h('input', { id, type: f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : f.type === 'password' ? 'password' : 'text', value: v ?? '', inputmode: f.type === 'number' ? 'numeric' : undefined, autocomplete: f.type === 'password' ? 'new-password' : 'off', maxlength: f.max });
    const imagePreview = f.type === 'image' ? h('img', { class: 'field-image-preview', alt: 'Selected image preview', hidden: true }) : null;
    const updateImagePreview = () => { if (!imagePreview) return; const url = String(inp.value || '').trim(); if (!url) { imagePreview.hidden = true; imagePreview.removeAttribute('src'); return; } imagePreview.src = (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || url.startsWith('/')) ? url : '/' + (url.startsWith('./') ? url.slice(2) : url); imagePreview.hidden = false; };
    if (imagePreview) { inp.addEventListener('input', updateImagePreview); inp.addEventListener('change', updateImagePreview); updateImagePreview(); }
    inputs[f.k] = inp; errs[f.k] = h('div', { class: 'err', role: 'alert' });
    const extra = f.type === 'image' && pickImage ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { const u = await pickImage(); if (u) { inp.value = u; inp.dispatchEvent(new Event('input', { bubbles: true })); } } }, 'Choose from library') : null;
    el.append(f.type === 'bool' ? h('div', { class: 'row' }, inp, h('label', { for: id, style: undefined }, f.label)) : h('div', {}, h('label', { for: id }, f.label + (f.required ? ' *' : '')), inp, extra, imagePreview, f.help && h('div', { class: 'help' }, f.help)), errs[f.k]);
  }
  return { el, get() { const o = {}; for (const f of fields) { const i = inputs[f.k]; let v = f.type === 'bool' ? i.checked : i.value; if (f.type === 'number') v = v === '' ? null : Number(v); else if (f.type === 'datetime') v = v ? new Date(v).toISOString() : null; o[f.k] = v; } return o; },
    setErrors(d) { for (const k in errs) errs[k].textContent = d?.[k] || ''; } };
}
export function table(cols, rows, { empty = 'Nothing here yet.' } = {}) {
  if (!rows.length) return h('p', { class: 'muted' }, empty);
  return h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c.label)))), h('tbody', {}, rows.map(r => h('tr', {}, cols.map(c => h('td', { class: c.actions ? 'actions' : '' }, c.render ? c.render(r) : r[c.k] ?? '—')))))));
}
export const badge = s => h('span', { class: 'badge b-' + s }, String(s).replace(/_/g, ' '));
export function pager(meta, go) { const pages = Math.max(1, Math.ceil(meta.total / (meta.limit || 20))); return h('div', { class: 'row between' }, h('span', { class: 'muted' }, `${meta.total} total · page ${meta.page || 1}/${pages}`), h('div', { class: 'row' }, h('button', { class: 'btn sm', disabled: (meta.page || 1) <= 1, onclick: () => go((meta.page || 1) - 1) }, '← Prev'), h('button', { class: 'btn sm', disabled: (meta.page || 1) >= pages, onclick: () => go((meta.page || 1) + 1) }, 'Next →'))); }
const NS = 'http://www.w3.org/2000/svg'; const s = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
export function lineChart(series, keys, { w = 640, hgt = 200 } = {}) { // [{day, views, visitors}] — no inline styles (CSP)
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'chart', role: 'img', 'aria-label': 'Traffic chart' }); if (!series.length) { const t = s('text', { x: 10, y: 20 }); t.textContent = 'No data for this period'; svg.append(t); return svg; }
  const max = Math.max(1, ...series.flatMap(d => keys.map(k => d[k.k]))); const pad = 28, x = i => pad + (series.length === 1 ? (w - 2 * pad) / 2 : i * (w - 2 * pad) / (series.length - 1)), y = v => hgt - pad - v / max * (hgt - 2 * pad);
  for (const f of [0, .5, 1]) { svg.append(s('line', { x1: pad, x2: w - pad, y1: y(max * f), y2: y(max * f), stroke: 'currentColor', 'stroke-opacity': .12 })); const t = s('text', { x: 2, y: y(max * f) + 3 }); t.textContent = Math.round(max * f); svg.append(t); }
  keys.forEach(k => { svg.append(s('polyline', { fill: 'none', stroke: k.color, 'stroke-width': 2, points: series.map((d, i) => `${x(i)},${y(d[k.k])}`).join(' ') })); series.forEach((d, i) => { const c = s('circle', { cx: x(i), cy: y(d[k.k]), r: 3, fill: k.color }); const tt = s('title', {}); tt.textContent = `${d.day}: ${d[k.k]} ${k.label}`; c.append(tt); svg.append(c); }); });
  [0, series.length - 1].forEach(i => { const t = s('text', { x: x(i), y: hgt - 8, 'text-anchor': i ? 'end' : 'start' }); t.textContent = series[i].day; svg.append(t); }); return svg;
}

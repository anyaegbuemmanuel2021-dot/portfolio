// Small schema validator: {field: {type, required, max, min, enum, pattern}} -> {value, errors}
export class HttpError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details; } }
export const slugify = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'item';
export const isEmail = s => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const safeUrl = (s, { relative = true } = {}) => { if (!s) return true; try { if (relative && /^\/(?!\/)/.test(s)) return true; const u = new URL(s); return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol); } catch { return false; } };
export function validate(schema, input, { partial = false } = {}) {
  const out = {}, errors = {}; input = input && typeof input === 'object' ? input : {};
  for (const [k, r] of Object.entries(schema)) {
    let v = input[k];
    if (v === undefined || v === null || v === '') { if (r.required && !partial) errors[k] = 'required'; else if (v !== undefined) out[k] = r.type === 'bool' ? false : null; continue; }
    switch (r.type || 'string') {
      case 'bool': v = v === true || v === 'true' || v === 1 || v === '1'; break;
      case 'int': v = Number(v); if (!Number.isInteger(v)) { errors[k] = 'must be an integer'; continue; } if (r.min != null && v < r.min || r.max != null && v > r.max) { errors[k] = 'out of range'; continue; } break;
      case 'email': v = String(v).trim().toLowerCase(); if (!isEmail(v)) { errors[k] = 'invalid email'; continue; } break;
      case 'url': v = String(v).trim(); if (!safeUrl(v, r)) { errors[k] = 'invalid url'; continue; } break;
      case 'date': v = new Date(v); if (isNaN(v)) { errors[k] = 'invalid date'; continue; } v = v.toISOString(); break;
      default: v = String(v).trim(); if (r.max && v.length > r.max) { errors[k] = `max ${r.max} characters`; continue; } if (r.enum && !r.enum.includes(v)) { errors[k] = 'invalid value'; continue; } if (r.pattern && !r.pattern.test(v)) { errors[k] = 'invalid format'; continue; }
    }
    out[k] = v;
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  return out;
}

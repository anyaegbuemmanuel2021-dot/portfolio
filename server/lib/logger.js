// Structured JSON logs to stdout; warnings/errors are also persisted to application_logs when a db is attached.
import { randomUUID } from 'node:crypto';
let db = null; export const attachDb = d => { db = d; };
const emit = (level, message, ctx = {}) => {
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ t: new Date().toISOString(), level, message, ...ctx }));
  if (db && level !== 'info') db.query('INSERT INTO application_logs (id, level, message, context, created_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), level, message, JSON.stringify(ctx).slice(0, 4000), new Date().toISOString()]).catch(() => {});
};
export const log = { info: (m, c) => emit('info', m, c), warn: (m, c) => emit('warn', m, c), error: (m, c) => emit('error', m, c) };

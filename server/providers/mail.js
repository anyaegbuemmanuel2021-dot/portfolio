// Email providers: "brevo" (HTTPS API) and "log" (records only — never claims delivery).
import { config } from '../config.js';
export function createMailer() {
  if (config.email.provider === 'brevo') {
    if (!config.email.brevoKey) throw new Error('BREVO_API_KEY missing');
    return { name: 'brevo', real: true, async send({ to, subject, text, replyTo }) {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': config.email.brevoKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email: config.email.from, name: config.email.fromName }, to: [{ email: to }], subject, textContent: text, ...(replyTo ? { replyTo: { email: replyTo } } : {}) }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`Brevo ${r.status}: ${j.message || 'send failed'}`); return { id: j.messageId || null };
    } };
  }
  return { name: 'log', real: false, async send() { return { id: null, simulated: true }; } };
}

import { randomUUID, createHash } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/validate.js';
import { sealOutboundLink } from '../lib/security.js';
const now = () => new Date().toISOString(); const day = () => now().slice(0, 10);
export const waUrl = (lead, c) => {
  const message = `Hello Emmanuel, this is ${c.name}. I just sent an inquiry on your website${lead.service ? ` about "${lead.service}"` : ''}.\n\n${String(lead.message).slice(0, 400)}${lead.budget ? `\n\nBudget: ${lead.budget}` : ''}`;
  return config.siteUrl + '/api/links/' + sealOutboundLink(`https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`);
};
const emailUrl = (lead, c) => {
  const subject = lead.service ? `Portfolio Enquiry — ${lead.service}` : 'Portfolio Enquiry';
  const body = [`Name: ${c.name}`, c.email && `Email: ${c.email}`, c.phone && `Phone: ${c.phone}`, lead.service && `Service: ${lead.service}`, lead.budget && `Budget: ${lead.budget}`, '', 'Message:', lead.message].filter(x => x !== false && x != null).join('\n');
  return config.siteUrl + '/api/links/' + sealOutboundLink(`mailto:${config.ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
};
const SPAM = /(backlinks?|seo (ranking|services)|crypto|casino|viagra|forex|loan offer|guest post|click here|whatsapp group|earn \$|telegram)/i;
const INTENT = /(website|web ?site|app|landing page|redesign|build|develop|e-?commerce|shop|portfolio|quote|hire|project|price|pricing|logo|seo|booking|restaurant|school|business)/i;
export function qualify({ name, email, phone, service, budget, message }) {
  let score = 0; const why = []; const links = (message.match(/https?:\/\//g) || []).length;
  if (SPAM.test(message) || links > 2 || (message.length > 30 && message === message.toUpperCase())) return { status: 'spam', score: 0, reason: 'Matched spam heuristics (spam keywords, many links or all-caps).' };
  if (service) { score += 20; why.push('service chosen'); } if (message.length >= 40) { score += 20; why.push('descriptive message'); } if (message.length >= 120) score += 10;
  if (phone) { score += 15; why.push('phone/WhatsApp provided'); } if (email) { score += 15; why.push('email provided'); } if (INTENT.test(message) || service) { score += 15; why.push('clear project intent'); }
  if (/(urgent|asap|this week|deadline|soon)/i.test(message)) { score += 5; why.push('urgency'); } if (budget) { score += 5; why.push('budget shared (optional)'); }
  const reachable = !!(phone || email); const status = score >= 55 && reachable ? 'qualified' : 'new';
  return { status, score, reason: status === 'qualified' ? 'Qualified: ' + why.join(', ') : 'Needs review: ' + (why.join(', ') || 'little detail') + '. Missing budget alone never disqualifies a lead.' };
}
export function leadService(db, { mailer }) {
  const svc = {
    async submit(input, { ipHash, source = 'website' }) {
      const hash = createHash('sha256').update([input.email || input.phone, input.message].join('|').toLowerCase()).digest('hex');
      const dup = (await db.query('SELECT id FROM contact_messages WHERE dedupe_hash = $1 AND created_at > $2', [hash, new Date(Date.now() - 24 * 3600e3).toISOString()])).rows[0];
      if (dup) throw new HttpError(409, 'This message was already received. Thank you — I will be in touch soon.');
      const q = qualify(input), t = now(); const cId = randomUUID(), lId = randomUUID(), convId = randomUUID();
      const existing = input.email ? (await db.query('SELECT id FROM contacts WHERE email = $1', [input.email])).rows[0] : null; const contactId = existing?.id || cId;
      let src = (await db.query('SELECT id FROM lead_sources WHERE name = $1', [source])).rows[0];
      const lead = { id: lId, service: input.service, message: input.message, budget: input.budget };
      const wa = waUrl(lead, input);
      const email = emailUrl(lead, input);
      await db.tx(async tx => {
        if (!existing) await tx.query('INSERT INTO contacts (id,name,email,phone,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [cId, input.name, input.email || null, input.phone || null, t]);
        await tx.query('INSERT INTO leads (id,contact_id,source_id,service,budget,message,status,score,qualification_reason,whatsapp_url,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)', [lId, contactId, src?.id || null, input.service || null, input.budget || null, input.message, q.status, q.score, q.reason, wa, t]);
        await tx.query("INSERT INTO conversations (id,contact_id,lead_id,channel,subject,created_at) VALUES ($1,$2,$3,'web',$4,$5)", [convId, contactId, lId, input.service || 'Website inquiry', t]);
        await tx.query("INSERT INTO contact_messages (id,contact_id,lead_id,conversation_id,direction,body,dedupe_hash,ip_hash,created_at) VALUES ($1,$2,$3,$4,'in',$5,$6,$7,$8)", [randomUUID(), contactId, lId, convId, input.message, hash, ipHash, t]);
        await tx.query("INSERT INTO lead_activities (id,lead_id,type,note,created_at) VALUES ($1,$2,'created',$3,$4)", [randomUUID(), lId, `Auto-classified as ${q.status} (score ${q.score})`, t]);
        await tx.query("INSERT INTO conversion_events (id,type,ref_id,day,created_at) VALUES ($1,'contact_submission',$2,$3,$4)", [randomUUID(), lId, day(), t]);
        if (q.status === 'qualified') await tx.query("INSERT INTO conversion_events (id,type,ref_id,day,created_at) VALUES ($1,'qualified_lead',$2,$3,$4)", [randomUUID(), lId, day(), t]);
      });
      let notified = false; // owner notification (only true if a real provider accepted it)
      if (q.status !== 'spam') { try { const r = await mailer.send({ to: config.ownerEmail, replyTo: input.email, subject: `New ${q.status} lead: ${input.name}`, text: `${input.message}\n\nName: ${input.name}\nEmail: ${input.email || '-'}\nPhone: ${input.phone || '-'}\nService: ${input.service || '-'}\nBudget: ${input.budget || '-'}\n\n${q.reason}` }); notified = !!mailer.real; await db.query('INSERT INTO email_delivery_logs (id,to_email,subject,provider,provider_message_id,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), config.ownerEmail, `New lead: ${input.name}`, mailer.name, r.id, mailer.real ? 'sent' : 'not_sent_log_provider', now()]); } catch (e) { await db.query('INSERT INTO email_delivery_logs (id,to_email,subject,provider,status,error,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), config.ownerEmail, `New lead: ${input.name}`, mailer.name, 'failed', e.message.slice(0, 300), now()]); } }
      return { id: lId, status: q.status === 'spam' ? 'new' : q.status, whatsapp_url: wa, email_url: email, owner_notified_by_email: notified, whatsapp_message_sent: false };
    },
  };
  return svc;
}

import { randomUUID } from 'node:crypto';
import { HttpError, isEmail } from '../lib/validate.js';
import { token } from '../lib/security.js';
import { aiAssist } from '../providers/ai.js';
import { config } from '../config.js';
const now = () => new Date().toISOString();
export function emailService(db, mailer) {
  const log = (to, subject, status, extra = {}) => db.query('INSERT INTO email_delivery_logs (id,to_email,subject,provider,provider_message_id,status,error,campaign_id,conversation_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [randomUUID(), to, subject, mailer.name, extra.id || null, status, extra.error || null, extra.campaignId || null, extra.conversationId || null, now()]);
  async function conversation(email, subject) { let c = (await db.query("SELECT id FROM email_conversations WHERE contact_email = $1 AND status = 'open' ORDER BY last_message_at DESC LIMIT 1", [email])).rows[0]; if (!c) { c = { id: randomUUID() }; await db.query('INSERT INTO email_conversations (id,contact_email,subject,last_message_at,created_at) VALUES ($1,$2,$3,$4,$4)', [c.id, email, subject || '(no subject)', now()]); } return c.id; }
  const svc = {
    async send({ to, subject, body, conversationId }, adminId) {
      if (!isEmail(to)) throw new HttpError(422, 'Invalid recipient'); const convId = conversationId || await conversation(to, subject);
      try { const r = await mailer.send({ to, subject, text: body }); await log(to, subject, mailer.real ? 'sent' : 'not_sent_log_provider', { id: r.id, conversationId: convId }); await db.query("INSERT INTO email_messages (id,conversation_id,direction,from_email,to_email,subject,body,created_at) VALUES ($1,$2,'out',$3,$4,$5,$6,$7)", [randomUUID(), convId, config.email.from, to, subject, body, now()]); await db.query('UPDATE email_conversations SET last_message_at = $1 WHERE id = $2', [now(), convId]);
        return { conversation_id: convId, delivered: mailer.real, note: mailer.real ? undefined : 'Email provider is "log": message recorded but NOT delivered. Configure EMAIL_PROVIDER=brevo.' }; }
      catch (e) { await log(to, subject, 'failed', { error: e.message.slice(0, 300), conversationId: convId }); throw new HttpError(502, 'Email provider error: ' + e.message); }
    },
    async receive({ from, subject, body, name }) { // inbound webhook / manual entry
      if (!isEmail(from)) throw new HttpError(422, 'Invalid sender'); const convId = await conversation(from, subject); const ai = await aiAssist({ subject, body, senderName: name });
      await db.query("INSERT INTO email_messages (id,conversation_id,direction,from_email,to_email,subject,body,ai_classification,ai_summary,created_at) VALUES ($1,$2,'in',$3,$4,$5,$6,$7,$8,$9)", [randomUUID(), convId, from, config.ownerEmail, subject, String(body).slice(0, 20000), ai.category, ai.summary, now()]); await db.query('UPDATE email_conversations SET last_message_at = $1 WHERE id = $2', [now(), convId]); return { conversation_id: convId, classification: ai.category };
    },
    async subscribe(email, name) { if (!isEmail(email)) throw new HttpError(422, 'Invalid email'); const ex = (await db.query('SELECT id FROM email_subscribers WHERE email = $1', [email])).rows[0]; if (ex) await db.query("UPDATE email_subscribers SET status = 'subscribed', unsubscribed_at = NULL WHERE id = $1", [ex.id]); else await db.query('INSERT INTO email_subscribers (id,email,name,unsubscribe_token,subscribed_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), email, name || null, token(24), now()]); },
    unsubscribe: async tk => (await db.query("UPDATE email_subscribers SET status = 'unsubscribed', unsubscribed_at = $1 WHERE unsubscribe_token = $2", [now(), tk])).rowCount > 0,
    async sendCampaign(id) {
      const c = (await db.query('SELECT * FROM email_campaigns WHERE id = $1', [id])).rows[0]; if (!c) throw new HttpError(404, 'Campaign not found'); if (c.status === 'sent') throw new HttpError(409, 'Campaign already sent');
      const subs = (await db.query("SELECT email, unsubscribe_token FROM email_subscribers WHERE status = 'subscribed'")).rows;
      let sent = 0, simulated = 0, failed = 0;
      for (const s of subs) {
        try {
          const body = String(c.body) + '\n\n—\nUnsubscribe: ' + config.siteUrl + '/api/email/unsubscribe/' + s.unsubscribe_token;
          await mailer.send({ to: s.email, subject: c.subject, text: body });
          if (mailer.real) {
            sent++;
            await log(s.email, c.subject, 'sent', { campaignId: id });
          } else {
            simulated++;
            await log(s.email, c.subject, 'not_sent_log_provider', { campaignId: id });
          }
        } catch (e) {
          failed++;
          await log(s.email, c.subject, 'failed', { error: e.message.slice(0, 300), campaignId: id });
        }
      }
      // Keep simulated sends retryable after a real provider is configured.
      const status = !mailer.real ? 'draft' : failed ? (sent ? 'partial' : 'failed') : 'sent';
      await db.query('UPDATE email_campaigns SET status = $1, sent_count = $2, failed_count = $3, sent_at = $4 WHERE id = $5', [status, sent, failed, mailer.real && status === 'sent' ? now() : null, id]);
      return { recipients: subs.length, sent, simulated, failed, delivered: mailer.real };
    },
    async searchMessages(q) { return (await db.query('SELECT m.id, m.conversation_id, m.direction, m.from_email, m.to_email, m.subject, m.ai_classification, m.created_at, SUBSTR(m.body,1,200) AS preview FROM email_messages m WHERE m.subject ILIKE $1 OR m.body ILIKE $1 OR m.from_email ILIKE $1 OR m.to_email ILIKE $1 ORDER BY m.created_at DESC LIMIT 50', ['%' + q + '%'])).rows; },
  };
  return svc;
}

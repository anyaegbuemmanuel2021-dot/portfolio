// Optional AI assistant. Default "rules" needs no paid API. "openai" = any OpenAI-compatible /chat/completions endpoint (AI_BASE_URL, AI_API_KEY, AI_MODEL). "none" disables.
import { config } from '../config.js';
const CATS = [['quote', /(quote|price|pricing|cost|how much|budget|estimate)/i], ['project', /(website|web ?site|app|landing page|redesign|build|develop|e-?commerce|shop|portfolio)/i], ['job', /(job|hire|hiring|vacancy|position|intern|role)/i], ['support', /(bug|issue|broken|not working|error|fix)/i], ['spam', /(backlinks?|seo ranking|crypto|casino|viagra|loan offer|guest post|click here)/i]];
export function ruleClassify(text) {
  const category = (CATS.find(([, re]) => re.test(text)) || ['general'])[0]; const urgent = /(urgent|asap|today|deadline|immediately)/i.test(text);
  const first = text.replace(/\s+/g, ' ').trim(); return { category, urgency: urgent ? 'high' : 'normal', isLead: ['quote', 'project', 'job'].includes(category), summary: first.length > 160 ? first.slice(0, 157) + '…' : first };
}
const REPLY = { quote: 'Thank you for your interest. To give you an accurate quote, could you share the main features you need, any reference sites, and your preferred timeline? Once I have that I will send a clear estimate.', project: 'Thank you for reaching out about your project. I would be glad to help. Could we schedule a short call or chat to go through your goals, timeline and budget range?', job: 'Thank you for the opportunity. Please send the role description and any application steps, and I will respond shortly.', support: 'Thanks for flagging this. Could you send the page link, what you expected to happen, and a screenshot if possible? I will look into it right away.', general: 'Thank you for your message. I have received it and will respond with the details shortly.', spam: '' };
export async function aiAssist({ subject = '', body = '', senderName = '' }) {
  const text = `${subject}\n${body}`; const base = ruleClassify(text);
  const draft = (REPLY[base.category] || REPLY.general); const greeting = senderName ? `Hello ${senderName.split(' ')[0]},\n\n` : 'Hello,\n\n';
  const out = { ...base, suggestedReply: draft ? `${greeting}${draft}\n\nBest regards,\nEmmanuel` : '', engine: 'rules', requiresApproval: true };
  if (config.ai.provider === 'none') return { ...out, engine: 'disabled', suggestedReply: '' };
  if (config.ai.provider === 'openai' && config.ai.baseUrl && config.ai.apiKey) {
    try {
      const r = await fetch(config.ai.baseUrl.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.ai.apiKey }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ model: config.ai.model, messages: [{ role: 'system', content: 'You help a freelance web developer triage inbound email. Reply with JSON only: {"category":"quote|project|job|support|spam|general","urgency":"high|normal","isLead":boolean,"summary":"<=160 chars","suggestedReply":"short professional reply"}' }, { role: 'user', content: text.slice(0, 6000) }] }) });
      const j = await r.json(); const parsed = JSON.parse(String(j.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim());
      return { ...out, ...parsed, engine: 'llm', requiresApproval: true };
    } catch { return { ...out, engine: 'rules-fallback' }; }
  }
  return out;
}

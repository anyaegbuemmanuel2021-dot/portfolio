// Minimal safe Markdown -> HTML. All input is HTML-escaped first, so output can never contain raw HTML/script.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const okUrl = u => /^(https?:\/\/|\/|#|mailto:)/i.test(u) && !/^\s*javascript:/i.test(u);
function inline(t) {
  t = esc(t);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => okUrl(u.replace(/&amp;/g, '&')) ? `<img src="${u}" alt="${a}" loading="lazy">` : m);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, u) => okUrl(u.replace(/&amp;/g, '&')) ? `<a href="${u}" rel="noopener noreferrer"${/^https?:/i.test(u) ? ' target="_blank"' : ''}>${a}</a>` : m);
  return t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}
export function renderMarkdown(src = '') {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`); i++; continue; }
    if (/^>\s?/.test(l)) { const b = []; while (i < lines.length && /^>\s?/.test(lines[i])) b.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${inline(b.join(' '))}</blockquote>`); continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) { const ord = /^\s*\d+\./.test(l), b = []; while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) b.push(`<li>${inline(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`); out.push(`<${ord ? 'ol' : 'ul'}>${b.join('')}</${ord ? 'ol' : 'ul'}>`); continue; }
    if (/^---+$/.test(l.trim())) { out.push('<hr>'); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s)/.test(lines[i])) p.push(lines[i++]); out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

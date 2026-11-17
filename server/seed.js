// Idempotent seed: roles/permissions/placements always ensured; starter content only into EMPTY tables (never overwrites admin edits).
import { randomUUID } from 'node:crypto';
import { PERMISSIONS } from './services/auth.js';
import { renderMarkdown } from './lib/markdown.js';
const now = () => new Date().toISOString();
export async function seed(db) {
  const t = now(); const count = async tb => Number((await db.query(`SELECT COUNT(*) AS c FROM ${tb}`)).rows[0].c);
  let owner = (await db.query("SELECT id FROM roles WHERE name = 'owner'")).rows[0];
  if (!owner) { owner = { id: randomUUID() }; await db.query("INSERT INTO roles (id,name,description) VALUES ($1,'owner','Full access')", [owner.id]); }
  const missing = async (table, col, val) => !(await db.query(`SELECT 1 AS x FROM ${table} WHERE ${col} = $1`, [val])).rows.length;
  for (const k of PERMISSIONS) { let p = (await db.query('SELECT id FROM permissions WHERE key = $1', [k])).rows[0]; if (!p) { p = { id: randomUUID() }; await db.query('INSERT INTO permissions (id,key,description) VALUES ($1,$2,$3)', [p.id, k, 'Manage ' + k]); } if (!(await db.query('SELECT 1 AS x FROM role_permissions WHERE role_id = $1 AND permission_id = $2', [owner.id, p.id])).rows.length) await db.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)', [owner.id, p.id]); }
  for (const [key, label, d] of [['home', 'Homepage', 'Below the hero'], ['article', 'Article pages', 'Inside / after article body'], ['sidebar', 'Sidebar', 'Article list sidebar'], ['footer', 'Footer', 'Above the footer'], ['project', 'Project pages', 'Selected project pages']]) if (await missing('ad_placements', 'key', key)) await db.query('INSERT INTO ad_placements (id,key,label,description,is_active) VALUES ($1,$2,$3,$4,TRUE)', [randomUUID(), key, label, d]);
  for (const s of ['website', 'email', 'whatsapp', 'referral', 'manual']) if (await missing('lead_sources', 'name', s)) await db.query('INSERT INTO lead_sources (id,name) VALUES ($1,$2)', [randomUUID(), s]);
  for (const k of ['adsense', 'adsense_ads_txt', 'self_managed']) if (await missing('ad_network_settings', 'key', k)) await db.query('INSERT INTO ad_network_settings (key,value,enabled,updated_at) VALUES ($1,$2,$3,$4)', [k, '', k === 'self_managed', t]);
  const defaults = { site_title: 'Anyaegbu Emmanuel Ikenna — Frontend Developer & AI Creative Technologist', site_tagline: 'Frontend development, responsive web design and AI-assisted creative content', footer_tagline: 'Frontend Development · Responsive Design · AI Creative Content', contact_email: 'anyaegbuemmanuel2021@gmail.com', whatsapp_number: '2347046947391', footer_text: '© Anyaegbu Emmanuel Ikenna. All rights reserved.' };
  for (const [k, v] of Object.entries(defaults)) if (await missing('site_settings', 'key', k)) await db.query('INSERT INTO site_settings (key,value,updated_at) VALUES ($1,$2,$3)', [k, v, t]);
  const ins = async (table, rows) => { for (const [i, r] of rows.entries()) { const row = { id: randomUUID(), ...r, sort_order: i, is_published: true, created_at: t, updated_at: t }; const k = Object.keys(row); await db.query(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, j) => '$' + (j + 1)).join(',')})`, k.map(c => row[c])); } };
  if (!(await count('services'))) await ins('services', [['Website Development', 'website-development', 'Responsive, fast, accessible websites', 'fa-solid fa-laptop-code'], ['Responsive Web Design', 'responsive-web-design', 'Layouts that fit every screen', 'fa-solid fa-mobile-screen'], ['CSS Animations & Interactive UI', 'css-animations-interactive-ui', 'Smooth, purposeful motion', 'fa-solid fa-wand-magic-sparkles'], ['Digital Content Production', 'digital-content-production', 'Promotional videos and branded digital content', 'fa-solid fa-video'], ['Website Deployment', 'website-deployment', 'Hosting, domains and go-live', 'fa-solid fa-rocket'], ['Basic SEO & Performance', 'basic-seo-performance', 'Speed and search basics', 'fa-solid fa-magnifying-glass-chart']].map(([title, slug, summary, icon]) => ({ title, slug, summary, icon })));
  if (!(await count('projects'))) await ins('projects', [["Nneka's Kitchen — Restaurant Site", 'restaurant', 'projects/restaurant/index.html', 'Restaurant'], ['PixelForge — Digital Agency Landing Page', 'agency', 'projects/agency/index.html', 'Agency'], ['TechNaija — Tech Blog Homepage', 'blog', 'projects/blog/index.html', 'Blog'], ['StyleBox NG — Fashion E-Commerce Store', 'shop', 'projects/shop/index.html', 'E-commerce'], ['Wedding Invitation — Chidi & Amaka', 'event', 'projects/event/index.html', 'Event'], ['CalcKit — Multi-Tool Calculator App', 'calculator', 'projects/calculator/index.html', 'App']].map(([title, slug, url, category]) => ({ title, slug, url, category, is_featured: false })));

  // Add the five independently developed GitHub projects without overwriting admin edits.
  const additionalProjects = [
    { title: 'MedPulse — Medical Learning Platform', slug: 'medpulse', summary: 'A medical learning and community platform with learning resources, user profiles, posts, discussions, messaging, verification and moderation workflows.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/med', category: 'Business', tags: 'Next.js, TypeScript, Firebase, Cloudinary', is_featured: true },
    { title: 'CMBS — Church Media Broadcast System', slug: 'church-media-broadcast-system', summary: 'A church media and broadcasting system repository covering live media workflows, streaming infrastructure, administration and service operations.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/cbms', category: 'Business', tags: 'Node.js, Express, Appwrite, PostgreSQL, Redis', is_featured: false },
    { title: 'Softly Digital CBT — Computer-Based Testing', slug: 'softly-digital-cbt', summary: 'A computer-based testing application with candidate and centre workflows, examination management and an Appwrite-backed application structure.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/cbt-appwrite', category: 'App', tags: 'JavaScript, Appwrite, Cloudinary', is_featured: false },
    { title: 'SocialPulse V10 — Social Video Platform', slug: 'socialpulse-v10', summary: 'A social video application repository with user accounts, video uploads, feeds, likes, comments, follows, messaging, notifications and moderation tools.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/SocialPulse-V10', category: 'App', tags: 'Vue 3, Appwrite, JavaScript', is_featured: true },
    { title: 'XOFT — Personal AI Assistant', slug: 'xoft-ai-assistant', summary: 'A provider-agnostic AI assistant project with conversation, memory, tool orchestration, voice workflows, integrations and a command-centre interface. Some integrations require external credentials and setup.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/xoft-j', category: 'App', tags: 'Node.js, JavaScript, AI APIs, WebSocket', is_featured: true }
  ];
  for (const p of additionalProjects) {
    if (await missing('projects', 'slug', p.slug)) {
      const row = { id: randomUUID(), ...p, sort_order: await count('projects'), is_published: true, created_at: t, updated_at: t };
      const cols = Object.keys(row);
      const sql = 'INSERT INTO projects (' + cols.join(',') + ') VALUES (' + cols.map((_, i) => '$' + (i + 1)).join(',') + ')';
      await db.query(sql, cols.map(k => row[k]));
    }
  }
  if (!(await count('navigation_items'))) await ins('navigation_items', [['Home', 'index.html'], ['About', 'about.html'], ['Projects', 'projects.html'], ['Services', 'services.html'], ['Contact', 'contact.html'], ['Articles', 'articles.html']].map(([label, url]) => ({ label, url, location: 'header' })));
  if (!(await count('social_links'))) await ins('social_links', [['LinkedIn', 'https://linkedin.com/in/anyaegbu-emmanuel', 'fab fa-linkedin-in'], ['Instagram', 'https://instagram.com/anyaegbu_emmanuel', 'fab fa-instagram'], ['TikTok', 'https://tiktok.com/@anyaegbu_emmanuel', 'fab fa-tiktok']].map(([platform, url, icon]) => ({ platform, url, icon })));
  if (!(await count('biography'))) await db.query('INSERT INTO biography (id,headline,body,photo_url,cv_url,updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), 'Frontend Developer & AI Creative Technologist', 'Computer Science student at Nnamdi Azikiwe University (UNIZIK), Nigeria, focused on responsive website development and AI-assisted digital content production.', 'assets/images/profile.jpg', 'assets/files/Emmanuel_Anyaegbu_CV.pdf', t]);
  // Ensure article categories exist for the admin editor and public category filter.
  const articleCategories = [
    ['Technology', 'technology', 'Technology, software and digital innovation'],
    ['Artificial Intelligence', 'artificial-intelligence', 'AI tools, applications and responsible use'],
    ['Web Development', 'web-development', 'Frontend development, web design and the modern web'],
    ['Business', 'business', 'Business operations, strategy and digital transformation'],
    ['Productivity', 'productivity', 'Work, productivity and practical professional skills']
  ];
  for (const [name, slug, description] of articleCategories) {
    if (await missing('article_categories', 'slug', slug)) {
      await db.query('INSERT INTO article_categories (id,name,slug,description,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [randomUUID(), name, slug, description, t]);
    }
  }

  // Publish the requested article if it already exists; create it if the saved record is missing.
  const articleTitle = 'The Future of Technology: How Artificial Intelligence Is Changing the Way We Work';
  const articleSlug = 'future-of-technology-artificial-intelligence-changing-work';
  const articleExcerpt = 'Artificial intelligence is transforming how businesses operate, how professionals work, and how people solve everyday problems. Discover the opportunities, challenges, and possibilities of an AI-powered world.';
  const articleMarkdown = [
    '## Artificial intelligence is changing the workplace',
    'Artificial intelligence (AI) is becoming part of everyday work. From writing and research tools to customer support systems and data analysis, AI is changing how people complete tasks and how organisations deliver services. What once required hours of manual effort can increasingly be supported by software that helps people organise information, identify patterns and produce a useful first draft.',
    'AI is not simply a trend for technology companies. Businesses of different sizes are exploring practical ways to use it in administration, communication, marketing, education, design and operations.',
    '## Working more efficiently',
    'One of the clearest benefits of AI is its ability to assist with repetitive or time-consuming work. It can help summarise long documents, organise notes, draft routine messages, generate ideas and support basic data analysis. These uses can give professionals more time to focus on decisions, relationships and tasks that require human judgement.',
    'The best results come when people review AI output rather than accepting it without checking. AI can make mistakes, misunderstand context or present inaccurate information confidently.',
    '## New possibilities for businesses',
    'For businesses, AI can support customer enquiries, improve access to information, assist with content production and help teams understand operational data. Smaller organisations may use accessible AI tools to perform tasks that previously required larger teams or specialist resources.',
    'However, adopting AI should begin with a real business need. Organisations should consider the quality of the tool, the information it can access, the cost of using it and the impact on customers and employees.',
    '## How careers and skills are changing',
    'AI is changing some job tasks, but it is also increasing the importance of skills such as critical thinking, communication, problem-solving, creativity and digital literacy. Professionals who learn how to use relevant tools responsibly can improve their work and adapt as roles evolve.',
    'This does not mean every worker must become an AI engineer. It means understanding where AI is useful, how to check its output and when a task needs human expertise.',
    '## Challenges that should not be ignored',
    'AI systems can produce inaccurate results, reflect bias in their training data and create privacy or security risks when sensitive information is entered into unsuitable tools. Organisations should establish clear guidelines, protect confidential data and keep people accountable for important decisions.',
    'There are also concerns about job disruption and unequal access to new technology. Training and thoughtful planning are important so that the benefits of AI are not limited to a small group.',
    '## Preparing for an AI-supported future',
    'A practical approach is to start with small, low-risk tasks. Learn one tool, test it against a clear objective, verify the results and decide whether it genuinely improves the process. Continue developing the human skills that technology cannot replace: empathy, sound judgement, leadership and the ability to understand people.',
    '## Conclusion',
    'Artificial intelligence is reshaping the way people work, but its value depends on how it is applied. Used thoughtfully, it can support productivity, help businesses make better use of information and create new opportunities. The future of work is not only about smarter tools; it is about people learning to work effectively alongside them.'
  ].join('\n\n');
  const articleHtml = renderMarkdown(articleMarkdown);
  const technologyCategory = (await db.query("SELECT id FROM article_categories WHERE slug = 'technology' LIMIT 1")).rows[0];
  const existingArticle = (await db.query(
    "SELECT id FROM articles WHERE lower(title) = lower($1) OR lower(slug) = $2 OR lower(slug) LIKE $2 || '-%' ORDER BY CASE WHEN lower(slug) = $2 THEN 0 ELSE 1 END LIMIT 1",
    [articleTitle, articleSlug]
  )).rows[0];
  if (existingArticle) {
    await db.query(
      "UPDATE articles SET status = 'published', published_at = COALESCE(published_at, $1), publish_at = NULL, category_id = COALESCE(category_id, $2), excerpt = COALESCE(excerpt, $3), content_md = CASE WHEN content_md IS NULL OR content_md = '' THEN $4 ELSE content_md END, content_html = CASE WHEN content_html IS NULL OR content_html = '' THEN $5 ELSE content_html END, updated_at = $1 WHERE id = $6",
      [t, technologyCategory?.id || null, articleExcerpt, articleMarkdown, articleHtml, existingArticle.id]
    );
  } else {
    let slug = articleSlug, suffix = 2;
    while (!(await missing('articles', 'slug', slug))) slug = articleSlug + '-' + suffix++;
    await db.query(
      "INSERT INTO articles (id,title,slug,excerpt,content_md,content_html,category_id,status,published_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'published',$8,$8,$8)",
      [randomUUID(), articleTitle, slug, articleExcerpt, articleMarkdown, articleHtml, technologyCategory?.id || null, t]
    );
  }

  if (!(await count('email_templates'))) for (const [n, s, b] of [['Inquiry received', 'Thanks for your inquiry', 'Hello,\n\nThank you for contacting me. I have received your message and will reply within 24 hours.\n\nBest regards,\nEmmanuel']]) await db.query('INSERT INTO email_templates (id,name,subject,body,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [randomUUID(), n, s, b, t]);
  if (!(await count('email_saved_replies'))) await db.query('INSERT INTO email_saved_replies (id,title,body,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)', [randomUUID(), 'Ask for project details', 'Thanks for reaching out! Could you share your goals, preferred timeline and any reference websites you like?', t]);
}

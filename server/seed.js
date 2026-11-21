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
  const defaults = { site_title: 'Anyaegbu Emmanuel Ikenna — Full-Stack Developer & AI Creative Technologist', site_tagline: 'Full-stack development across frontend and backend, responsive web design and digital content', footer_tagline: 'Full-Stack Development · Responsive Design · Digital Content', contact_email: 'anyaegbuemmanuel2021@gmail.com', whatsapp_number: '2347046947391', footer_text: '© Anyaegbu Emmanuel Ikenna. All rights reserved.' };
  for (const [k, v] of Object.entries(defaults)) if (await missing('site_settings', 'key', k)) await db.query('INSERT INTO site_settings (key,value,updated_at) VALUES ($1,$2,$3)', [k, v, t]);
  const ins = async (table, rows) => { for (const [i, r] of rows.entries()) { const row = { id: randomUUID(), ...r, sort_order: i, is_published: true, created_at: t, updated_at: t }; const k = Object.keys(row); await db.query(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, j) => '$' + (j + 1)).join(',')})`, k.map(c => row[c])); } };
  if (!(await count('services'))) await ins('services', [['Website Development', 'website-development', 'Responsive, fast, accessible websites', 'fa-solid fa-laptop-code'], ['Responsive Web Design', 'responsive-web-design', 'Layouts that fit every screen', 'fa-solid fa-mobile-screen'], ['CSS Animations & Interactive UI', 'css-animations-interactive-ui', 'Smooth, purposeful motion', 'fa-solid fa-wand-magic-sparkles'], ['Digital Content Production', 'digital-content-production', 'Promotional videos and branded digital content', 'fa-solid fa-video'], ['Website Deployment', 'website-deployment', 'Hosting, domains and go-live', 'fa-solid fa-rocket'], ['Basic SEO & Performance', 'basic-seo-performance', 'Speed and search basics', 'fa-solid fa-magnifying-glass-chart']].map(([title, slug, summary, icon]) => ({ title, slug, summary, icon })));
  if (!(await count('projects'))) await ins('projects', [["Nneka's Kitchen — Restaurant Site", 'restaurant', 'projects/restaurant/index.html', 'Restaurant'], ['PixelForge — Digital Agency Landing Page', 'agency', 'projects/agency/index.html', 'Agency'], ['TechNaija — Tech Blog Homepage', 'blog', 'projects/blog/index.html', 'Blog'], ['StyleBox NG — Fashion E-Commerce Store', 'shop', 'projects/shop/index.html', 'E-commerce'], ['Wedding Invitation — Chidi & Amaka', 'event', 'projects/event/index.html', 'Event'], ['CalcKit — Multi-Tool Calculator App', 'calculator', 'projects/calculator/index.html', 'App']].map(([title, slug, url, category]) => ({ title, slug, url, category, is_featured: false })));

  // Add the five independently developed GitHub projects without overwriting admin edits.
  const additionalProjects = [
    { title: 'RetailOS — Multi-Business Retail Management Platform', slug: 'retailos', summary: 'A full-stack retail operations platform in active development, bringing together product catalogues, inventory, point-of-sale sales, customers, staff permissions, purchasing, transfers, returns and multi-branch operations with business-level tenant isolation.', description: 'RetailOS is a multi-business retail management platform built around business-level tenant boundaries and explicit branch access. Its modules cover business onboarding, products, inventory, point-of-sale sales, customer records, staff and role permissions, purchasing, stock transfers, returns, expenses and platform administration.\n\nThe project uses a React and TypeScript web application, a Fastify and TypeScript API, Prisma and PostgreSQL, with shared types across the application. It is currently in active development; payment and subscription workflows, database migration history and production operations are still being completed and verified before a full public launch.', url: null, repo_url: null, category: 'App', tags: 'React, TypeScript, Fastify, Prisma, PostgreSQL, Multi-Tenant SaaS', is_featured: true, sort_order: 0 },
    { title: 'MedPulse — Medical Learning Platform', slug: 'medpulse', summary: 'A medical learning and community platform with learning resources, user profiles, posts, discussions, messaging, verification and moderation workflows.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/med', category: 'Business', tags: 'Next.js, TypeScript, Firebase, Cloudinary', is_featured: true },
    { title: 'CMBS — Church Media Broadcast System', slug: 'church-media-broadcast-system', summary: 'A church media and broadcasting system repository covering live media workflows, streaming infrastructure, administration and service operations.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/cbms', category: 'Business', tags: 'Node.js, Express, Appwrite, PostgreSQL, Redis', is_featured: false },
    { title: 'Softly Digital CBT — Computer-Based Testing', slug: 'softly-digital-cbt', summary: 'A computer-based testing application with candidate and centre workflows, examination management and an Appwrite-backed application structure.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/cbt-appwrite', category: 'App', tags: 'JavaScript, Appwrite, Cloudinary', is_featured: false },
    { title: 'SocialPulse V10 — Social Video Platform', slug: 'socialpulse-v10', summary: 'A social video application repository with user accounts, video uploads, feeds, likes, comments, follows, messaging, notifications and moderation tools.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/SocialPulse-V10', category: 'App', tags: 'Vue 3, Appwrite, JavaScript', is_featured: true },
    { title: 'XOFT — Personal AI Assistant', slug: 'xoft-ai-assistant', summary: 'A provider-agnostic AI assistant project with conversation, memory, tool orchestration, voice workflows, integrations and a command-centre interface. Some integrations require external credentials and setup.', url: null, repo_url: 'https://github.com/anyaegbuemmanuel2021-dot/xoft-j', category: 'App', tags: 'Node.js, JavaScript, AI APIs, WebSocket', is_featured: true }
  ];
  for (const p of additionalProjects) {
    if (await missing('projects', 'slug', p.slug)) {
      const row = { id: randomUUID(), ...p, sort_order: p.sort_order ?? await count('projects'), is_published: true, created_at: t, updated_at: t };
      const cols = Object.keys(row);
      const sql = 'INSERT INTO projects (' + cols.join(',') + ') VALUES (' + cols.map((_, i) => '$' + (i + 1)).join(',') + ')';
      await db.query(sql, cols.map(k => row[k]));
    }
  }
  if (!(await count('navigation_items'))) await ins('navigation_items', [['Home', 'index.html'], ['About', 'about.html'], ['Projects', 'projects.html'], ['Services', 'services.html'], ['Contact', 'contact.html'], ['Articles', 'articles.html']].map(([label, url]) => ({ label, url, location: 'header' })));
  if (!(await count('social_links'))) await ins('social_links', [['LinkedIn', 'https://linkedin.com/in/anyaegbu-emmanuel', 'fab fa-linkedin-in'], ['Instagram', 'https://instagram.com/anyaegbu_emmanuel', 'fab fa-instagram'], ['TikTok', 'https://tiktok.com/@anyaegbu_emmanuel', 'fab fa-tiktok']].map(([platform, url, icon]) => ({ platform, url, icon })));
  if (!(await count('biography'))) await db.query('INSERT INTO biography (id,headline,body,photo_url,cv_url,updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), 'Full-Stack Developer & AI Creative Technologist', 'Computer Science student at Nnamdi Azikiwe University (UNIZIK), Nigeria, focused on frontend and backend web development and AI-assisted digital content production.', 'assets/images/profile.jpg', 'assets/files/Emmanuel_Anyaegbu_CV.pdf', t]);
  // Ensure article categories exist for the admin editor and public category filter.
  const articleCategories = [
    ['Technology', 'technology', 'Technology, software and digital innovation'],
    ['Artificial Intelligence', 'artificial-intelligence', 'AI tools, applications and responsible use'],
    ['Web Development', 'web-development', 'Frontend interfaces, backend functionality and modern full-stack web development'],
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
  const articleImage = 'https://images.stockcake.com/public/a/1/f/a1f507a9-d94d-4f8f-97f0-1980a77d0d1d_medium/future-office-technology-stockcake.jpg';
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
      "UPDATE articles SET status = 'published', published_at = COALESCE(published_at, $1), publish_at = NULL, category_id = COALESCE(category_id, $2), excerpt = COALESCE(excerpt, $3), content_md = CASE WHEN content_md IS NULL OR content_md = '' THEN $4 ELSE content_md END, content_html = CASE WHEN content_html IS NULL OR content_html = '' THEN $5 ELSE content_html END, featured_image_url = $6, updated_at = $1 WHERE id = $7",
      [t, technologyCategory?.id || null, articleExcerpt, articleMarkdown, articleHtml, articleImage, existingArticle.id]
    );
  } else {
    let slug = articleSlug, suffix = 2;
    while (!(await missing('articles', 'slug', slug))) slug = articleSlug + '-' + suffix++;
    await db.query(
      "INSERT INTO articles (id,title,slug,excerpt,content_md,content_html,featured_image_url,category_id,status,published_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,$9,$9)",
      [randomUUID(), articleTitle, slug, articleExcerpt, articleMarkdown, articleHtml, articleImage, technologyCategory?.id || null, t]
    );
  }
  const futureArticle = (await db.query("SELECT id, featured_image_url FROM articles WHERE lower(title) = lower($1) OR lower(slug) = $2 OR lower(slug) LIKE $2 || '-%' ORDER BY CASE WHEN lower(slug) = $2 THEN 0 ELSE 1 END LIMIT 1", [articleTitle, articleSlug])).rows[0];
  if (futureArticle) {
    await db.query("UPDATE articles SET featured_image_url = $1, updated_at = $2 WHERE id = $3", [articleImage, t, futureArticle.id]);
    await db.query("INSERT INTO article_images (id,article_id,url,alt,sort_order) SELECT $1,$2,$3,$4,0 WHERE NOT EXISTS (SELECT 1 FROM article_images WHERE article_id = $2 AND url = $3)", [randomUUID(), futureArticle.id, articleImage, articleTitle]);
  }


  // Publish the five portfolio articles once. Existing editor-managed articles are never overwritten.
  const webCategory = (await db.query("SELECT id FROM article_categories WHERE slug = 'web-development' LIMIT 1")).rows[0];
  const portfolioArticles = [
    {
      title: 'What Really Happens After You Submit a Website Form',
      slug: 'what-happens-after-you-submit-a-website-form',
      excerpt: 'A form is only the visible beginning. Follow the journey from a browser interaction through validation, an API request, server-side processing, database storage and a reliable response.',
      seo: 'A practical explanation of website form handling, frontend validation, APIs, server-side processing, databases and secure user feedback.',
      image: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1600&q=85',
      content: [
        '## The moment a form becomes an application',
        'A contact form looks simple. Someone enters a name, an email address and a message, then presses Submit. A moment later, a confirmation appears. Behind that small interaction, however, a sequence of carefully coordinated steps has taken place. The browser has collected information, checked what it can, sent a request to a server, and waited for the application to decide what should happen next.',
        'Understanding this journey is one of the clearest ways to understand full-stack development. The interface is important, but the experience is only complete when the information reaches the right place and the user receives a trustworthy response.',
        '## The browser prepares the information',
        'The process begins with the frontend. HTML gives each field meaning, labels help people understand what is expected, and JavaScript can provide immediate feedback. A browser can check whether a required field is empty or whether an email address has a recognisable format. These checks make the form easier to use because a person can correct simple mistakes before sending anything.',
        'Frontend validation is not a security boundary. A visitor can disable JavaScript, change a request or send information without using the page at all. The server must repeat important validation independently. Good applications treat browser checks as helpful guidance and server checks as the authority.',
        '## The request travels to an API',
        'When the visitor submits the form, the frontend usually sends an HTTP request to an API endpoint. The request contains structured data, often encoded as JSON. The endpoint is the agreed entry point through which the browser asks the application to perform an action.',
        'The method communicates intent. A POST request is commonly used when submitting a new enquiry. The request may also contain headers that describe its content and, where necessary, credentials or a security token. The browser should prevent accidental repeated submissions while it waits, but the server must still be designed to handle retries safely.',
        '## The server checks what it has received',
        'The backend receives the request and validates it again. It checks required fields, length limits, accepted formats and business rules. It should reject unexpected input with a clear client error rather than trusting data simply because it came from the website.',
        'A production form also needs protection against spam and abuse. Rate limits can reduce repeated automated requests. A honeypot field or a challenge service can provide another layer of protection. Sensitive values should not be written into application logs, and error messages should not expose database details or internal configuration.',
        '## Saving the enquiry is a separate responsibility',
        'If the information passes validation, the application can store it in a database. A relational database might keep the enquiry in a table with fields for the sender, contact details, message, status and creation time. The backend uses a parameterised query or a well-designed data access layer so that user input is treated as data rather than executable SQL.',
        'The application should decide what a successful save means. If the database write fails, the server must not tell the visitor that the enquiry was received. If the write succeeds but an email notification is temporarily unavailable, the enquiry should still remain safely stored. This distinction prevents a secondary service from making the main operation unreliable.',
        '## A response closes the loop',
        'After processing the request, the server returns an HTTP status and a response body. A successful creation commonly returns a status in the 200 range, while invalid input receives a client error and an unexpected failure receives a server error. The frontend reads that response and shows an appropriate message.',
        'A useful confirmation tells the visitor what happened and what to expect next. An error should explain how to recover without blaming the person or exposing technical internals. The form should preserve entered information when it is safe to do so, especially when a temporary network problem occurs.',
        '## Reliability is part of the design',
        'Real networks are unpredictable. A request can time out even when the server eventually completes the work. Retrying without a plan can create duplicate enquiries. For important operations, applications can use idempotency keys or unique request identifiers so that repeating the same request does not create the same record twice.',
        'Developers should also monitor failures, protect personal information, use HTTPS and test the complete journey rather than testing the form only in a browser. Useful tests cover valid submissions, missing fields, malformed data, rate limits, database errors and slow responses.',
        '## The bigger lesson',
        'A form is not just a collection of input fields. It is a conversation between a person, a browser, an API, a server and a data store. The frontend makes the interaction understandable. The backend makes the operation dependable. The database preserves the information, while careful error handling keeps the experience honest.',
        'When these parts are designed together, a small form becomes a dependable feature rather than a decorative element on a page.'
      ].join('\n\n')
    },
    {
      title: 'Why a Beautiful Desktop Website Can Still Fail on Mobile',
      slug: 'why-beautiful-desktop-websites-fail-on-mobile',
      excerpt: 'Responsive design is not about shrinking a desktop layout. It is about preserving clarity, access and usability when space, input methods and user context change.',
      seo: 'Learn why desktop-first websites fail on phones and how responsive layouts, touch targets, navigation, performance and real-device testing improve mobile usability.',
      image: 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?auto=format&fit=crop&w=1600&q=85',
      content: [
        '## A smaller screen changes the whole experience',
        'A website can look polished on a large monitor and still become frustrating on a phone. Text may become difficult to read, navigation may overflow, buttons may sit too close together and important content may disappear below an oversized hero section. These problems are not cosmetic. They make it harder for people to complete the task they came to do.',
        'Responsive design is often described as making a layout fit different screen sizes. That is only part of the work. A phone changes the available space, the way people interact, the conditions in which they browse and the amount of attention they can give a page. A responsive website must respond to all of those realities.',
        '## Design for content before designing for devices',
        'The strongest layouts begin with the content and its purpose. A heading should remain understandable when it wraps. A form should keep labels close to their fields. A product card should preserve the information needed to make a decision. Once those relationships are clear, CSS can adapt their arrangement as the available width changes.',
        'A fluid layout uses flexible units, percentage widths, grid and flexbox rather than relying on fixed pixel dimensions everywhere. Images should scale within their containers without becoming distorted. Text should have a comfortable line length and a size that remains readable without forcing users to zoom.',
        '## Breakpoints should follow the layout',
        'A breakpoint is not a badge for a particular phone model. It is a point where the current composition stops working well. A three-column layout may become two columns and later one. A horizontal navigation bar may turn into a compact menu when the links no longer have enough room.',
        'This approach produces more resilient interfaces because it responds to the content rather than a list of device names. CSS media queries are useful, but they should support a flexible foundation rather than repair a rigid desktop design after the fact.',
        '## Touch is not the same as a mouse',
        'On a desktop, a pointer can select a small link precisely. On a phone, a finger covers more area and the user may be walking, holding the device with one hand or dealing with bright sunlight. Interactive controls need enough space around them to reduce accidental taps.',
        'Hover effects should never be the only way to reveal important information. Menus, tooltips and expandable sections need a touch-friendly alternative. Keyboard access still matters too, because accessibility is not limited to one type of device or one way of interacting.',
        '## Navigation should make the next step obvious',
        'Mobile navigation often becomes a compact menu, but hiding links is not enough. The menu should open predictably, expose its state to assistive technology and close when a visitor has completed a selection. The most important actions should remain easy to find.',
        'A page should also avoid making people scroll through decorative content before reaching its purpose. A clear heading, concise introduction and useful primary action help visitors understand where they are and what they can do next.',
        '## Performance becomes more visible on mobile',
        'Mobile visitors may have slower connections, limited data or less powerful devices. Large background images, unnecessary scripts and complex animation can make a page feel heavy even when it appears visually impressive. Responsive images, sensible compression, lazy loading below the fold and careful JavaScript loading can make a meaningful difference.',
        'Performance should be measured rather than guessed. Test the page under constrained network and device conditions. Watch for layout shifts, delayed interactions and content that takes too long to appear. A fast first impression is useful only if the page remains responsive as people use it.',
        '## Test the experience, not just the screenshot',
        'Browser resizing is a useful first check, but it cannot reproduce every real mobile condition. Test on actual phones where possible. Rotate the device, use long headings, enter validation errors, open menus with a keyboard and try the page at narrow widths that were not part of the original design.',
        'Automated accessibility and performance checks can reveal common problems, but they do not replace human judgement. Ask someone unfamiliar with the interface to complete a realistic task. Their hesitation often reveals more than a perfect screenshot.',
        '## Mobile quality is product quality',
        'A mobile visitor is not a secondary visitor. In many situations, the phone is the first and only device a person uses to reach a business. A responsive website respects that reality by making information readable, controls usable and tasks achievable without unnecessary effort.',
        'The goal is not to make every screen look identical. It is to make every screen feel like the right version of the same thoughtful product.'
      ].join('\n\n')
    },
    {
      title: 'Frontend and Backend: How Two Sides of a Website Work Together',
      slug: 'frontend-and-backend-how-websites-work-together',
      excerpt: 'A modern web application is a coordinated system. Understand how the interface, APIs, server logic, databases and security responsibilities fit together.',
      seo: 'A clear technical guide to frontend and backend development, HTTP APIs, server-side logic, databases, authentication and full-stack application architecture.',
      image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=85',
      content: [
        '## A website is more than what appears on the screen',
        'When people open a website, they see a page, a menu, images, forms and buttons. Those visible elements are the frontend, but they are only one part of a modern application. Behind the interface, server-side code handles requests, applies rules, retrieves information and coordinates services. A database may preserve the information that the application needs to remember.',
        'Frontend and backend are different areas of responsibility, but they are not separate products. They form one system. The quality of the experience depends on how clearly they communicate and how reliably each layer performs its role.',
        '## The frontend is the point of interaction',
        'The frontend is responsible for presenting information and allowing people to interact with it. HTML provides structure and meaning. CSS controls layout and visual presentation. JavaScript adds behaviour such as menus, validation, filtering and dynamic updates.',
        'A good frontend does more than look attractive. It should make the next action understandable, provide feedback, support keyboard and assistive technology users, and remain usable across screen sizes. It should also avoid assuming that every request will succeed. Networks fail, sessions expire and server responses can take time.',
        '## The backend applies the application rules',
        'The backend runs on a server and receives requests from the frontend or other clients. It is responsible for work that should not be trusted to the browser, such as permission checks, business rules, protected data access and coordination with external services.',
        'For example, a booking application should not rely on a browser to decide whether a time slot is still available. The server must check the current state before confirming the booking. If two people try to reserve the same slot at nearly the same time, the backend and database must protect the application from inconsistent results.',
        '## APIs create a clear contract',
        'An API defines how one part of a system communicates with another. In a web application, an HTTP API commonly exposes endpoints that accept requests and return structured responses. A frontend might request a list of projects, submit a contact enquiry or ask for the current profile.',
        'The API contract should be predictable. It should define the expected data, the possible responses and the errors a client may need to handle. Clear contracts allow the frontend and backend to evolve without relying on assumptions hidden inside the code.',
        '## The database gives the application memory',
        'A database stores information beyond the lifetime of a single browser session. Relational databases organise data into tables and use relationships to represent connections between records. A user may have many orders, a project may have several contributors and an article may belong to one category.',
        'The backend controls how the application reads and changes that data. Parameterised queries, constraints and transactions help preserve correctness. A transaction is especially useful when several changes must succeed together. If one part fails, the application can roll back the operation rather than leave incomplete data behind.',
        '## Security belongs across the whole system',
        'Security is not a feature that can be added only to the backend at the end. The frontend should avoid exposing secrets and should present safe, clear interactions. The backend must authenticate users, authorise each protected action, validate input and protect sensitive records. The database should use appropriate permissions and avoid storing credentials in plain text.',
        'HTTPS protects data in transit, while secure session handling helps prevent unauthorised access. Logs and error responses should be designed carefully so that debugging does not become a source of information leakage. Every layer has responsibilities, and a weakness in one can undermine the rest.',
        '## What full-stack development really means',
        'Full-stack development means understanding how these layers fit together and being able to work across their boundaries. It does not mean that one person must know every framework or infrastructure tool. It means being able to reason about the complete journey, identify where a problem belongs and make decisions that respect the needs of the whole application.',
        'A developer might build a responsive interface, connect it to an API, implement server-side validation and work with a database-backed feature. In a larger team, specialists may own individual layers, but shared understanding still makes collaboration more effective.',
        '## Build from the user journey outward',
        'A useful way to plan a web application is to begin with what a person needs to accomplish. Map the steps, identify the information required at each stage and decide which layer should own each responsibility. Then define the API contract, design the data model and build the interface around real states such as loading, success, empty results and failure.',
        'When frontend and backend are designed as partners, the result is more than a collection of pages. It becomes a coherent application that people can understand, trust and use.'
      ].join('\n\n')
    },
    {
      title: 'Seven Reasons Websites Feel Slow and How Developers Can Improve Them',
      slug: 'seven-reasons-websites-feel-slow-and-how-to-improve-them',
      excerpt: 'Website speed is shaped by images, scripts, fonts, server response, caching and layout behaviour. Learn how to find the real bottleneck and improve it.',
      seo: 'Discover seven common causes of slow websites and practical ways to improve loading speed, image delivery, JavaScript, caching, server response and user experience.',
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=85',
      content: [
        '## Speed is part of the user experience',
        'A website can have excellent design and useful content, yet still lose visitors if it takes too long to become usable. People do not experience performance as a single technical score. They experience waiting, movement, delayed responses and moments when the page appears ready but refuses to react.',
        'Improving speed begins with understanding where time is being spent. Adding a cache or compressing an image without measuring the page may help, but it can also miss the real problem. Good performance work is evidence-led.',
        '## Images that are larger than the job requires',
        'Images are often among the heaviest resources on a page. A photograph uploaded directly from a modern phone may contain far more pixels and data than a small card or banner needs. Sending that original file to every visitor wastes bandwidth and increases waiting time.',
        'Create appropriately sized image variants, compress them carefully and use modern formats where browser support allows. Responsive image markup can let the browser select a suitable file for the available display size. Images below the first visible section can usually be lazy loaded, while the main visual should be prioritised when it is important to the first impression.',
        '## JavaScript that delays useful work',
        'Large scripts can take time to download, parse and execute. A page may look simple while loading several libraries that are used only on one small section. Unnecessary code competes for network and processor time, especially on lower-powered phones.',
        'Load scripts only where they are needed, remove unused dependencies and split large bundles when the application structure supports it. Use deferred or asynchronous loading appropriately, and avoid running expensive work repeatedly during scrolling or typing. The objective is not to remove JavaScript at any cost. It is to ensure that the code delivered to a visitor has a clear purpose.',
        '## Too many requests and third-party services',
        'Every font, script, analytics tool, video embed and external widget adds work. Some services introduce additional DNS lookups, connection setup and dependencies that the website owner cannot fully control. A page with many small requests can become slower than expected even when each individual file seems harmless.',
        'Review third-party tools regularly. Keep the services that support a real goal, remove duplicate tracking and load nonessential widgets after the main content. Self-hosting selected assets may improve control, but it should be balanced against maintenance and update responsibilities.',
        '## Server response time is part of page speed',
        'Before a browser can render a server-generated page or receive data from an API, it must wait for the server to respond. Slow database queries, repeated external API calls, overloaded instances and inefficient application logic can all increase that wait.',
        'Measure server response time and inspect application logs before changing infrastructure. Cache data that is safe to reuse, add indexes for queries that genuinely need them and avoid fetching the same information repeatedly. A faster server cannot compensate for every inefficient request pattern.',
        '## Caching that is missing or misconfigured',
        'Without effective caching, returning visitors may download the same unchanged files repeatedly. Browser caching can store versioned assets such as stylesheets, scripts and images. A content delivery network can serve suitable static resources closer to visitors. Application-level caching can reduce repeated database work when the data and invalidation rules are understood.',
        'Caching is not simply making everything permanent. Frequently changing or private information needs careful cache controls. Static assets should use versioned filenames or another reliable cache-busting strategy so that users receive updates when the files change.',
        '## Fonts and layout shifts',
        'Custom fonts can delay text rendering or cause the page to rearrange after the font loads. Images without reserved dimensions can push content down after they appear. Advertisements and embedded widgets can also change the layout unexpectedly.',
        'Use font subsets and sensible font loading strategies. Reserve space for media using dimensions or aspect ratios. Avoid inserting content above what a visitor is reading unless the layout has already made room for it. Visual stability is a performance concern because unexpected movement makes a page harder to use.',
        '## Measuring the wrong thing',
        'A single speed test score does not explain every user experience. Core Web Vitals provide useful field and laboratory signals. Largest Contentful Paint helps describe when the main content becomes visible. Interaction to Next Paint measures responsiveness to interactions. Cumulative Layout Shift captures unexpected movement.',
        'Use laboratory tools to diagnose a page under controlled conditions and real-user data to understand how visitors experience it over time. Test important templates on mobile and desktop. Compare before and after results so that an optimisation is supported by evidence rather than intuition.',
        '## A practical order of work',
        'Start by measuring a representative page. Identify the largest resource and the slowest meaningful operation. Optimise the main image, reduce unnecessary script work, review third-party requests, inspect server response and improve caching where appropriate. Then test again under the same conditions.',
        'Fast websites are rarely the result of one clever trick. They are the result of many deliberate decisions that remove unnecessary work while protecting the quality of the experience.'
      ].join('\n\n')
    },
    {
      title: 'From an Idea to a Working Web Application: The Development Journey',
      slug: 'from-idea-to-working-web-application-development-journey',
      excerpt: 'A successful web application is shaped long before the first component is written. Explore discovery, planning, design, architecture, development, testing and deployment.',
      seo: 'Learn the stages of building a web application, from defining the problem and planning user journeys to frontend development, backend architecture, testing and deployment.',
      image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=85',
      content: [
        '## The first deliverable is understanding',
        'A promising application idea is not yet a product. Before writing code, a developer needs to understand who the application is for, what problem it solves and what a successful outcome looks like. Without that clarity, it is easy to spend time building features that look impressive but do not help the intended user.',
        'Discovery does not need to be complicated. Speak with the people who experience the problem, observe the current process and write down the most important frustrations. Separate what users genuinely need from features that are merely interesting to build.',
        '## Define a useful first version',
        'A common mistake is trying to build the complete vision immediately. Large feature lists increase cost, delay feedback and make it harder to identify what is essential. A minimum viable product should deliver one meaningful outcome with enough quality to be tested in real conditions.',
        'For a booking product, that might mean allowing a user to view availability and request a reservation before adding advanced recommendations or loyalty features. The first version should not be careless or insecure. It should be focused.',
        '## Map the user journey',
        'Describe the steps a person takes from arriving at the application to completing the main task. Identify what information they need, what choices they make and what happens when something goes wrong. A simple flow can reveal missing screens, confusing decisions and unnecessary steps before they become expensive code changes.',
        'Wireframes help communicate structure without becoming distracted by colour and visual detail. They show where navigation, content, forms and actions belong. Once the flow makes sense, visual design can establish hierarchy, typography, spacing and a consistent interface language.',
        '## Choose an architecture that fits the problem',
        'Technical architecture should support the product rather than showcase the largest possible technology stack. A small application may work well with a straightforward frontend, a modest backend and a relational database. A more complex product may need background jobs, file storage, search or separate services as its needs grow.',
        'Consider the team, hosting environment, expected traffic, data sensitivity and maintenance budget. Choose technologies that can be operated reliably. A familiar, well-understood architecture is often a better starting point than a fashionable system whose operational cost is not justified.',
        '## Design the data and API before the details multiply',
        'When an application stores information, define the important entities and their relationships. Decide which records belong to users, which fields are required and what rules must always remain true. Database constraints can protect important assumptions even when several requests arrive at the same time.',
        'Define the API around user actions and clear responsibilities. A frontend should not need to understand private database details. The backend should expose only the information and operations that a client is allowed to use. This separation makes the application easier to test and change.',
        '## Build in small, testable steps',
        'Develop the application in vertical slices. A slice takes one user journey through the interface, API and data layer so that the whole path can be tested early. This is more informative than building every screen first and discovering later that the backend cannot support the intended behaviour.',
        'Use version control and meaningful commits so changes can be reviewed and recovered. Keep configuration separate from source code, protect secrets and document the steps required to run the project. Small, understandable changes make collaboration and debugging easier.',
        '## Test the behaviour people depend on',
        'Testing should cover more than whether a page loads. Check valid and invalid input, permission boundaries, empty states, slow networks, server failures and the behaviour of important workflows. Automated tests can protect business rules and API contracts, while manual testing helps reveal confusing interactions and accessibility problems.',
        'Test on different screen sizes and browsers. Review keyboard navigation, labels, focus states and contrast. A product that works only for the developer who built it is not ready for real users.',
        '## Deployment is the beginning of operation',
        'A successful local build is not the end of development. Deployment introduces real infrastructure, environment variables, domains, HTTPS, database connections, logging and backup responsibilities. A production release should have a clear way to identify the version that is running and a plan for recovering from a failed change.',
        'After launch, monitor errors and listen to user feedback. Review performance and security updates. Fix the problems that block people before expanding the feature list. A product becomes better through a continuous cycle of observation, improvement and careful release.',
        '## Build for the problem, not for the portfolio screenshot',
        'A working application is the result of many connected decisions. Planning makes the goal clear, design makes the journey understandable, architecture gives the system structure, development turns the plan into behaviour and testing checks whether that behaviour can be trusted.',
        'The best development process is not the one that produces the most code. It is the one that consistently turns a real need into a useful, maintainable product.'
      ].join('\n\n')
    }
  ];
  for (const article of portfolioArticles) {
    if (await missing('articles', 'slug', article.slug)) {
      const published = now();
      const markdown = article.content;
      const html = renderMarkdown(markdown);
      const result = await db.query(
        "INSERT INTO articles (id,title,slug,excerpt,content_md,content_html,featured_image_url,category_id,seo_title,seo_description,status,published_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published',$11,$11,$11) RETURNING id",
        [randomUUID(), article.title, article.slug, article.excerpt, markdown, html, article.image, webCategory?.id || null, article.title, article.seo, published]
      );
      const articleId = result.rows[0].id;
      const tags = ['Web Development', 'Full-Stack', 'Engineering'];
      for (const tagName of tags) {
        const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let tag = (await db.query('SELECT id FROM article_tags WHERE slug = $1', [tagSlug])).rows[0];
        if (!tag) { tag = { id: randomUUID() }; await db.query('INSERT INTO article_tags (id,name,slug,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)', [tag.id, tagName, tagSlug, published]); }
        await db.query('INSERT INTO article_tag_assignments (article_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [articleId, tag.id]);
      }
      await db.query('INSERT INTO article_images (id,article_id,url,alt,sort_order) VALUES ($1,$2,$3,$4,0)', [randomUUID(), articleId, article.image, article.title,]);
    }
  }

  if (!(await count('email_templates'))) for (const [n, s, b] of [['Inquiry received', 'Thanks for your inquiry', 'Hello,\n\nThank you for contacting me. I have received your message and will reply within 24 hours.\n\nBest regards,\nEmmanuel']]) await db.query('INSERT INTO email_templates (id,name,subject,body,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [randomUUID(), n, s, b, t]);
  if (!(await count('email_saved_replies'))) await db.query('INSERT INTO email_saved_replies (id,title,body,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)', [randomUUID(), 'Ask for project details', 'Thanks for reaching out! Could you share your goals, preferred timeline and any reference websites you like?', t]);
}

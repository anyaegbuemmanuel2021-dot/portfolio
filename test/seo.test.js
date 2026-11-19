import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_URL = 'https://portfolio.example';
const { setSeoDb, dynamicText, dynamicHtml, decorateHtml } = await import('../server/routes/seo.js');

const article = {
  id: 'article-1', title: 'Search Ready Article', slug: 'search-ready-article',
  excerpt: 'A useful article description.', content_html: '<h2>Overview</h2><h4>Details</h4><p><a href="/assets/files/Emmanuel_Anyaegbu_CV.pdf">Download CV</a></p>', canonical_url: null,
  featured_image_url: 'https://cdn.example.com/article-cover.webp',
  published_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-02T10:00:00.000Z'
};
const project = {
  id: 'project-1', title: 'SEO Project', slug: 'seo-project', summary: 'A project summary.',
  description: 'A longer project description.', cover_url: 'https://cdn.example.com/project.webp',
  url: 'https://project.example.com', repo_url: 'https://github.com/example/project',
  category: 'Web development', updated_at: '2026-11-03T10:00:00.000Z'
};
const service = {
  id: 'service-1', title: 'Website Development', slug: 'website-development',
  summary: 'Responsive websites for businesses.', description: 'Planning, design and development.',
  price_note: 'Scoped to your needs', updated_at: '2026-11-04T10:00:00.000Z'
};
const db = {
  async query(sql, params = []) {
    if (sql.includes("key = 'canonical_base'")) return { rows: [{ value: 'https://portfolio.example/' }] };
    if (sql.includes('FROM article_images')) return { rows: [{ article_id: 'article-1', url: 'https://cdn.example.com/inline.webp', alt: 'Article illustration' }] };
    if (sql.includes('FROM articles') && sql.includes('lower(a.slug)')) return { rows: params[0] === 'draft' ? [] : [article] };
    if (sql.includes('FROM articles') && sql.includes('excerpt FROM articles')) return { rows: [article] };
    if (sql.includes('FROM articles') && sql.includes('canonical_url')) { assert.match(sql, /SELECT id, title, slug/); return { rows: [article] }; }
    if (sql.includes('FROM projects')) return { rows: [project] };
    if (sql.includes('FROM services')) return { rows: [service] };
    return { rows: [] };
  }
};
setSeoDb(db);

test('sitemap omits articles whose canonical URL points to another host', async () => {
  article.canonical_url = 'https://external.example/original-article';
  const xml = await dynamicText('/sitemap.xml');
  assert.doesNotMatch(xml, /https:\/\/external\.example\/original-article/);
  assert.doesNotMatch(xml, /https:\/\/portfolio\.example\/articles\/search-ready-article/);
  article.canonical_url = null;
});

test('dynamic sitemap includes published articles, projects, services and their images', async () => {
  const xml = await dynamicText('/sitemap.xml');
  assert.match(xml, /https:\/\/portfolio\.example\/articles\/search-ready-article/);
  assert.match(xml, /https:\/\/portfolio\.example\/projects\/seo-project/);
  assert.match(xml, /https:\/\/portfolio\.example\/services\/website-development/);
  assert.match(xml, /https:\/\/cdn\.example\.com\/article-cover\.webp/);
  assert.match(xml, /https:\/\/cdn\.example\.com\/inline\.webp/);
  assert.match(xml, /https:\/\/cdn\.example\.com\/project\.webp/);
  assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
});

test('CMS project and service slugs render editable SEO metadata and canonical URLs', async () => {
  project.seo_title = 'Custom Project SEO Title';
  project.seo_description = 'A custom description written for this project page and intended to explain its purpose to search visitors.';
  project.canonical_url = 'https://portfolio.example/work/seo-project';
  service.seo_title = 'Custom Service SEO Title';
  service.seo_description = 'A custom service description written for this page and intended to explain its value to potential clients.';
  service.canonical_url = 'https://portfolio.example/offerings/web-development';
  const projectPage = await dynamicHtml('/projects/seo-project');
  assert.match(projectPage, /<link rel="canonical" href="https:\/\/portfolio\.example\/work\/seo-project">/);
  assert.match(projectPage, /"@type":"CreativeWork"/);
  assert.match(projectPage, /Custom Project SEO Title/);
  assert.match(projectPage, /project\.webp/);

  const servicePage = await dynamicHtml('/services/website-development');
  assert.match(servicePage, /<link rel="canonical" href="https:\/\/portfolio\.example\/offerings\/web-development">/);
  assert.match(servicePage, /"@type":"Service"/);
  assert.match(servicePage, /Custom Service SEO Title/);
});

test('project and service HTML decoration honours CMS SEO overrides', async () => {
  const shell = '<!doctype html><html><head><title>Old</title><meta name="description" content="Old description"></head><body></body></html>';
  const projectHtml = await decorateHtml(shell, '/projects/seo-project');
  assert.match(projectHtml, /<link rel="canonical" href="https:\/\/portfolio\.example\/work\/seo-project">/);
  assert.match(projectHtml, /Custom Project SEO Title/);
  assert.match(projectHtml, /custom description written for this project page/i);
  const serviceHtml = await decorateHtml(shell, '/services/website-development');
  assert.match(serviceHtml, /<link rel="canonical" href="https:\/\/portfolio\.example\/offerings\/web-development">/);
  assert.match(serviceHtml, /Custom Service SEO Title/);
  assert.match(serviceHtml, /custom service description written for this page/i);
  project.canonical_url = 'https://external.example/canonical-project';
  const sitemap = await dynamicText('/sitemap.xml');
  assert.doesNotMatch(sitemap, /external\.example\/canonical-project/);
  project.canonical_url = 'https://portfolio.example/work/seo-project';
  assert.match(await dynamicText('/sitemap.xml'), /https:\/\/portfolio\.example\/work\/seo-project/);
  project.canonical_url = null;
  service.canonical_url = null;
});

test('article and static HTML pages receive clean canonical and social metadata', async () => {
  const html = '<!doctype html><html><head><title>Article</title><meta name="description" content="Old description"></head><body><article id="articleView">Loading</article></body></html>';
  const decorated = await decorateHtml(html, '/articles/search-ready-article');
  assert.match(decorated, /<link rel="canonical" href="https:\/\/portfolio\.example\/articles\/search-ready-article">/);
  assert.match(decorated, /property="og:image" content="https:\/\/cdn\.example\.com\/article-cover\.webp"/);
  assert.match(decorated, /"@type":"Article"/);
  assert.ok(decorated.includes('<h1 class="article__title">Search Ready Article</h1>'));
  assert.match(decorated, /href="\/resume"/);
  assert.doesNotMatch(decorated, /Emmanuel_Anyaegbu_CV\.pdf/);
  assert.match(decorated, /<h3>Details<\/h3>/);
  assert.doesNotMatch(decorated, /<h4>/);

  const staticPage = await decorateHtml(html, '/about.html');
  assert.match(staticPage, /<link rel="canonical" href="https:\/\/portfolio\.example\/about">/);
});


test('article, project and service listings expose crawlable links to their detail pages', async () => {
  const shell = '<!doctype html><html><head><title>Listing</title><meta name="description" content="A useful listing page description for visitors and search engines."></head><body><div id="articleList"></div></body></html>';
  const articles = await decorateHtml(shell, '/articles');
  assert.match(articles, /href="\/articles\/search-ready-article"/);

  const projects = await decorateHtml(shell, '/projects');
  assert.match(projects, /href="\/projects\/seo-project"/);
  assert.match(projects, /Explore individual project case studies/);

  const services = await decorateHtml(shell, '/services');
  assert.match(services, /href="\/services\/website-development"/);
  assert.match(services, /Explore individual service details/);
});

test('unpublished article slugs return a real 404 instead of an indexable article shell', async () => {
  const missing = await dynamicHtml('/articles/draft');
  assert.deepEqual(missing, { status: 404, body: 'Not found' });
});

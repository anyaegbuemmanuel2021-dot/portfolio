import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('public identity uses accurate frontend and digital-content positioning', () => {
  const home = read('public/index.html');
  const about = read('public/about.html');
  const resume = read('public/resume.html');
  for (const [page, html] of [['homepage', home], ['about page', about], ['resume', resume]]) {
    assert.doesNotMatch(html, /Full-Stack Developer|Full-Stack Development|Backend Developer/i, page + ' must not overstate current professional positioning');
  }
  assert.match(home, /Frontend Developer/);
  assert.match(home, /AI-assisted promotional videos/);
  assert.match(about, /HTML5/);
  assert.match(about, /CSS3/);
  assert.match(resume, /JavaScript fundamentals/);
  assert.doesNotMatch(home, /Happy Clients|Years Coding|data-count=/);
});

test('profile and service copy distinguishes current frontend delivery from backend project exposure', () => {
  const about = read('public/about.html');
  const services = read('public/services.html');
  const resume = read('public/resume.html');
  assert.match(services, /frontend/i);
  assert.match(services, /current delivery focus is frontend websites/i);
  assert.doesNotMatch(services, /backend development services|full-stack development services/i);
  assert.match(about, /backend and database development are learning areas/i);
  assert.match(resume, /backend and database development are not presented as independent services/i);
});

test('about page lists demonstrable skills without arbitrary proficiency percentages', () => {
  const html = read('public/about.html');
  assert.match(html, /SIWES Training — Web Development/);
  assert.match(html, /September — November 2025/);
  assert.match(html, /VS Code/);
  assert.doesNotMatch(html, /\b(?:95|93|92|90|88|85|80|75|70)%/);
  assert.doesNotMatch(html, /Freelance Frontend Developer|Certifications Earned/);
});

test('project source links point to this repository project folders', () => {
  const html = read('public/projects.html');
  for (const slug of ['restaurant', 'agency', 'blog', 'shop', 'event', 'calculator']) {
    assert.ok(html.includes('portfolio/tree/main/public/projects/' + slug), 'missing source link for ' + slug);
  }
  assert.doesNotMatch(html, /github\.com\/anyaegbu-emmanuel["/]/);
});

test('all demo sites disclose that brands and sample content are illustrative', () => {
  for (const slug of ['restaurant', 'agency', 'blog', 'shop', 'event', 'calculator']) {
    const html = read('public/projects/' + slug + '/index.html');
    assert.match(html, /Independent portfolio demonstration — sample brand and content only/);
  }
});

test('wedding invitation demo has no expired countdown date or fake RSVP success', () => {
  const html = read('public/projects/event/index.html');
  assert.doesNotMatch(html, /2025|\[EVENT YEAR\]|new Date\(/);
  assert.doesNotMatch(html, /Your RSVP has been received/);
  assert.match(html, /connect this form to an RSVP service/i);
});

test('resume is the only public CV destination and contains confirmed education and training', () => {
  const html = read('public/resume.html');
  assert.match(html, /B\.Sc\. Computer Science — In Progress/);
  assert.match(html, /National Diploma \(ND\), Computer Science/);
  assert.match(html, /SIWES Trainee — Web Development/);
  assert.doesNotMatch(html, /15\+ web applications|500\+ transactions|₦2 million|4\.2x/);
  for (const page of ['public/index.html', 'public/about.html', 'public/projects.html', 'public/services.html', 'public/contact.html', 'public/articles.html', 'public/article.html']) {
    assert.doesNotMatch(read(page), /assets\/files\/Emmanuel_Anyaegbu_CV\.(?:pdf|docx)/);
  }
});

test('public articles page does not expose an empty-state admin prompt or manager link', () => {
  const articles = read('public/articles.html') + read('public/assets/js/articles.js');
  for (const phrase of ['Articles are on the way', 'New articles are being prepared', 'Open article manager', '/admin/#/articles']) {
    assert.equal(articles.includes(phrase), false, `Public articles source should not contain: ${phrase}`);
  }
});

test('CMS skills are allowlisted and testimonials stay hidden until verified', () => {
  const cms = read('public/assets/js/cms.js');
  assert.match(cms, /var allowed =/);
  assert.match(cms, /Keep testimonials hidden until every quote and attribution has been verified/);
});


test('primary navigation stays fixed and readable while scrolling', () => {
  const css = read('public/assets/css/global.css');
  const nav = css.match(/\.nav \{([\s\S]*?)\n\}/);
  assert.ok(nav, 'navigation CSS rule exists');
  assert.match(nav[1], /position:\s*fixed/);
  assert.match(nav[1], /background-color:\s*rgba\(8,8,8,0\.94\)/);
  assert.match(nav[1], /backdrop-filter:\s*blur\(20px\)/);
});

test('social links from the CMS update footer and contact-page profile links', () => {
  const cms = read('public/assets/js/cms.js');
  assert.match(cms, /function renderSocial\(rows, settings\)/);
  assert.match(cms, /\.contact-method__value/);
  assert.match(cms, /Keep every existing matching link in sync/);
  assert.match(cms, /\.footer__socials/);
});

test('CMS scripts are refreshed and public CMS content is not browser-cached', () => {
  const sw = read('public/sw.js');
  const routes = read('server/routes/public.js');
  assert.match(sw, /aei-pwa-v\d+/);
  assert.match(sw, /assets\/js\/cms\.js/);
  assert.match(routes, /Cache-Control': 'no-store, max-age=0/);
});


test('light mode keeps desktop and mobile navigation surfaces and controls readable', () => {
  const css = read('public/assets/css/global.css');
  assert.match(css, /\[data-theme="light"\] \.nav,[\s\S]*?background-color:\s*rgba\(250, 250, 247, 0\.97\)/);
  assert.match(css, /\[data-theme="light"\] \.nav__mobile[\s\S]*?background-color:\s*rgba\(250, 250, 247, 0\.99\)/);
  assert.match(css, /\[data-theme="light"\] \.nav__hamburger span/);
});

test('homepage showcases eleven projects and builds while retaining all six labelled demos', () => {
  const html = read('public/index.html');
  for (const slug of ['restaurant', 'agency', 'blog', 'shop', 'event', 'calculator']) {
    assert.ok(html.includes('projects/' + slug + '/index.html'), 'missing homepage demo link for ' + slug);
  }
  for (const name of ['MedPulse', 'Softly Digital — CBT Platform', 'SocialPulse', 'Church Media Broadcast System', 'XOFT']) {
    assert.ok(html.includes(name), 'missing project entry: ' + name);
  }
  assert.equal((html.match(/<article class="project-card"/g) || []).length, 11);
  assert.match(html, /Website Projects & Demonstrations/);
  assert.match(html, /Projects & builds/);
});


test('public article page has no empty-state copy or admin manager link and cards stay compact', () => {
  const articles = read('public/articles.html') + read('public/assets/js/articles.js');
  const css = read('public/assets/css/platform.css');
  for (const phrase of ['Articles are on the way', 'New articles are being prepared', 'Open article manager', '/admin/#/articles']) {
    assert.equal(articles.includes(phrase), false, `Public articles source should not contain: ${phrase}`);
  }
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*320px\),\s*360px\)\)/);
  assert.match(css, /justify-content:\s*start/);
  assert.match(css, /max-width:\s*360px/);
});

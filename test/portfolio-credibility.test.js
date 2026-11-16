import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('homepage uses accurate hybrid positioning and avoids invented metrics', () => {
  const html = read('public/index.html');
  assert.match(html, /Frontend Developer & AI Creative Technologist/);
  assert.doesNotMatch(html, /Full-Stack Developer|Full-Stack Development|Node\.js|PostgreSQL/);
  assert.doesNotMatch(html, /Happy Clients|Years Coding|data-count=/);
  assert.match(html, /AI-assisted video & content/);
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
  for (const page of ['public/index.html', 'public/about.html', 'public/projects.html', 'public/services.html', 'public/contact.html', 'public/articles.html']) {
    assert.doesNotMatch(read(page), /assets\/files\/Emmanuel_Anyaegbu_CV\.(?:pdf|docx)/);
  }
});

test('articles page provides a useful empty state when no posts are published', () => {
  assert.match(read('public/assets/js/articles.js'), /Articles are on the way/);
});

test('CMS skills are allowlisted and testimonials stay hidden until verified', () => {
  const cms = read('public/assets/js/cms.js');
  assert.match(cms, /var allowed =/);
  assert.match(cms, /Keep testimonials hidden until every quote and attribution has been verified/);
});

/* Public CMS binding. Keeps the original site markup/styles as the fallback when the API is offline. */
(function () {
  'use strict';
  var base = (window.PORTFOLIO_API_BASE || '').replace(/\/$/, '');
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var text = function (el, value) { if (el && value != null && value !== '') el.textContent = String(value); };
  var safeCopy = function (value) { return String(value || '').replace(/full[\s-]?stack\s+developer/gi, 'Frontend Developer').replace(/full[\s-]?stack\s+development/gi, 'Frontend Development').replace(/backend-powered applications/gi, 'responsive websites and digital content').replace(/\b(Node\.?js|PostgreSQL|Django|GraphQL|Redis|WebRTC)\b/gi, 'backend technologies (currently learning)').replace(/I also hold certifications[^.]*\./gi, 'I continue to build skills through practical project work.'); };
  var safeUrl = function (value) { try { var u = new URL(String(value || ''), location.href); return /^(https?:|mailto:|tel:)$/.test(u.protocol) ? u.href : '#'; } catch (_) { return '#'; } };
  var esc = function (value) { return String(value || '').replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); };
  var list = function (v) { if (Array.isArray(v)) return v; return String(v || '').split(/[,|]/).map(function (x) { return x.trim(); }).filter(Boolean); };
  function makeProject(p, i) {
    var card = document.createElement('article'); card.className = 'project-card'; card.setAttribute('data-reveal', 'fade-up'); card.classList.add('revealed');
    var rawCategory = String(p.category || '').trim().toLowerCase();
    var category = rawCategory.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (/business|company|corporate|commerce|shop|store|restaurant|blog/.test(category)) category = 'business';
    else if (/portfolio|agency|personal|creative/.test(category)) category = 'portfolio';
    else if (/javascript|\bjs\b|app|tool|ui|interface/.test(category)) category = 'ui';
    card.dataset.category = category;
    var thumb = document.createElement('div'); thumb.className = 'project-card__thumb';
    if (p.cover_url) { var img = document.createElement('img'); img.src = safeUrl(p.cover_url); img.alt = p.title || 'Project preview'; img.loading = 'lazy'; img.decoding = 'async'; img.style.cssText = 'width:100%;height:100%;object-fit:cover'; thumb.appendChild(img); }
    else { var face = document.createElement('div'); face.className = 'project-card__thumb-inner project-card__thumb-inner--' + (i % 6 + 1); face.textContent = p.title || 'PROJECT'; thumb.appendChild(face); }
    var icon = document.createElement('span'); icon.className = 'project-card__link-icon'; var iconGlyph = document.createElement('i'); iconGlyph.className = 'fa-solid fa-arrow-up-right-from-square'; iconGlyph.setAttribute('aria-hidden', 'true'); icon.appendChild(iconGlyph); thumb.appendChild(icon);
    var body = document.createElement('div'); body.className = 'project-card__body';
    var tags = document.createElement('div'); tags.className = 'project-card__tags'; list(p.tags).forEach(function (tag) { var t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; tags.appendChild(t); });
    var h = document.createElement('h3'); h.className = 'project-card__title'; h.textContent = safeCopy(p.title || 'Project');
    var d = document.createElement('p'); d.className = 'project-card__desc'; d.textContent = safeCopy(p.summary || p.description || '') + ' Concept demonstration: sample brand and content are illustrative.';
    var actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap';
    var live = document.createElement('a'); live.className = 'btn btn--primary btn--sm'; live.href = safeUrl(p.url || ('projects/' + (p.slug || '') + '/index.html')); live.appendChild(document.createTextNode('View Live ')); var liveIcon = document.createElement('i'); liveIcon.className = 'fa-solid fa-arrow-up-right-from-square'; liveIcon.setAttribute('aria-hidden', 'true'); live.appendChild(liveIcon);
    if (live.href === '#') live.hidden = true; else { live.target = '_blank'; live.rel = 'noopener'; }
    actions.appendChild(live);
    if (p.repo_url) { var repo = document.createElement('a'); repo.className = 'btn btn--ghost btn--sm'; repo.href = p.slug && /^(restaurant|agency|blog|shop|event|calculator)$/.test(String(p.slug)) ? 'https://github.com/anyaegbuemmanuel2021-dot/portfolio/tree/main/public/projects/' + encodeURIComponent(p.slug) : safeUrl(p.repo_url); repo.target = '_blank'; repo.rel = 'noopener'; repo.textContent = 'GitHub'; actions.appendChild(repo); }
    body.append(tags, h, d, actions); card.append(thumb, body); return card;
  }
  function renderServices(rows) {
    var root = $('.services-list'); if (!root || !rows.length) return;
    root.replaceChildren(); rows.forEach(function (s, i) { var row = document.createElement('div'); row.className = 'service-row';
      var num = document.createElement('span'); num.className = 'service-row__num'; num.textContent = String(i + 1).padStart(2, '0');
      var content = document.createElement('div'); var h = document.createElement('h3'); h.className = 'service-row__title'; if (s.icon && /^fa-[a-z0-9-]+(?:\s+fa-[a-z0-9-]+)*$/i.test(s.icon)) { var serviceIcon = document.createElement('i'); serviceIcon.className = s.icon; serviceIcon.setAttribute('aria-hidden', 'true'); h.appendChild(serviceIcon); h.appendChild(document.createTextNode(' ')); } h.appendChild(document.createTextNode(safeCopy(s.title)));
      var p = document.createElement('p'); p.className = 'service-row__desc'; p.textContent = safeCopy(s.description || s.summary || '');
      var tags = document.createElement('div'); tags.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-3)';
      list(s.tags).forEach(function (v) { var t = document.createElement('span'); t.className = 'tag'; t.textContent = v; tags.appendChild(t); });
      content.append(h, p); if (tags.childNodes.length) content.appendChild(tags);
      var arrow = document.createElement('span'); arrow.className = 'service-row__arrow'; var arrowIcon = document.createElement('i'); arrowIcon.className = 'fa-solid fa-arrow-right'; arrowIcon.setAttribute('aria-hidden', 'true'); arrow.appendChild(arrowIcon); row.append(num, content, arrow); root.appendChild(row);
    });
  }
  function renderSkills(rows) {
    var root = $('.skills-grid'); if (!root || !rows.length) return;
    var allowed = /^(html5?|css3?|javascript|responsive design|responsive layouts|flexbox|css grid|css animations|figma|canva|vs code|git|github|ai tools|ai video creation|prompt engineering)$/i;
    var groups = {};
    rows.filter(function (s) { return allowed.test(String(s.name || '').trim()); }).forEach(function (s) { var key = s.category || 'Skills'; (groups[key] ||= []).push(s); });
    if (!Object.keys(groups).length) return;
    root.replaceChildren();
    Object.keys(groups).forEach(function (key) {
      var group = document.createElement('div');
      var heading = document.createElement('p'); heading.className = 'skill-group__heading'; heading.textContent = key;
      var items = document.createElement('div'); items.className = 'skill-items';
      groups[key].forEach(function (s) { var item = document.createElement('span'); item.className = 'tag'; item.textContent = s.name; items.appendChild(item); });
      group.append(heading, items); root.appendChild(group);
    });
  }
  function renderExperience(rows) {
    var root = $('.timeline'); if (!root || !rows.length) return; rows = rows.filter(function (x) { return !/freelance|full[\s-]?stack|certification/i.test(String(x.role || '')); }); if (!rows.length) return; root.replaceChildren(); rows.forEach(function (x) { var item = document.createElement('div'); item.className = 'timeline-item'; var dot = document.createElement('div'); dot.className = 'timeline-item__dot'; dot.textContent = '•'; var body = document.createElement('div');
      var date = document.createElement('p'); date.className = 'timeline-item__date'; date.textContent = [x.start_date, x.end_date].filter(Boolean).join(' — ');
      var title = document.createElement('h3'); title.className = 'timeline-item__title'; title.textContent = x.role || '';
      var org = document.createElement('p'); org.className = 'timeline-item__org'; org.textContent = [x.organization, x.location].filter(Boolean).join(' · ');
      var desc = document.createElement('p'); desc.className = 'timeline-item__desc'; desc.textContent = x.description || ''; body.append(date, title, org, desc); item.append(dot, body); root.appendChild(item); });
  }
  function renderSocial(rows, settings) {
    if (!Array.isArray(rows) || !rows.length) return;
    var normalized = rows.map(function (s) {
      var platform = String(s.platform || '').trim().toLowerCase();
      return { platform: platform, label: String(s.platform || 'Social link').trim(), url: safeUrl(s.url), icon: s.icon || 'fas fa-link' };
    }).filter(function (s) { return s.url !== '#'; });
    function platformFor(value) {
      value = String(value || '').toLowerCase();
      if (/instagram/.test(value)) return 'instagram';
      if (/linkedin/.test(value)) return 'linkedin';
      if (/github/.test(value)) return 'github';
      if (/tiktok/.test(value)) return 'tiktok';
      if (/facebook/.test(value)) return 'facebook';
      if (/twitter|x\.com/.test(value)) return 'x';
      if (/youtube/.test(value)) return 'youtube';
      if (/whatsapp|wa\.me/.test(value)) return 'whatsapp';
      return '';
    }
    function displayHandle(url, platform) {
      try {
        var u = new URL(url);
        var value = (u.pathname.replace(/^\/+|\/+$/g, '') || u.hostname).replace(/^@/, '');
        if (platform === 'instagram' || platform === 'tiktok' || platform === 'x') value = '@' + value.replace(/^@/, '');
        return value;
      } catch (_) { return url; }
    }
    normalized.forEach(function (s) {
      var key = platformFor(s.platform) || platformFor(s.url);
      if (!key) return;
      // Keep every existing matching link in sync, including contact-page profile cards.
      $$('a[href]').forEach(function (a) {
        var current = platformFor((a.getAttribute('aria-label') || '') + ' ' + a.href);
        if (current === key) a.href = s.url;
      });
      $$('.contact-method').forEach(function (card) {
        var label = $('.contact-method__label', card);
        if (label && platformFor(label.textContent) === key) {
          var link = $('a', card);
          if (link) link.href = s.url;
          var value = $('.contact-method__value', card);
          if (value) value.textContent = displayHandle(s.url, key);
        }
      });
    });
    $$('.footer__socials').forEach(function (root) {
      var contact = $$('a[href^="mailto:"], a[href*="wa.me/"]', root).map(function (a) { return a.cloneNode(true); });
      root.replaceChildren();
      normalized.forEach(function (s) {
        var a = document.createElement('a'); a.className = 'footer__social'; a.href = s.url;
        a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', s.label);
        var i = document.createElement('i'); i.className = s.icon; i.setAttribute('aria-hidden', 'true');
        a.appendChild(i); root.appendChild(a);
      });
      contact.forEach(function (a) {
        if (a.href.indexOf('mailto:') === 0 && settings && settings.contact_email) a.href = 'mailto:' + settings.contact_email;
        if (a.href.indexOf('https://wa.me/') === 0 && settings && settings.whatsapp_number) a.href = 'https://wa.me/' + String(settings.whatsapp_number).replace(/\D/g, '');
        root.appendChild(a);
      });
    });
  }
  function renderNavigation(rows) {
    var header = rows.filter(function (x) { return x.location === 'header'; }); var footer = rows.filter(function (x) { return x.location === 'footer'; });
    if (header.length) { ['.nav__links', '.nav__mobile'].forEach(function (sel) { var root = $(sel); if (!root) return; var extras = $$('.theme-toggle, .nav__cv, .nav__hamburger', root); var keep = extras.map(function (e) { return e.closest('li') || e; }); $$('.nav__link, .nav__mobile-link', root).forEach(function (e) { e.closest('li') ? e.closest('li').remove() : e.remove(); }); header.forEach(function (n) { var a = document.createElement('a'); a.href = safeUrl(n.url); a.textContent = n.label; a.className = sel === '.nav__links' ? 'nav__link' : 'nav__mobile-link'; if (location.pathname.split('/').pop() === n.url.split('/').pop()) a.classList.add('active'); if (sel === '.nav__links') { var li = document.createElement('li'); li.appendChild(a); var before = root.querySelector('.theme-toggle')?.closest('li'); root.insertBefore(li, before || null); } else { var cv = root.querySelector('a.btn--cv'); root.insertBefore(a, cv || null); } }); }); }
    if (footer.length) $$('.footer__links').forEach(function (root) { root.replaceChildren(); footer.forEach(function (n) { var a = document.createElement('a'); a.className = 'footer__nav-link'; a.href = safeUrl(n.url); a.textContent = n.label; root.appendChild(a); }); });
  }
  function parseArray(value) { try { var parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } }
  function renderCards(root, rows, kind) {
    if (!root || !rows.length) return;
    root.replaceChildren(); rows.forEach(function (item, i) {
      var card = document.createElement('article'); card.className = 'service-card'; card.setAttribute('data-reveal', 'fade-up');
      if (item.popular) { card.style.borderColor = 'var(--color-gold)'; var badge = document.createElement('span'); badge.textContent = 'Most Popular'; badge.style.cssText = 'display:inline-block;margin-bottom:var(--space-3);color:var(--color-gold);font-size:var(--text-xs);font-weight:700'; card.appendChild(badge); }
      var icon = document.createElement('div'); icon.className = 'service-card__icon'; if (item.icon && /^fa-[a-z0-9-]+(?:\s+fa-[a-z0-9-]+)*$/i.test(item.icon)) { var cardIcon = document.createElement('i'); cardIcon.className = item.icon; cardIcon.setAttribute('aria-hidden', 'true'); icon.appendChild(cardIcon); } else { var fallbackIcon = document.createElement('i'); fallbackIcon.className = kind === 'pricing' ? 'fa-solid fa-tag' : 'fa-solid fa-circle'; fallbackIcon.setAttribute('aria-hidden', 'true'); icon.appendChild(fallbackIcon); }
      var title = document.createElement('h3'); title.className = 'service-card__title'; title.textContent = item.title || (kind === 'pricing' ? 'Package' : 'Step ' + (i + 1));
      card.append(icon, title);
      if (kind === 'pricing' && item.price) { var price = document.createElement('p'); price.textContent = item.price; price.style.cssText = 'font-size:var(--text-2xl);font-weight:700;color:var(--color-gold);margin:var(--space-4) 0'; card.appendChild(price); }
      var desc = document.createElement('p'); desc.className = 'service-card__desc'; desc.textContent = item.description || ''; card.appendChild(desc);
      if (kind === 'pricing' && Array.isArray(item.features) && item.features.length) { var ul = document.createElement('ul'); ul.style.cssText = 'margin-top:var(--space-4);color:var(--color-text-secondary);font-size:var(--text-sm);display:flex;flex-direction:column;gap:var(--space-2)'; item.features.forEach(function (f) { var li = document.createElement('li'); var check = document.createElement('i'); check.className = 'fa-solid fa-check'; check.setAttribute('aria-hidden', 'true'); check.style.marginRight = '.5rem'; li.append(check, document.createTextNode(String(f))); ul.appendChild(li); }); card.appendChild(ul); }
      var number = document.createElement('span'); number.className = 'service-card__number'; number.textContent = String(i + 1).padStart(2, '0'); card.appendChild(number); root.appendChild(card);
    });
  }
  function renderTestimonials(rows) {
    /* Keep testimonials hidden until every quote and attribution has been verified and approved. */
    return;
    root.replaceChildren(); rows.forEach(function (item) { var card = document.createElement('article'); card.className = 'service-card'; var quote = document.createElement('p'); quote.className = 'service-card__desc'; quote.textContent = '“' + (item.quote || '') + '”'; var name = document.createElement('h3'); name.className = 'service-card__title'; name.textContent = item.author_name || 'Client'; var role = document.createElement('p'); role.className = 'muted'; role.textContent = item.author_role || ''; var rating = document.createElement('p'); rating.textContent = '★'.repeat(Math.max(0, Math.min(5, Number(item.rating) || 0))); rating.setAttribute('aria-label', (Number(item.rating) || 0) + ' out of 5 stars'); card.append(quote, name, role, rating); root.appendChild(card); }); section.hidden = false;
  }
  function normalizeHttpUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
    try {
      var parsed = new URL(raw, location.href);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
    } catch (_) { return ''; }
  }
  function applySettings(settings) {
    settings = settings || {};
    Object.keys(settings).forEach(function (key) {
      var selector = '[data-cms-setting="' + key.replace(/[^a-z0-9_-]/gi, '') + '"]';
      $$(selector).forEach(function (el) {
        if (settings[key] == null || settings[key] === '') return;
        text(el, safeCopy(settings[key]));
        if (el.tagName === 'A') {
          if (key === 'contact_email') el.href = 'mailto:' + String(settings[key]).trim();
          else if (key === 'contact_phone') el.href = 'tel:' + String(settings[key]).replace(/[^+\\d]/g, '');
          else if (key === 'portfolio_url') {
            var target = normalizeHttpUrl(settings[key]);
            if (target) { el.href = target; el.target = '_blank'; el.rel = 'noopener'; }
          }
        }
      });
    });
    if (settings.contact_email) {
      var email = String(settings.contact_email).trim();
      $$('a[href^="mailto:"]').forEach(function (a) { a.href = 'mailto:' + email; });
    }
    if (settings.contact_phone) {
      var phone = String(settings.contact_phone).trim();
      $$('a[href^="tel:"]').forEach(function (a) { a.href = 'tel:' + phone.replace(/[^+\\d]/g, ''); });
    }
    if (settings.whatsapp_number) {
      var number = String(settings.whatsapp_number).replace(/\\D/g, '');
      $$('a[href*="wa.me/"]').forEach(function (a) {
        var oldUrl;
        try { oldUrl = new URL(a.href); } catch (_) { oldUrl = new URL('https://wa.me/' + number); }
        a.href = 'https://wa.me/' + number + oldUrl.search;
      });
    }
    if (settings.portfolio_url) {
      var portfolioHref = normalizeHttpUrl(settings.portfolio_url);
      if (portfolioHref) {
        var portfolioParsed = new URL(portfolioHref);
        var portfolioLabel = portfolioParsed.hostname.replace(/^www\\./i, '') + (portfolioParsed.pathname !== '/' ? portfolioParsed.pathname.replace(/\\/$/, '') : '');
        $$('a[data-cms-portfolio-link], a[data-cms-setting="portfolio_url"], a[href*="anyaegbuemmanuel.dev"]').forEach(function (a) {
          a.href = portfolioHref; a.target = '_blank'; a.rel = 'noopener';
        });
        $$('[data-cms-portfolio-label]').forEach(function (el) { text(el, portfolioLabel); });
      }
    }
    if (settings.site_title) {
      var pageTitle = document.title || '';
      if (!pageTitle || pageTitle.indexOf('Anyaegbu Emmanuel') >= 0) document.title = safeCopy(settings.site_title);
    }
    if (settings.seo_default_description) {
      $$('meta[name="description"]').forEach(function (meta) { meta.setAttribute('content', safeCopy(settings.seo_default_description)); });
    }
    if (settings.canonical_base) {
      var canonicalBase = normalizeHttpUrl(settings.canonical_base);
      if (canonicalBase) {
        var canonical = $('link[rel="canonical"]');
        if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
        canonical.href = canonicalBase.replace(/\\/$/, '') + location.pathname;
        $$('meta[property="og:url"]').forEach(function (meta) { meta.setAttribute('content', canonical.href); });
      }
    }
    if (settings.footer_tagline) $$('.footer__tagline').forEach(function (el) { text(el, safeCopy(settings.footer_tagline)); });
    if (settings.footer_text) $$('.footer__copy, .footer__copyright, .footer__bottom p').forEach(function (el) { text(el, settings.footer_text); });
    if (settings.pricing_json) renderCards($('[data-cms-pricing]'), parseArray(settings.pricing_json), 'pricing');
    if (settings.process_json) renderCards($('[data-cms-process]'), parseArray(settings.process_json), 'process');
  }

  function apply(data) {
    var bio = data.biography || {}; if (bio.headline) { var role = $('[data-typing]'); if (role) role.textContent = safeCopy(bio.headline); var sub = $('.page-hero__sub'); if (sub && location.pathname.endsWith('/about.html')) sub.textContent = safeCopy(bio.headline); }
    if (bio.body) { text($('.hero__desc'), safeCopy(bio.body)); text($('.about-preview__text'), safeCopy(bio.body)); var story = $('.about-content'); if (story) { var first = $('p', story); if (first) first.textContent = safeCopy(bio.body); } }
    if (bio.photo_url) { var photo = safeUrl(bio.photo_url); var wrap = $('.profile-photo'); if (wrap) { wrap.style.backgroundImage = 'url("' + photo.replace(/"/g, '') + '")'; wrap.style.backgroundSize = 'cover'; wrap.style.backgroundPosition = 'center'; } var img = $('.about-avatar img'); if (img) img.src = photo; }
    var projects = data.projects || []; var featured = projects.filter(function (p) { return p.is_featured; }); if (!featured.length) featured = projects.slice(0, 3);
    var homeGrid = $('.featured-projects__grid'); if (homeGrid && featured.length) { homeGrid.replaceChildren(); featured.slice(0, 3).forEach(function (p, i) { homeGrid.appendChild(makeProject(p, i)); }); }
    var projectGrid = $('.projects-full-grid'); if (projectGrid && projects.length) { projectGrid.replaceChildren(); projects.forEach(function (p, i) { projectGrid.appendChild(makeProject(p, i)); }); }
    document.dispatchEvent(new CustomEvent('projects:updated'));
    renderServices(data.services || []); renderSkills(data.skills || []); renderExperience(data.experience || []); renderSocial(data.social_links || [], data.settings || {}); renderNavigation(data.navigation || []);
    (data.homepage_sections || []).forEach(function (section) { var root = $('[data-cms-section="' + String(section.key).replace(/[^a-z0-9_-]/gi, '') + '"]'); if (!root) return; var heading = $('[data-cms-title]', root); var body = $('[data-cms-body]', root); text(heading, safeCopy(section.title)); text(body, safeCopy(section.body)); });
    var settings = data.settings || {}; if (settings.site_title) document.title = safeCopy(settings.site_title); applySettings(settings); renderTestimonials(data.testimonials || []);
  }
  function init() { fetch(base + '/api/content', { headers: { Accept: 'application/json' } }).then(function (r) { if (!r.ok) throw new Error('CMS unavailable'); return r.json(); }).then(function (j) { if (j && j.data) apply(j.data); }).catch(function () { /* original static content remains as offline fallback */ }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

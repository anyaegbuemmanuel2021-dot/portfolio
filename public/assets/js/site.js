/* Platform glue for the public site: API client, privacy-friendly analytics, ad slots, newsletter. No secrets live here. */
(function () {
  'use strict';
  var BASE = (window.PORTFOLIO_API_BASE || '').replace(/\/$/, '');
  var API = {
    base: BASE,
    get: function (p) { return fetch(BASE + p, { headers: { Accept: 'application/json' } }).then(parse); },
    post: function (p, body) { return fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(parse); },
    submitContact: function (d) { return API.post('/api/contacts', d); },
    subscribe: function (email) { return API.post('/api/email/subscribe', { email: email }); }
  };
  function parse(r) { return r.json().catch(function () { return { ok: false, error: { message: 'Bad response' } }; }).then(function (j) { if (!r.ok || j.ok === false) { var e = new Error((j.error && j.error.message) || 'Request failed'); e.status = r.status; e.details = j.error && j.error.details; throw e; } return j; }); }
  window.PortfolioAPI = API;

  // Admin-controlled page visibility. Pages remain enabled unless explicitly switched off.
  function applyPageVisibility(settings) {
    var page = (document.body && document.body.getAttribute('data-page')) || '';
    if (!page) return;
    var key = 'page_' + page + '_visible';
    if (settings && settings[key] === 'false') {
      var main = document.querySelector('main') || document.querySelector('[role="main"]');
      if (main) { main.hidden = true; main.setAttribute('aria-hidden', 'true'); }
      document.querySelectorAll('a[href]').forEach(function (a) {
        try { var p = new URL(a.href, location.origin).pathname.replace(/\/$/, ''); if (p === location.pathname.replace(/\/$/, '') || (page === 'home' && (p === '/' || p === '/index.html'))) { a.hidden = true; a.setAttribute('aria-hidden', 'true'); } } catch (e) {}
      });
      document.title = 'Page temporarily unavailable';
    }
  }
  API.get('/api/content').then(function (r) { applyPageVisibility(r.data && r.data.settings || {}); }).catch(function () {});

  // Privacy-conscious attribution and activity analytics. No raw IP, full URL query, form values or fingerprinting are stored.
  function readAttribution() {
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var current = {}, params = new URLSearchParams(location.search), hasUtm = false;
    keys.forEach(function (key) { var value = params.get(key); if (value) { current[key] = value.slice(0, 120); hasUtm = true; } });
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('portfolio_attribution') || 'null'); } catch (e) {}
    if (hasUtm) {
      try { sessionStorage.setItem('portfolio_attribution', JSON.stringify(current)); } catch (e) {}
      return current;
    }
    if (saved && typeof saved === 'object') return saved;
    try {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.hostname && ref.hostname.replace(/^www\./, '') !== location.hostname.replace(/^www\./, '')) {
        current.utm_source = ref.hostname.replace(/^www\./, '').slice(0, 100);
        current.utm_medium = 'referral';
        sessionStorage.setItem('portfolio_attribution', JSON.stringify(current));
      }
    } catch (e) {}
    return current;
  }
  var attribution = readAttribution();
  function beacon(payload) {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    payload.attribution = attribution;
    try { fetch(BASE + '/api/analytics/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(function () {}); } catch (e) {}
  }
  function activity(eventName, category, label, refId) {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    try {
      fetch(BASE + '/api/analytics/activity', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: location.pathname || '/', event: eventName, category: category, label: String(label || '').slice(0, 100), ref_id: String(refId || '').slice(0, 160), attribution: attribution }) }).catch(function () {});
    } catch (e) {}
  }
  function pagePath() { var p = location.pathname || '/'; return p === '/' ? '/index.html' : p; }
  var slugMatch = location.pathname.match(/^\/articles\/([^/]+)\/?$/);
  beacon({ path: pagePath(), referrer: document.referrer || '', type: slugMatch ? 'article' : 'page', slug: slugMatch ? decodeURIComponent(slugMatch[1]) : undefined });
  document.addEventListener('click', function (e) {
    var target = e.target.closest && e.target.closest('a[href],button[data-analytics-event]');
    if (!target) return;
    var href = target.getAttribute('href') || '', label = target.getAttribute('aria-label') || target.getAttribute('title') || (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (target.matches('button[data-analytics-event]')) {
      activity(target.getAttribute('data-analytics-event') || 'cta_click', target.getAttribute('data-analytics-category') || 'cta', label, '');
      return;
    }
    var lower = href.toLowerCase(), eventName = null, category = 'link', refId = '';
    if (/^(mailto:|tel:)|wa\.me|whatsapp\.com/.test(lower)) { eventName = 'contact_click'; category = 'contact'; }
    else if (target.hasAttribute('download') || /\.(pdf|docx?|xlsx?|zip)(?:[?#]|$)/i.test(lower)) { eventName = 'download_click'; category = 'download'; }
    else {
      try {
        var url = new URL(href, location.href);
        if (url.hostname && url.hostname !== location.hostname) { eventName = 'outbound_click'; category = 'outbound'; refId = url.origin + url.pathname; }
      } catch (err) {}
    }
    if (eventName) activity(eventName, category, label, refId);
    var m = href.match(/projects\/([a-z0-9-]+)\/(?:index\.html)?$/i);
    if (m) beacon({ path: '/projects/' + m[1], type: 'project', slug: m[1] });
  }, { passive: true });
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.matches('.contact-form form')) activity('contact_click', 'contact_form', 'Contact form submitted', '');
  }, { passive: true });


  // Site-wide share panel: creates a distinct UTM-tagged URL for each sharing channel.
  function trackedShareUrl(source, medium) {
    var u = new URL(location.pathname || '/', location.origin);
    var page = u.pathname.split('/').filter(Boolean).join('_').replace(/\\.html?$/i, '') || 'home';
    u.searchParams.set('utm_source', String(source || 'share').slice(0, 100));
    u.searchParams.set('utm_medium', String(medium || 'referral').slice(0, 100));
    u.searchParams.set('utm_campaign', 'portfolio_share');
    u.searchParams.set('utm_content', page.slice(0, 100));
    return u.toString();
  }
  // Shared helper used by page-specific share controls as well as the global share panel.
  window.PortfolioShare = window.PortfolioShare || {};
  window.PortfolioShare.trackedUrl = trackedShareUrl;
  window.PortfolioShare.track = activity;
  function buildSharePanel() {
    if (document.querySelector('[data-portfolio-share]')) return;
    var wrap = document.createElement('div'); wrap.setAttribute('data-portfolio-share', '');
    wrap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9998;font:500 14px Outfit,Arial,sans-serif;';
    var toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Share page';
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'portfolioSharePanel');
    toggle.style.cssText = 'border:1px solid rgba(200,169,110,.55);border-radius:999px;background:#151515;color:#fff;padding:12px 18px;box-shadow:0 8px 28px rgba(0,0,0,.25);cursor:pointer;';
    var panel = document.createElement('div'); panel.id = 'portfolioSharePanel'; panel.hidden = true;
    panel.style.cssText = 'width:min(290px,calc(100vw - 36px));margin-bottom:10px;padding:14px;background:#151515;color:#fff;border:1px solid rgba(200,169,110,.4);border-radius:14px;box-shadow:0 12px 35px rgba(0,0,0,.3);';
    var heading = document.createElement('strong'); heading.textContent = 'Share this page'; heading.style.display = 'block'; heading.style.marginBottom = '10px'; panel.appendChild(heading);
    var actions = [
      ['Copy tracked link', function () {
        var url = trackedShareUrl('copy_link', 'referral');
        var done = function () { toggle.textContent = 'Link copied'; setTimeout(function () { toggle.textContent = 'Share page'; }, 1800); activity('copy_link', 'share', 'Copied tracked page link', location.pathname); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(function () { window.prompt('Copy this tracked link:', url); });
        else window.prompt('Copy this tracked link:', url);
      }],
      ['WhatsApp', function () { var u = trackedShareUrl('whatsapp', 'social'); activity('share_click','share','Shared via WhatsApp',u); window.open('https://wa.me/?text='+encodeURIComponent('I thought you might find this useful: '+u),'_blank','noopener'); }],
      ['Facebook', function () { var u = trackedShareUrl('facebook', 'social'); activity('share_click','share','Shared via Facebook',u); window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(u),'_blank','noopener'); }],
      ['LinkedIn', function () { var u = trackedShareUrl('linkedin', 'social'); activity('share_click','share','Shared via LinkedIn',u); window.open('https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(u),'_blank','noopener'); }],
      ['Email', function () { var u = trackedShareUrl('email', 'email'); activity('share_click','share','Shared via email',u); location.href='mailto:?subject='+encodeURIComponent(document.title)+'&body='+encodeURIComponent('I thought you might find this useful: '+u); }]
    ];
    if (navigator.share) actions.push(['More sharing options', function () { var u=trackedShareUrl('share', 'referral'); activity('share_click','share','Used device share sheet',u); navigator.share({title:document.title,url:u}).catch(function(){}); }]);
    actions.forEach(function (item) {
      var b = document.createElement('button'); b.type='button'; b.textContent=item[0];
      b.style.cssText='display:block;width:100%;text-align:left;margin:5px 0;padding:10px 11px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#222;color:#fff;cursor:pointer;';
      b.addEventListener('click',item[1]); panel.appendChild(b);
    });
    toggle.addEventListener('click',function(){ panel.hidden=!panel.hidden; toggle.setAttribute('aria-expanded',String(!panel.hidden)); });
    document.addEventListener('click',function(e){ if(!wrap.contains(e.target) && !panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');} });
    wrap.appendChild(panel); wrap.appendChild(toggle); document.body.appendChild(wrap);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSharePanel); else buildSharePanel();

  // Mobile theme toggle (idea borrowed from the "spacing" version, without its fixed-width viewport): the desktop toggle is hidden on phones.
  document.addEventListener('DOMContentLoaded', function () {
    var mm = document.querySelector('.nav__mobile'), tt = document.getElementById('themeToggle');
    if (mm && tt && !mm.querySelector('[data-theme-mobile]')) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost'; b.setAttribute('data-theme-mobile', ''); b.textContent = 'Switch light / dark'; b.addEventListener('click', function () { tt.click(); }); mm.appendChild(b); }
  });

  // Ad slots: <div data-ad-slot="home"></div>. Self-managed ads first; AdSense only when enabled in the admin.
  function renderAds() {
    var slots = document.querySelectorAll('[data-ad-slot]'); if (!slots.length) return;
    API.get('/api/content').then(function (c) {
      var cfg = (c.data && c.data.ads) || {}; slots.forEach(function (el) {
        API.get('/api/advertisements/serve?placement=' + encodeURIComponent(el.getAttribute('data-ad-slot'))).then(function (r) {
          var ad = r.data; if (ad && cfg.self_managed_enabled !== false) {
            var a = document.createElement('a'); a.href = BASE + ad.click_url; a.rel = 'sponsored noopener'; a.target = '_blank'; a.className = 'ad-slot__link';
            if (ad.image_url) { var img = document.createElement('img'); img.src = ad.image_url; img.alt = ad.alt || ad.title; img.loading = 'lazy'; img.decoding = 'async'; a.appendChild(img); } else a.textContent = ad.title;
            var tag = document.createElement('span'); tag.className = 'ad-slot__tag'; tag.textContent = 'Sponsored'; el.textContent = ''; el.appendChild(tag); el.appendChild(a); el.hidden = false;
          } else if (cfg.adsense && cfg.adsense.enabled && cfg.adsense.client && !el.hasAttribute('data-ad-self-only')) loadAdsense(el, cfg.adsense.client);
        }).catch(function () {});
      });
    }).catch(function () {});
  }
  var adsenseLoaded = false;
  function loadAdsense(el, client) { // Requires visitor consent where applicable (EU/UK etc.); see docs/ADS.md
    if (localStorage.getItem('ads_consent') !== 'granted') return;
    if (!adsenseLoaded) { adsenseLoaded = true; var s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous'; s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client); document.head.appendChild(s); }
    var ins = document.createElement('ins'); ins.className = 'adsbygoogle'; ins.style.display = 'block'; ins.setAttribute('data-ad-client', client); ins.setAttribute('data-ad-format', 'auto'); ins.setAttribute('data-full-width-responsive', 'true'); el.textContent = ''; el.appendChild(ins); el.hidden = false;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAds); else renderAds();
})();

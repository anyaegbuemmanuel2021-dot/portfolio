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

  // Analytics: no cookies, no raw IPs stored server-side, honours Do Not Track / Global Privacy Control.
  function beacon(payload) {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    try { fetch(BASE + '/api/analytics/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(function () {}); } catch (e) {}
  }
  function pagePath() { var p = location.pathname || '/'; return p === '/' ? '/index.html' : p; }
  var slugMatch = location.pathname.match(/^\/articles\/([^/]+)\/?$/);
  beacon({ path: pagePath(), referrer: document.referrer || '', type: slugMatch ? 'article' : 'page', slug: slugMatch ? decodeURIComponent(slugMatch[1]) : undefined });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var m = (a.getAttribute('href') || '').match(/projects\/([a-z0-9-]+)\/(?:index\.html)?$/i); if (m) beacon({ path: '/projects/' + m[1], type: 'project', slug: m[1] });
  }, { passive: true });

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

/* Article listing + single article rendering. Content HTML comes from the server's escaped-Markdown renderer. */
(function () {
  'use strict';
  var API = window.PortfolioAPI; var $ = function (s) { return document.querySelector(s); };
  if (!API || typeof API.get !== 'function') { console.error('Articles: PortfolioAPI is unavailable. Ensure site.js loads before articles.js.'); return; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var fmt = function (d) { try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  function setMeta(name, content, prop) { if (!content) return; var sel = prop ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]'; var m = document.head.querySelector(sel); if (!m) { m = document.createElement('meta'); m.setAttribute(prop ? 'property' : 'name', name); document.head.appendChild(m); } m.setAttribute('content', content); }
  function safeImg(u) { if (typeof u !== 'string' || !u.trim()) return ''; u = u.trim(); if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('//') || u.startsWith('/') || u.startsWith('data:image/')) return u; if (u.startsWith('uploads/') || u.startsWith('./uploads/')) return '/' + (u.startsWith('./') ? u.slice(2) : u); return ''; }
  function attachImage(img, url) {
    var attempts = 0; var delays = [500, 1500, 3500];
    function load() {
      var next = url;
      if (/^\/api\/media\/file\?/.test(url)) next += (url.indexOf('?') >= 0 ? '&' : '?') + 'retry=' + attempts;
      img.src = next;
    }
    img.onerror = function () {
      if (attempts >= delays.length) return;
      var wait = delays[attempts++]; setTimeout(load, wait);
    };
    load();
  }

  var list = $('#articleList');
  if (list) {
    var state = { page: 1, q: '', category: '' };
    var load = function () {
      list.setAttribute('aria-busy', 'true');
      if (!list.firstChild) list.appendChild(el('p', 'article-card__excerpt', 'Loading published articles…'));
      var qs = '?page=' + state.page + '&limit=9' + (state.q ? '&q=' + encodeURIComponent(state.q) : '') + (state.category ? '&category=' + encodeURIComponent(state.category) : '');
      API.get('/api/articles' + qs).then(function (r) {
        if (!r || !Array.isArray(r.data) || !r.meta) throw new Error('The article service returned an invalid response.');
        list.textContent = '';
        r.data.forEach(function (a) {
          var c = el('a', 'article-card'); c.href = '/articles/' + encodeURIComponent(a.slug);
          if (safeImg(a.featured_image_url)) { var i = el('img', 'article-card__img'); attachImage(i, a.featured_image_url); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; c.appendChild(i); }
          var b = el('div', 'article-card__body'); b.appendChild(el('div', 'article-card__meta', [a.category_name, fmt(a.published_at), 'By ' + (a.author_name || 'Anyaegbu Emmanuel Ikenna')].filter(Boolean).join(' · ')));
          b.appendChild(el('h2', 'article-card__title', a.title)); if (a.excerpt) b.appendChild(el('p', 'article-card__excerpt', a.excerpt)); c.appendChild(b); list.appendChild(c);
        });
        var pg = $('#pager'); pg.textContent = ''; var pages = Math.ceil(r.meta.total / r.meta.limit);
        if (pages > 1) { var prev = el('button', 'btn btn--ghost btn--sm', '← Newer'), next = el('button', 'btn btn--ghost btn--sm', 'Older →'); prev.disabled = state.page <= 1; next.disabled = state.page >= pages; prev.onclick = function () { state.page--; load(); }; next.onclick = function () { state.page++; load(); }; pg.append(prev, el('span', 'article-card__meta', 'Page ' + state.page + ' / ' + pages), next); }
      }).catch(function (error) { list.textContent = ''; var empty = el('div', 'article-empty'); empty.appendChild(el('h2', 'article-card__title', 'Articles could not load')); empty.appendChild(el('p', 'article-card__excerpt', error && error.message ? error.message : 'The article service is temporarily unavailable. Please try again.')); var retry = el('button', 'btn btn--primary btn--sm', 'Try again'); retry.type = 'button'; retry.addEventListener('click', load); empty.appendChild(retry); list.appendChild(empty); }).then(function () { list.removeAttribute('aria-busy'); });
    };
    var t; $('#articleSearch').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { state.q = e.target.value.trim(); state.page = 1; load(); }, 300); });
    API.get('/api/articles/categories').then(function (r) { var s = $('#articleCategory'); r.data.forEach(function (c) { var o = el('option', '', c.name); o.value = c.slug; s.appendChild(o); }); }).catch(function () {});
    $('#articleCategory').addEventListener('change', function (e) { state.category = e.target.value; state.page = 1; load(); });
    load();
  }


  var externalList = $('#externalFeedList');
  if (externalList) {
    function showExternalMessage(message, retry) {
      externalList.textContent = '';
      var note = el('p', 'external-feed__status', message);
      externalList.appendChild(note);
      if (retry) {
        var button = el('button', 'btn btn--ghost btn--sm', 'Try again');
        button.type = 'button';
        button.addEventListener('click', loadExternalFeeds);
        externalList.appendChild(button);
      }
    }

    function loadExternalFeeds() {
      externalList.setAttribute('aria-busy', 'true');
      API.get('/api/feeds').then(function (response) {
        var data = response && response.data ? response.data : {};
        var items = Array.isArray(data.items) ? data.items : [];
        externalList.textContent = '';

        if (data.stale && data.warning) {
          externalList.appendChild(el('p', 'external-feed__status', data.warning));
        } else if (Array.isArray(data.sources) && data.sources.length) {
          var available = data.sources.filter(function (source) { return source.status === 'ok'; }).length;
          if (available < data.sources.length) {
            externalList.appendChild(el('p', 'external-feed__status', 'Some publications are temporarily unavailable. Showing the latest articles that could be retrieved.'));
          }
        }

        items.forEach(function (item) {
          var card = el('article', 'external-feed__card');
          var imageUrl = safeImg(item.image);
          if (imageUrl) {
            var image = el('img', 'external-feed__image');
            image.src = imageUrl;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.referrerPolicy = 'no-referrer';
            image.onerror = function () { image.remove(); };
            card.appendChild(image);
          }
          var body = el('div', 'external-feed__body');
          body.appendChild(el('div', 'article-card__meta', [item.source, item.category, fmt(item.published_at)].filter(Boolean).join(' · ')));
          var title = el('h3', 'external-feed__title', item.title);
          var link = el('a', 'external-feed__link');
          link.href = item.link;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.appendChild(title);
          body.appendChild(link);
          if (item.description) body.appendChild(el('p', 'article-card__excerpt', item.description));
          var read = el('a', 'external-feed__read', 'Read at ' + item.source + ' ↗');
          read.href = item.link;
          read.target = '_blank';
          read.rel = 'noopener noreferrer';
          body.appendChild(read);
          card.appendChild(body);
          externalList.appendChild(card);
        });

        if (!items.length) {
          showExternalMessage('External publications are temporarily unavailable. Your own published articles and RSS subscription are still available above.', true);
        }
      }).catch(function () {
        showExternalMessage('External publications could not be reached. Your own published articles and RSS subscription are still available above.', true);
      }).then(function () {
        externalList.removeAttribute('aria-busy');
      });
    }

    loadExternalFeeds();
  }

  var box = $('#articleView');
  if (box) {
    var slug = decodeURIComponent(location.pathname.replace(/\/$/, '').split('/').pop());
    API.get('/api/articles/' + encodeURIComponent(slug)).then(function (r) {
      var a = r.data; document.title = (a.seo_title || a.title) + ' — Anyaegbu Emmanuel';
      setMeta('description', a.seo_description || a.excerpt); setMeta('og:title', a.seo_title || a.title, 1); setMeta('og:description', a.seo_description || a.excerpt, 1); setMeta('og:type', 'article', 1); if (safeImg(a.featured_image_url)) setMeta('og:image', a.featured_image_url, 1);
      var link = document.head.querySelector('link[rel=canonical]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' })); link.href = a.canonical_url || link.href || location.origin + '/articles/' + a.slug;
      box.textContent = ''; box.appendChild(el('h1', 'article__title', a.title)); box.appendChild(el('div', 'article__meta', [fmt(a.published_at), a.category_name, 'By ' + (a.author_name || 'Anyaegbu Emmanuel Ikenna')].filter(Boolean).join(' · ')));
      if (safeImg(a.featured_image_url)) { var h = el('img', 'article__hero'); attachImage(h, a.featured_image_url); h.alt = ''; box.appendChild(h); }
      var body = el('div', 'article__body'); body.innerHTML = a.content_html; Array.prototype.forEach.call(body.querySelectorAll('img'), function (img) { var src = img.getAttribute('src') || ''; if (/^\/api\/media\/file\?/.test(src)) { img.removeAttribute('src'); attachImage(img, src); } }); box.appendChild(body); // server-rendered from escaped Markdown (no raw HTML possible)
      var ad = el('div', 'ad-slot'); ad.hidden = true; ad.setAttribute('data-ad-slot', 'article'); box.appendChild(ad);
      if (a.tags && a.tags.length) { var tg = el('div', 'article__tags'); a.tags.forEach(function (x) { tg.appendChild(el('span', 'article__tag', '#' + x.name)); }); box.appendChild(tg); }
      var sh = el('div', 'article__share');
      var trackedCopyUrl = window.PortfolioShare && window.PortfolioShare.trackedUrl ? window.PortfolioShare.trackedUrl('copy_link', 'referral') : location.origin + location.pathname + '?utm_source=copy_link&utm_medium=referral&utm_campaign=portfolio_share';
      var cp = el('button', 'btn btn--ghost btn--sm', 'Copy tracked link'); cp.type = 'button'; cp.onclick = function () {
        var copied = function () { cp.textContent = 'Link copied ✓'; if (window.PortfolioShare && window.PortfolioShare.track) window.PortfolioShare.track('copy_link', 'share', 'Copied tracked article link', location.pathname); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(trackedCopyUrl).then(copied).catch(function () { window.prompt('Copy this tracked link:', trackedCopyUrl); });
        else window.prompt('Copy this tracked link:', trackedCopyUrl);
      };
      var wa = el('a', 'btn btn--ghost btn--sm', 'Share on WhatsApp'); wa.target = '_blank'; wa.rel = 'noopener';
      var trackedWhatsAppUrl = window.PortfolioShare && window.PortfolioShare.trackedUrl ? window.PortfolioShare.trackedUrl('whatsapp', 'social') : trackedCopyUrl;
      wa.href = 'https://wa.me/?text=' + encodeURIComponent(a.title + ' ' + trackedWhatsAppUrl);
      wa.addEventListener('click', function () { if (window.PortfolioShare && window.PortfolioShare.track) window.PortfolioShare.track('share_click', 'share', 'Shared article via WhatsApp', trackedWhatsAppUrl); });
      sh.append(cp, wa); box.appendChild(sh);
      var s = document.createElement('script'); s.src = '/assets/js/site.js'; document.body.appendChild(s); // re-run ad slot render for dynamically added slot
    }).catch(function (e) { box.textContent = ''; box.appendChild(el('h1', 'article__title', e.status === 404 ? 'Article not found' : 'Unable to load article')); box.appendChild(el('p', 'article__body', 'It may have been unpublished or moved.')); var b = el('a', 'btn btn--primary', 'Back to articles'); b.href = '/articles'; box.appendChild(b); });
  }
})();

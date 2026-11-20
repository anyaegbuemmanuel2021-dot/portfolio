/* AEI Portfolio PWA service worker. Never cache admin, API, auth or private responses. */
'use strict';
const VERSION = 'aei-pwa-v12';
const APP_CACHE = VERSION + '-app';
const ASSET_CACHE = VERSION + '-assets';
const CORE_PAGES = ['/index.html', '/about.html', '/projects.html', '/services.html', '/contact.html', '/articles.html', '/article.html', '/manifest.webmanifest', '/offline.html'];
const CORE_ASSETS = ['/assets/css/global.css', '/assets/css/animations.css', '/assets/css/home.css', '/assets/css/about.css', '/assets/css/platform.css', '/assets/js/main.js', '/assets/js/cms.js', '/assets/js/site.js', '/assets/js/articles.js', '/assets/js/emoji-icons.js', '/assets/icons/app-icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const pages = await caches.open(APP_CACHE);
    await pages.addAll(CORE_PAGES);
    const assets = await caches.open(ASSET_CACHE);
    await assets.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => ![APP_CACHE, ASSET_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/auth')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(APP_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fallback = await caches.match('/offline.html');
        return fallback || new Response('You are offline. Reconnect and try again.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'image' || request.destination === 'font' || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        return response;
      } catch {
        return cached || Response.error();
      }
    })());
  }
});
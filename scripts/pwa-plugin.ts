import { createHash } from "node:crypto";
import type { Plugin } from "vite";
// Enumerate the actual production client bundle, including dynamically loaded chunks.
export function offlinePlugin(): Plugin {
  return {
    name: "meu-corredor-offline",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const assets = Object.keys(bundle)
        .filter((p) => /\.(js|css)$/.test(p))
        .map((p) => "/" + p);
      const required = [
        "/",
        "/manifest.webmanifest",
        "/icon.svg",
        "/icon-192.png",
        "/icon-512.png",
        ...assets,
      ];
      const version = createHash("sha256")
        .update(JSON.stringify(bundle))
        .digest("hex")
        .slice(0, 16);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
var CACHE = 'meu-corredor-shell-${version}';
var REQUIRED = ${JSON.stringify(required)};
self.addEventListener('install', function(event) {
  event.waitUntil(caches.open(CACHE).then(function(cache) {
    return cache.addAll(REQUIRED.map(function(url) { return new Request(url, {cache: 'reload'}); }));
  }).catch(function(error) { return caches.delete(CACHE).then(function() { throw error; }); }));
});
// Updates wait for all old windows to close. No skipWaiting or forced reload.
self.addEventListener('activate', function(event) {
  event.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(key) { return key.indexOf('meu-corredor-shell-') === 0 && key !== CACHE; }).map(function(key) { return caches.delete(key); }));
  }).then(function() { return self.clients.claim(); }));
});
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Serve the matching cached document and assets together, online and offline.
  if (event.request.mode === 'navigate' && new URL(event.request.url).pathname === '/') {
    event.respondWith(caches.open(CACHE).then(function(cache) { return cache.match('/'); }).then(function(r) { return r || fetch(event.request); })); return;
  }
  event.respondWith(caches.open(CACHE).then(function(cache) { return cache.match(event.request); }).then(function(r) { return r || fetch(event.request); }));
});
self.addEventListener('message', function(event) {
  if (!event.data || event.data.type !== 'CHECK_OFFLINE' || !event.ports[0]) return;
  event.waitUntil(caches.open(CACHE).then(function(cache) {
    return Promise.all(REQUIRED.map(function(url) { return cache.match(url).then(function(response) { return !!response && response.ok; }); }));
  }).then(function(results) { event.ports[0].postMessage({ ready: results.every(Boolean), version: CACHE }); })
    .catch(function() { event.ports[0].postMessage({ ready: false }); }));
});
`,
      });
    },
  };
}

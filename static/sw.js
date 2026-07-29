/* Service worker: immutable caching for fingerprinted assets.
 *
 * __VERSION__ and __MANIFEST__ are injected by scripts/fingerprint.mjs
 * at build time. The manifest is embedded (not fetched) so that any
 * release changes the bytes of this file, which is what triggers the
 * browser to install the new worker and run the cleanup in activate.
 *
 * Strategy:
 *   - manifest assets (content-hashed names): cache-first; most are
 *     precached at install, big lazy ones (PRECACHE excludes them,
 *     e.g. the Webamp bundle) are cached on first use; a hashed URL
 *     never changes content, so no revalidation either way
 *   - versioned Pyodide CDN files: cache-first at runtime (URL contains
 *     the version, so it's immutable too; cached only once actually used)
 *   - HTML and everything else: network-first with cache fallback, so
 *     pages stay fresh within GitHub Pages' 10-minute cache but still
 *     load offline / during hiccups
 */

var VERSION = "__VERSION__";
var STATIC_CACHE = "mf-static-" + VERSION;
var PAGES_CACHE = "mf-pages-" + VERSION;
var RUNTIME_CACHE = "mf-pyodide-v1"; /* survives releases; URL-versioned */

var MANIFEST = __MANIFEST__;
var PRECACHE = __PRECACHE__;

var PYODIDE_RE = /^https:\/\/cdn\.jsdelivr\.net\/pyodide\/v[\d.]+\//;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(function (cache) {
        return cache.addAll(PRECACHE);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        /* Release cleanup: drop caches from previous versions. */
        return Promise.all(
          keys
            .filter(function (key) {
              return (
                key !== STATIC_CACHE && key !== PAGES_CACHE && key !== RUNTIME_CACHE
              );
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function cacheFirst(event, cacheName) {
  event.respondWith(
    caches.open(cacheName).then(function (cache) {
      return cache.match(event.request).then(function (hit) {
        if (hit) return hit;
        return fetch(event.request).then(function (res) {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        });
      });
    })
  );
}

function networkFirst(event) {
  event.respondWith(
    caches.open(PAGES_CACHE).then(function (cache) {
      return fetch(event.request)
        .then(function (res) {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(function () {
          return cache.match(event.request).then(function (hit) {
            if (hit) return hit;
            throw new Error("offline and not cached");
          });
        });
    })
  );
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);

  /* Never SW-cache the web app manifest: browsers read it for
     installed-app identity and update checks, and a stale copy can pin
     fingerprinted icon URLs from a purged release or block manifest
     updates entirely. Let it go straight to the network / HTTP cache. */
  if (req.destination === "manifest" || url.pathname === "/site.webmanifest") {
    return;
  }

  if (url.origin === self.location.origin) {
    if (MANIFEST.indexOf(url.pathname) !== -1) {
      cacheFirst(event, STATIC_CACHE); /* immutable */
    } else {
      networkFirst(event);
    }
    return;
  }

  if (PYODIDE_RE.test(req.url)) {
    cacheFirst(event, RUNTIME_CACHE); /* URL-versioned, immutable */
  }
  /* other cross-origin requests: let the browser handle them */
});

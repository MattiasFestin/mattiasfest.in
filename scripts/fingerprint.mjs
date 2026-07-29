#!/usr/bin/env node
/**
 * Build-time asset fingerprinting + service worker manifest.
 * Runs after optimize.mjs, on public/ only (never in dev):
 *
 *   1. Renames static assets to <name>.<8-char-sha256>.<ext>.
 *      Processed in dependency order (leaves first) so that files
 *      referencing other assets are hashed *after* their references
 *      have been rewritten to the fingerprinted names.
 *   2. Rewrites references in HTML, CSS and JS. Plain-text
 *      replacement of absolute URL paths, longest path first, so
 *      "/98/ms_sans_serif.woff" can't clobber the .woff2 reference.
 *   3. Injects the manifest (list of hashed URLs + a version derived
 *      from all content hashes) into sw.js. The manifest lives inside
 *      sw.js on purpose: browsers byte-compare the worker script, so
 *      any content change -> new sw.js -> install/activate -> old
 *      caches deleted.
 *
 * GitHub Pages serves everything with max-age=600; the service worker
 * gives fingerprinted assets an effectively immutable cache instead.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_DIR = new URL("../public", import.meta.url).pathname;

/* Assets to fingerprint, as absolute URL paths, in dependency order:
   each tier may be referenced by later tiers, never the reverse. */
const TIERS = [
  /* leaves: fonts, images, cursors (referenced by CSS/HTML) */
  [
    "/98/ms_sans_serif.woff2",
    "/98/ms_sans_serif.woff",
    "/98/ms_sans_serif_bold.woff2",
    "/98/ms_sans_serif_bold.woff",
    "/temml/Temml.woff2",
    "/icons/sprite.png",
    "/favicon.png",
    "/cursors/arrow.png",
    "/cursors/arrow@2x.png",
    "/cursors/hand.png",
    "/cursors/hand@2x.png",
    "/cursors/wait.png",
    "/cursors/wait@2x.png",
    "/icons/app-192.png",
    "/icons/app-512.png",
    "/icons/app-maskable-192.png",
    "/icons/app-maskable-512.png",
  ],
  /* worker: referenced by editor.js */
  ["/pyworker.js"],
  /* webamp bundle: referenced by winamp.js */
  ["/webamp/webamp.bundle.min.js"],
  /* lazy apps: referenced by main.js / HTML data attributes */
  ["/editor.js", "/browser.js", "/winamp.js"],
  /* entry points: referenced by HTML only */
  ["/bundle.css", "/main.js"],
];

/* Fingerprinted (immutable, cache-first once fetched) but NOT precached
   by the service worker: nobody should download ~900 KB of Webamp in
   the background for a Winamp they may never open. */
const NO_PRECACHE = new Set(["/webamp/webamp.bundle.min.js"]);

const shortHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);

const hashedUrl = (url, hash) => {
  const i = url.lastIndexOf(".");
  return `${url.slice(0, i)}.${hash}${url.slice(i)}`;
};

/** Every HTML/CSS/JS/XML/manifest file in public/ that may hold references. */
function textFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...textFiles(path));
    else if (/\.(html|css|js|xml|webmanifest)$/.test(entry)) out.push(path);
  }
  return out;
}

const manifest = {}; /* original URL -> hashed URL */

for (const tier of TIERS) {
  /* Hash this tier's files (their own references are already rewritten). */
  const renames = [];
  for (const url of tier) {
    const path = join(PUBLIC_DIR, url);
    const hash = shortHash(readFileSync(path));
    const newUrl = hashedUrl(url, hash);
    manifest[url] = newUrl;
    renames.push([path, join(PUBLIC_DIR, newUrl)]);
  }
  for (const [from, to] of renames) renameSync(from, to);

  /* Rewrite references to this tier everywhere, longest path first. */
  const pairs = tier
    .map((url) => [url, manifest[url]])
    .sort((a, b) => b[0].length - a[0].length);
  for (const file of textFiles(PUBLIC_DIR)) {
    const src = readFileSync(file, "utf8");
    let out = src;
    for (const [from, to] of pairs) out = out.split(from).join(to);
    if (out !== src) writeFileSync(file, out);
  }
}

/* Version = hash of all content hashes: changes iff any asset changes. */
const version = shortHash(Object.values(manifest).sort().join("\n"));

const precache = Object.entries(manifest)
  .filter(([url]) => !NO_PRECACHE.has(url))
  .map(([, hashed]) => hashed);

const swPath = join(PUBLIC_DIR, "sw.js");
const sw = readFileSync(swPath, "utf8")
  .replace("__VERSION__", version)
  .replace("__MANIFEST__", JSON.stringify(Object.values(manifest)))
  .replace("__PRECACHE__", JSON.stringify(precache));
writeFileSync(swPath, sw);

console.log(`✓ fingerprinted ${Object.keys(manifest).length} assets (release ${version})`);

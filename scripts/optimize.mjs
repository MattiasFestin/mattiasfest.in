#!/usr/bin/env node
/**
 * Post-build asset optimization. Runs after `zola build` on public/:
 *
 *   1. CSS: concatenates 98.css + Temml-Local.css + site.css into a
 *      single minified public/bundle.css (relative url()s are rewritten
 *      to absolute paths so fonts keep resolving from their own folders),
 *      and rewrites the three <link> tags in every HTML file to one
 *      bundle.css link. Templates reference the source stylesheets so
 *      plain `zola serve` works without this step.
 *   2. JS: minifies main.js, editor.js and pyworker.js in place.
 *
 * Templates reference bundle.css / main.js directly; editor.js is
 * lazy-loaded by main.js when the Python editor is first opened.
 */

import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { transform } from "esbuild";

const PUBLIC_DIR = new URL("../public", import.meta.url).pathname;

/* Source stylesheets in cascade order, with their public URL directory
   (used to rebase relative url() references). */
const CSS_SOURCES = [
  { file: "98/98.css", urlDir: "/98/" },
  { file: "temml/Temml-Local.css", urlDir: "/temml/" },
  { file: "site.css", urlDir: "/" },
];

const JS_FILES = [
  "main.js",
  "editor.js",
  "pyworker.js",
  "browser.js",
  "winamp.js",
  "screensaver.js",
  "clippy.js",
  "find.js",
  "sw.js",
];

/** Rewrite relative url(...) references to absolute paths. */
function rebaseUrls(css, urlDir) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, ref) => {
    if (/^(data:|https?:|\/\/|\/|#|%23)/.test(ref)) return match;
    return `url(${quote}${posix.join(urlDir, ref)}${quote})`;
  });
}

async function bundleCss() {
  let out = "";
  for (const { file, urlDir } of CSS_SOURCES) {
    const path = join(PUBLIC_DIR, file);
    /* Zola's Sass compiler prefixes a UTF-8 BOM whenever the compiled
       CSS contains non-ASCII (a \25b2 escape resolved to "▲", say).
       Harmless at the top of its own file, fatal in the middle of a
       concatenation: the BOM glues itself to the next selector and
       silently drops that rule. */
    out += rebaseUrls(readFileSync(path, "utf8").replace(/^\uFEFF/, ""), urlDir) + "\n";
  }
  const { code } = await transform(out, { loader: "css", minify: true });
  writeFileSync(join(PUBLIC_DIR, "bundle.css"), code);

  /* The originals are no longer referenced; drop them from the deploy. */
  for (const { file } of CSS_SOURCES) {
    rmSync(join(PUBLIC_DIR, file), { force: true });
  }

  /* Point every HTML file at the bundle: the first source stylesheet
     link becomes bundle.css, the rest are removed. */
  const linkRe = new RegExp(
    `[ \\t]*<link rel="stylesheet" href="[^"]*?(?:${CSS_SOURCES.map((s) => s.file.replace(/[.\/]/g, "\\$&")).join("|")})">\\n?`,
    "g"
  );
  let rewritten = 0;
  for (const file of htmlFiles(PUBLIC_DIR)) {
    const src = readFileSync(file, "utf8");
    if (!linkRe.test(src)) continue;
    linkRe.lastIndex = 0;
    let first = true;
    const out = src.replace(linkRe, (m) => {
      if (!first) return "";
      first = false;
      return m.replace(/href="[^"]+"/, 'href="/bundle.css"').replace(/^[ \t]+/, "  ");
    });
    writeFileSync(file, out);
    rewritten++;
  }
  console.log(`✓ bundle.css (${(code.length / 1024).toFixed(1)} kB minified, ${rewritten} HTML files rewritten)`);
}

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
    else if (entry.endsWith(".html")) out.push(path);
  }
  return out;
}

async function minifyJs() {
  for (const file of JS_FILES) {
    const path = join(PUBLIC_DIR, file);
    if (!existsSync(path)) {
      console.warn(`! skipping ${file} (not found in public/)`);
      continue;
    }
    const { code } = await transform(readFileSync(path, "utf8"), {
      loader: "js",
      minify: true,
    });
    writeFileSync(path, code);
    console.log(`✓ ${file} (${(code.length / 1024).toFixed(1)} kB minified)`);
  }
}

await bundleCss();
await minifyJs();

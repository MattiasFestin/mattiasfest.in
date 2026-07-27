#!/usr/bin/env node
/**
 * Post-build asset optimization. Runs after `zola build` on public/:
 *
 *   1. CSS: concatenates 98.css + Temml-Local.css + site.css into a
 *      single minified public/bundle.css (relative url()s are rewritten
 *      to absolute paths so fonts keep resolving from their own folders).
 *   2. JS: minifies main.js, editor.js and pyworker.js in place.
 *
 * Templates reference bundle.css / main.js directly; editor.js is
 * lazy-loaded by main.js when the Python editor is first opened.
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
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

const JS_FILES = ["main.js", "editor.js", "pyworker.js"];

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
    out += rebaseUrls(readFileSync(path, "utf8"), urlDir) + "\n";
  }
  const { code } = await transform(out, { loader: "css", minify: true });
  writeFileSync(join(PUBLIC_DIR, "bundle.css"), code);

  /* The originals are no longer referenced; drop them from the deploy. */
  for (const { file } of CSS_SOURCES) {
    rmSync(join(PUBLIC_DIR, file), { force: true });
  }
  console.log(`✓ bundle.css (${(code.length / 1024).toFixed(1)} kB minified)`);
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

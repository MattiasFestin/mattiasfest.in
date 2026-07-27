#!/usr/bin/env node
/**
 * Compile-time math rendering for the Zola site.
 *
 * Runs after `zola build` and rewrites the generated HTML in public/,
 * converting LaTeX to native MathML <math> elements via Temml.
 * Nothing is shipped to the client except the markup itself.
 *
 * Authoring syntax (in markdown):
 *   - Inline:  `$E = mc^2$`      (a code span wrapping $...$)
 *   - Display: ```math fenced code block
 *
 * Using code spans/blocks keeps LaTeX out of the markdown parser's
 * reach, so backslashes, underscores and asterisks are never mangled.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import temml from "temml";

const PUBLIC_DIR = new URL("../public", import.meta.url).pathname;

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x27": "'" };
function decode(html) {
  return html.replace(/&(amp|lt|gt|quot|apos|#39|#x27|#\d+|#x[\da-fA-F]+);/g, (m, name) => {
    if (name in entities) return entities[name];
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return m;
  });
}

function render(tex, displayMode, file) {
  try {
    return temml.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: false,
    });
  } catch (err) {
    console.error(`\n✗ Math error in ${file}:\n  ${tex.trim()}\n  ${err.message}`);
    process.exitCode = 1;
    return null;
  }
}

// Display math: <pre ...><code data-lang="math">...</code></pre>
const DISPLAY_RE = /<pre[^>]*>\s*<code[^>]*data-lang="math"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g;
// Inline math: plain code span whose content is wrapped in single dollars
const INLINE_RE = /<code>\$([^<]+?)\$<\/code>/g;

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

let files = 0;
let formulas = 0;

for (const file of htmlFiles(PUBLIC_DIR)) {
  const original = readFileSync(file, "utf8");
  let changed = false;

  const out = original
    .replace(DISPLAY_RE, (match, body) => {
      // Highlighting may wrap lines in spans; strip tags before decoding.
      const tex = decode(body.replace(/<[^>]+>/g, ""));
      const mathml = render(tex, true, file);
      if (mathml === null) return match;
      changed = true;
      formulas++;
      return mathml;
    })
    .replace(INLINE_RE, (match, body) => {
      const mathml = render(decode(body), false, file);
      if (mathml === null) return match;
      changed = true;
      formulas++;
      return mathml;
    });

  if (changed) {
    writeFileSync(file, out);
    files++;
  }
}

console.log(`✓ Rendered ${formulas} formula(s) in ${files} file(s).`);

#!/usr/bin/env node
/**
 * Compile-time execution of Python snippets for the Zola site.
 *
 * Runs after `zola build` and rewrites the generated HTML in public/:
 * every Python code block followed by an `<!-- output -->` marker is
 * executed, and the captured output is dropped into a pane underneath the
 * code, styled like Python.exe's MS-DOS output window.
 *
 * Authoring syntax (in markdown):
 *
 *     ```python
 *     print("hello")
 *     ```
 *
 *     <!-- output -->
 *
 * That's it: no pasting output back into the post, and no way for the two
 * to drift apart, because a snippet that stops working stops the build.
 *
 * Notes:
 *   - All marked blocks on a page share one interpreter session, in
 *     document order, so a block can build on the one above it. Blocks
 *     without a marker are not executed at all.
 *   - A snippet that prints nothing gets no pane (handy for setup blocks
 *     that only exist to seed the session).
 *   - Snippets must be deterministic, or the site changes on every build.
 *     Seed your RNG (`np.random.default_rng(0)`).
 *   - Results are cached in .cache/python-output.json, keyed by the code
 *     itself, so rebuilds only re-run pages whose snippets changed.
 *   - Requires python3 on PATH (override with PYTHON=...) plus whatever
 *     the snippets import; see requirements.txt.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC_DIR = join(ROOT, "public");
const DRIVER = join(ROOT, "scripts/pyrun.py");
const CACHE_FILE = join(ROOT, ".cache/python-output.json");
const PYTHON = process.env.PYTHON ?? "python3";
const TIMEOUT_MS = Number(process.env.PYTHON_TIMEOUT ?? 180_000);
/* Bump when the rendered markup or the driver's semantics change, so
   stale entries from an older format are ignored. */
const CACHE_VERSION = 1;
/* A runaway loop shouldn't be able to inline a megabyte into a post. */
const MAX_OUTPUT = 20_000;

/* A python code block, and the marker that opts it in. Kept as two
   patterns on purpose: one regex spanning both would happily backtrack
   across every unmarked block in between and swallow them whole. */
const PY_BLOCK_RE =
  /<pre[^>]*>\s*<code[^>]*data-lang="(?:python|py)"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/g;
const MARKER_RE = /^\s*<!--\s*output\s*-->/;
const ANY_MARKER_RE = /<!--\s*output\s*-->/;

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x27": "'" };
function decode(html) {
  return html.replace(/&(amp|lt|gt|quot|apos|#39|#x27|#\d+|#x[\da-fA-F]+);/g, (m, name) => {
    if (name in entities) return entities[name];
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return m;
  });
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Highlighting wraps the source in spans; strip them, then unescape. */
function sourceOf(highlighted) {
  return decode(highlighted.replace(/<[^>]+>/g, ""));
}

function outputPane(text) {
  return (
    '<div class="code-output">' +
    '<div class="code-output-label" aria-hidden="true">Output</div>' +
    `<pre aria-label="Program output"><code>${escape(text)}</code></pre>` +
    "</div>"
  );
}

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

/** The python blocks a page opted in, with the span each one replaces. */
function markedBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(PY_BLOCK_RE)) {
    const marker = html.slice(match.index + match[0].length).match(MARKER_RE);
    if (!marker) continue; /* no marker: not ours to run */
    blocks.push({
      start: match.index,
      end: match.index + match[0].length + marker[0].length,
      pre: match[0],
      code: sourceOf(match[1]),
    });
  }
  return blocks;
}

/* --- Cache: page fingerprint -> the outputs its blocks produced --- */
let cache = {};
if (existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    cache = {}; /* corrupt cache is just a slow build, not an error */
  }
}
const fresh = {}; /* only what this build used, so the file self-prunes */

const fingerprint = (blocks) =>
  createHash("sha256").update(JSON.stringify([CACHE_VERSION, blocks])).digest("hex");

/** Run every block of one page in a shared session. Returns outputs or null. */
function runBlocks(blocks, file) {
  const proc = spawnSync(PYTHON, [DRIVER], {
    cwd: ROOT,
    input: JSON.stringify({ blocks }),
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (proc.error?.code === "ENOENT") {
    fail(`${PYTHON} not found. Install Python 3 (and the snippet dependencies\n` +
      `  from requirements.txt), or point PYTHON at another interpreter.`);
    return null;
  }
  if (proc.error?.code === "ETIMEDOUT" || proc.signal) {
    fail(`Python snippets in ${relative(ROOT, file)} timed out after ${TIMEOUT_MS} ms.\n` +
      `  Make them faster, or raise PYTHON_TIMEOUT.`);
    return null;
  }
  if (proc.status !== 0 || !proc.stdout) {
    fail(`Could not run Python snippets in ${relative(ROOT, file)}:\n${indent(proc.stderr)}`);
    return null;
  }

  const result = JSON.parse(proc.stdout);
  if (result.error) {
    const { index, traceback } = result.error;
    /* By far the likeliest failure: right interpreter, wrong packages -
       or the right packages in an interpreter that isn't on PATH today. */
    const hint = /ModuleNotFoundError/.test(traceback)
      ? `\n  Interpreter: ${result.python ?? PYTHON}\n` +
        "  Install what the snippets import with `pip install -r requirements.txt`,\n" +
        "  or point PYTHON at the interpreter that already has them."
      : "";
    fail(
      `Python error in ${relative(ROOT, file)} (snippet ${index + 1}):\n` +
        indent(traceback) +
        hint
    );
    return null;
  }
  return result.outputs;
}

const indent = (text) => String(text ?? "").trimEnd().replace(/^/gm, "  ");

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exitCode = 1;
}

const stray = (file) =>
  fail(
    `Stray <!-- output --> in ${relative(ROOT, file)}: the marker must directly\n` +
      "  follow a ```python code block."
  );

let pages = 0;
let snippets = 0;
let cached = 0;

for (const file of htmlFiles(PUBLIC_DIR)) {
  const original = readFileSync(file, "utf8");
  if (!ANY_MARKER_RE.test(original)) continue;

  const marked = markedBlocks(original);
  if (marked.length === 0) {
    stray(file);
    continue;
  }

  const blocks = marked.map((block) => block.code);
  const key = fingerprint(blocks);
  let outputs = cache[key];
  if (outputs) cached += outputs.length;
  else outputs = runBlocks(blocks, file);
  if (!outputs) continue; /* failed; leave the page untouched */

  fresh[key] = outputs;

  let out = "";
  let cursor = 0;
  marked.forEach((block, index) => {
    let text = outputs[index] ?? "";
    if (text.length > MAX_OUTPUT) {
      text = `${text.slice(0, MAX_OUTPUT)}\n… output truncated …`;
    }
    text = text.replace(/\s+$/, "");
    out += original.slice(cursor, block.start);
    /* Nothing printed: the block only existed to set up the session. */
    out += text ? `<div class="code-run">${block.pre}${outputPane(text)}</div>` : block.pre;
    cursor = block.end;
  });
  out += original.slice(cursor);

  if (ANY_MARKER_RE.test(out)) {
    stray(file);
    continue;
  }

  writeFileSync(file, out);
  pages++;
  snippets += marked.length;
}

mkdirSync(dirname(CACHE_FILE), { recursive: true });
writeFileSync(CACHE_FILE, JSON.stringify(fresh));

if (!process.exitCode) {
  console.log(
    `✓ Ran ${snippets} Python snippet(s) in ${pages} page(s)` +
      (cached ? ` (${cached} from cache).` : ".")
  );
}

#!/usr/bin/env node
/**
 * Local dev server with compile-time math rendering.
 *
 * `zola serve` serves from memory, so the math post-processing step
 * can never touch its output. Instead this script:
 *
 *   1. runs `zola build` (with drafts) into public/
 *   2. runs scripts/run-python.mjs (executes marked snippets)
 *   3. runs scripts/render-math.mjs over it
 *   4. serves public/ on http://127.0.0.1:1111
 *   5. watches content/templates/sass/static/syntaxes/zola.toml
 *      and rebuilds on change (refresh the browser to see it)
 */

import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC_DIR = join(ROOT, "public");
const PORT = Number(process.env.PORT ?? 1111);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let lastBuildStart = 0;

function build() {
  const started = Date.now();
  lastBuildStart = started;
  const zola = spawnSync("zola", ["build", "--drafts", "--base-url", BASE_URL], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (zola.status !== 0) {
    console.error("✗ zola build failed");
    return;
  }
  const python = spawnSync(process.execPath, [join(ROOT, "scripts/run-python.mjs")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (python.status !== 0) {
    console.error("✗ running Python snippets failed (see above)");
    return;
  }
  const math = spawnSync(process.execPath, [join(ROOT, "scripts/render-math.mjs")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (math.status !== 0) {
    console.error("✗ math rendering failed (see above)");
    return;
  }
  const optimize = spawnSync(process.execPath, [join(ROOT, "scripts/optimize.mjs")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (optimize.status !== 0) {
    console.error("✗ asset optimization failed (see above)");
    return;
  }
  console.log(`✓ Rebuilt in ${Date.now() - started}ms`);
}

/* --- Watch & rebuild (debounced) --- */
let timer = null;
function scheduleBuild(reason, path) {
  // Zola clones static files on macOS, which fires FSEvents on the
  // *source* files during our own build. Ignore events for files whose
  // contents haven't actually changed since the last build started.
  if (path) {
    try {
      const s = statSync(path);
      if (Math.max(s.mtimeMs, s.ctimeMs) <= lastBuildStart) return;
    } catch {
      // deleted/renamed: fall through and rebuild
    }
  }
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`… change detected (${reason})`);
    build();
  }, 120);
}

for (const dir of ["content", "templates", "sass", "static", "syntaxes"]) {
  const path = join(ROOT, dir);
  if (!existsSync(path)) continue;
  watch(path, { recursive: true }, (_event, filename) =>
    scheduleBuild(join(dir, filename ?? ""), filename ? join(path, filename) : null)
  );
}
watch(join(ROOT, "zola.toml"), () => scheduleBuild("zola.toml", join(ROOT, "zola.toml")));

/* --- Static file server for public/ --- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(PUBLIC_DIR, clean);
  if (!file.startsWith(PUBLIC_DIR)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (existsSync(file)) return file;
  return null;
}

http
  .createServer((req, res) => {
    const file = resolveFile(req.url ?? "/");
    if (!file) {
      const notFound = join(PUBLIC_DIR, "404.html");
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(existsSync(notFound) ? readFileSync(notFound) : "404 Not Found");
      return;
    }
    const type = MIME[extname(file)] ?? "application/octet-stream";
    const size = statSync(file).size;

    /* Browsers only treat a video as seekable when the server answers
       byte ranges, so serve them the way the real host does - otherwise
       the media player's scrubber is dead in local dev. */
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && size) {
      let start = range[1] ? Number(range[1]) : null;
      let end = range[2] ? Number(range[2]) : null;
      if (start === null) {
        start = Math.max(0, size - (end ?? 0)); /* suffix range: last N bytes */
        end = size - 1;
      } else if (end === null || end >= size) {
        end = size - 1;
      }

      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(file));
  })
  .listen(PORT, "127.0.0.1", () => {
    build();
    console.log(`\n→ Serving on ${BASE_URL} (Ctrl+C to stop)\n`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `✗ Port ${PORT} is already in use (zola serve running?).\n` +
          `  Stop it, or pick another port: PORT=1112 npm run dev`
      );
      process.exit(1);
    }
    throw err;
  });

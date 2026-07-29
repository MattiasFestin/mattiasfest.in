#!/usr/bin/env node
/**
 * Prunes scheduled (future-dated) posts from the content tree so they
 * don't get published before their time.
 *
 * Run in CI before `npm run build`. Never run locally: it DELETES the
 * markdown files from the working tree (fine in an ephemeral CI
 * checkout, destructive on your machine). Local dev/builds keep
 * future posts visible so they can be previewed.
 *
 * A post is scheduled if its TOML front matter has `date = YYYY-MM-DD`
 * later than "today" in Europe/Stockholm.
 */

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const BLOG_DIR = new URL("../content/blog", import.meta.url).pathname;

/* Today's date in Stockholm, as YYYY-MM-DD (en-CA locale formats ISO).
   PRUNE_TODAY overrides for testing, e.g. PRUNE_TODAY=2026-08-20 */
const today =
  process.env.PRUNE_TODAY ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

let pruned = 0;
for (const file of readdirSync(BLOG_DIR)) {
  if (!file.endsWith(".md") || file === "_index.md") continue;
  const path = join(BLOG_DIR, file);
  const m = readFileSync(path, "utf8").match(/^date\s*=\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  if (!m) continue;
  if (m[1] > today) {
    rmSync(path);
    pruned++;
    console.log(`  pruned ${file} (scheduled ${m[1]})`);
  }
}
console.log(`✓ pruned ${pruned} scheduled post(s); today is ${today} (Europe/Stockholm)`);

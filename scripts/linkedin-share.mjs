#!/usr/bin/env node
/**
 * Announces newly published posts on LinkedIn.
 *
 * A post is announced if its front matter `date` is today
 * (Europe/Stockholm) AND it has an opt-in message in `[extra]`:
 *
 *   [extra]
 *   linkedin = "Text of the LinkedIn post announcing this article."
 *
 * Runs from .github/workflows/scheduled-publish.yml after the deploy
 * completes. That workflow runs once per day, which is what makes this
 * idempotent: no state to track, no double posts. Posts published by a
 * normal push (date <= today) are NOT auto-announced; trigger the
 * "Publish scheduled posts" workflow manually on the day if you want it.
 *
 * Env:
 *   LINKEDIN_ACCESS_TOKEN  required; member token with w_member_social
 *                          (+ openid profile if LINKEDIN_AUTHOR_URN unset).
 *                          Missing token = skip quietly, so the pipeline
 *                          works before credentials are configured.
 *   LINKEDIN_AUTHOR_URN    optional, e.g. urn:li:person:AbC123xYz.
 *                          If unset, resolved via /v2/userinfo.
 *   LINKEDIN_VERSION       optional API version header, default below.
 *   SHARE_TODAY            override "today" for testing (YYYY-MM-DD).
 *   SHARE_DRY_RUN          if set, print payloads instead of posting.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BLOG_DIR = new URL("../content/blog", import.meta.url).pathname;
const ZOLA_TOML = new URL("../zola.toml", import.meta.url).pathname;
const API_VERSION = process.env.LINKEDIN_VERSION || "202506";

const token = process.env.LINKEDIN_ACCESS_TOKEN;
const dryRun = !!process.env.SHARE_DRY_RUN;
if (!token && !dryRun) {
  console.log("LINKEDIN_ACCESS_TOKEN not set; skipping LinkedIn announcements.");
  process.exit(0);
}

const today =
  process.env.SHARE_TODAY ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const baseUrl = readFileSync(ZOLA_TOML, "utf8")
  .match(/^base_url\s*=\s*"([^"]+)"/m)[1]
  .replace(/\/$/, "");

/* Front matter parsing: just what we need, from the +++ block. */
function parsePost(file) {
  const src = readFileSync(join(BLOG_DIR, file), "utf8");
  const fm = src.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
  if (!fm) return null;
  const get = (key) => {
    const tq = fm[1].match(new RegExp(`^${key}\\s*=\\s*"""\\n?([\\s\\S]*?)"""`, "m"));
    if (tq) return tq[1].trim();
    const q = fm[1].match(new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m"));
    return q ? q[1].replace(/\\(["\\])/g, "$1") : null;
  };
  const date = fm[1].match(/^date\s*=\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  return {
    date,
    title: get("title"),
    description: get("description"),
    linkedin: get("linkedin"),
    url: `${baseUrl}/blog/${file.replace(/\.md$/, "")}/`,
  };
}

/* LinkedIn "little text": reserved chars in commentary must be escaped. */
const escapeCommentary = (s) => s.replace(/([\\|{}@\[\]()<>#*_~])/g, "\\$1");

async function api(path, opts = {}) {
  const res = await fetch(`https://api.linkedin.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": API_VERSION,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  }
  return res;
}

const due = readdirSync(BLOG_DIR)
  .filter((f) => f.endsWith(".md") && f !== "_index.md")
  .map(parsePost)
  .filter((p) => p && p.date === today && p.linkedin);

if (due.length === 0) {
  console.log(`No posts dated ${today} with a linkedin message; nothing to announce.`);
  process.exit(0);
}

let author = process.env.LINKEDIN_AUTHOR_URN;
if (!author && !dryRun) {
  const me = await (await api("/v2/userinfo")).json();
  author = `urn:li:person:${me.sub}`;
}

for (const post of due) {
  const payload = {
    author,
    commentary: escapeCommentary(post.linkedin),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      article: {
        source: post.url,
        title: post.title,
        description: post.description?.slice(0, 250),
      },
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (dryRun) {
    console.log(`DRY RUN, would announce ${post.url}:`);
    console.log(JSON.stringify(payload, null, 2));
    continue;
  }
  const res = await api("/rest/posts", { method: "POST", body: JSON.stringify(payload) });
  console.log(`✓ announced ${post.url} (${res.headers.get("x-restli-id")})`);
}

#!/usr/bin/env node
/**
 * Render delivery videos only for posts remaining in the CI content tree.
 * `prune-scheduled.mjs` removes future-dated posts before this script runs,
 * so unpublished posts do not consume Manim/ffmpeg time or invalidate their
 * delivery outputs until their publication day.
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const cached = process.argv.includes("--if-missing");
const posts = [
  { id: "0001", content: "content/blog/0001-linear-vector-spaces.md" },
  { id: "0002", content: "content/blog/0002-what-are-embeddings.md" },
  { id: "0003", content: "content/blog/0003-how-are-embeddings-trained.md" },
  { id: "0005", content: "content/blog/0005-linear-regression.md" },
];

for (const post of posts) {
  if (!existsSync(post.content)) {
    console.log(`Skipping Manim post ${post.id}: not published in this build.`);
    continue;
  }

  const args = ["manim/render.sh", post.id, "--final"];
  if (cached) args.push("--if-missing");

  const result = spawnSync("sh", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

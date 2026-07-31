import { test, expect } from "./helpers.js";

/* Content-level features: feeds, compile-time math, syntax
   highlighting, comments, reading width. */

test("atom feed is served with entries", async ({ request }) => {
  const res = await request.get("/atom.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");
  const body = await res.text();
  expect(body).toContain("<feed");
  expect(body).toContain("<entry");
});

test("sitemap and robots.txt exist", async ({ request }) => {
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
  expect((await request.get("/robots.txt")).status()).toBe(200);
});

test("math renders to MathML at build time (no client JS, no FOUC)", async ({ page }) => {
  await page.goto("/blog/0001-linear-vector-spaces/");
  expect(await page.locator("#content math").count()).toBeGreaterThan(0);
  // Compile-time rendering means no math library ships to the client
  const mathScripts = await page.evaluate(() =>
    [...document.scripts].filter((s) => /temml|katex|mathjax/i.test(s.src)).length
  );
  expect(mathScripts).toBe(0);
});

test("code blocks are syntax highlighted at build time", async ({ page }) => {
  await page.goto("/blog/python-exe/");
  const block = page.locator('#content pre > code[data-lang="python"]').first();
  await expect(block).toBeVisible();
  // Zola's syntect highlighting produces styled spans inside the block
  expect(await block.locator("span").count()).toBeGreaterThan(0);
});

test("marked Python snippets are executed at build time, output inlined", async ({ page }) => {
  await page.goto("/blog/0001-linear-vector-spaces/");
  const run = page.locator("#content .code-run").first();
  await expect(run.locator('pre > code[data-lang="python"]')).toBeVisible();
  // The Z3 snippet above it printed this; nothing ran in the browser
  await expect(run.locator(".code-output pre")).toHaveText(/^sat\n\[/);
  // Later blocks share one session, so all four panes have content
  const panes = page.locator("#content .code-output pre");
  expect(await panes.count()).toBe(4);
  for (const text of await panes.allTextContents()) expect(text.trim()).not.toBe("");
});

test("a page can mix pre-run and press-Run-yourself snippets", async ({ page }) => {
  await page.goto("/blog/python-exe/");
  // Only the marked block gets a pane; the invitations to run it yourself
  // (including the deliberately random one) are left alone.
  const blocks = page.locator('#content pre > code[data-lang="python"]');
  expect(await blocks.count()).toBeGreaterThan(1);
  await expect(page.locator("#content .code-output")).toHaveCount(1);
  await expect(page.locator("#content .code-output pre")).toContainText("Floppy disks:");
});

test("math posts can embed accessible, explained Manim figures", async ({ page }) => {
  for (const [post, count] of [
    ["0001-linear-vector-spaces", 3],
    ["0005-linear-regression", 3],
  ]) {
    await page.goto(`/blog/${post}/`);
    const figures = page.locator("figure.manim-figure");
    const players = figures.locator(".manim-player");
    const videos = figures.locator("video.manim-video");
    const explainers = figures.locator("aside.manim-explainer[role=note]");
    await expect(figures).toHaveCount(count);
    await expect(players).toHaveCount(count);
    await expect(videos).toHaveCount(count);
    await expect(explainers).toHaveCount(count);

    for (let i = 0; i < count; i++) {
      await expect(players.nth(i).locator(".manim-player-titlebar")).toHaveText(/Media Player/);

      await expect(players.nth(i).locator(".manim-player-buttons > button.manim-player-button")).toHaveCount(3);
      await expect(players.nth(i).locator('input.manim-player-scrubber[type="range"]')).toHaveCount(1);
      await expect(videos.nth(i)).toHaveAttribute("autoplay", "");
      await expect(videos.nth(i)).toHaveAttribute("muted", "");
      await expect(videos.nth(i)).toHaveAttribute("playsinline", "");
      await expect(videos.nth(i).locator('source[type="video/webm"]')).toHaveCount(1);
      await expect(videos.nth(i).locator('source[type="video/mp4"]')).toHaveCount(1);
      await expect(explainers.nth(i).locator("ol > li")).toHaveCount(3);
      const playerWidth = await players.nth(i).evaluate((el) => Math.round(el.getBoundingClientRect().width));
      const explainerWidth = await explainers.nth(i).evaluate((el) => Math.round(el.getBoundingClientRect().width));
      expect(explainerWidth).toBe(playerWidth);
    }

    const firstPlayer = players.first();
    const firstVideo = videos.first();
    const pause = firstPlayer.locator('[data-manim-action="pause"]');
    await expect(pause).toBeEnabled();
    await pause.click();
    await expect(firstVideo).toHaveJSProperty("paused", true);
    await expect(firstVideo).toHaveAttribute("data-manim-user-paused", "true");
    await firstPlayer.locator('[data-manim-action="play"]').click();
    await expect(firstVideo).not.toHaveAttribute("data-manim-user-paused");
  }
});

test("posts have a giscus comments section", async ({ page }) => {
  await page.goto("/blog/hello-world/");
  const comments = page.locator("fieldset.comments");
  await expect(comments).toBeVisible();
  await expect(comments.locator("legend")).toHaveText("Comments");
  const src = await comments.locator("script").getAttribute("src");
  expect(src).toContain("giscus.app");
});

test("reading width setting actually changes the article column", async ({ page }) => {
  test.skip(
    test.info().project.name.includes("mobile"),
    "phone columns are viewport-capped, not reading-width-capped"
  );
  await page.goto("/blog/hello-world/");
  const width = () =>
    page.locator("#content article").evaluate((el) => el.getBoundingClientRect().width);
  const before = await width();
  await page.evaluate(() => {
    localStorage.setItem("mf-settings", JSON.stringify({ readingWidth: 50 }));
  });
  await page.reload();
  const after = await width();
  expect(after).toBeLessThan(before);
});

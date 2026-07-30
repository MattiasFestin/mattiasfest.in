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

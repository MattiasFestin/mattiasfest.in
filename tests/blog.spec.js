import { test, expect, showDesktop } from "./helpers.js";

test.describe("blog listing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/blog/");
  });

  test("shows the post table with at least one post", async ({ page }) => {
    const rows = page.locator(".post-table tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
    // Every row links somewhere and shows a date
    const first = rows.first();
    await expect(first.locator("a")).toHaveAttribute("href", /\/blog\//);
    await expect(first.locator("td").nth(1)).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("clicking a row (not the link) navigates to the post", async ({ page }) => {
    const row = page.locator(".post-table tbody tr").first();
    const href = await row.getAttribute("data-href");
    await row.locator("td").nth(1).click(); // the date cell, not the <a>
    await expect(page).toHaveURL(href);
  });
});

test.describe("blog post page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/blog/");
    const row = page.locator(".post-table tbody tr").first();
    await row.locator("a").click();
    await page.waitForURL(/\/blog\/.+/);
  });

  test("renders the article with title, meta, and status bar", async ({ page }) => {
    await expect(page.locator("article h1")).toBeVisible();
    await expect(page.locator(".post-meta")).toContainText("min read");
    await expect(page.locator('main[data-win="main"] .status-bar')).toContainText("words");
  });

  test("shows the blog window behind the post", async ({ page }) => {
    const blogWin = page.locator('[data-win="blog"]');
    await expect(blogWin).toBeVisible();
    await expect(blogWin).toHaveClass(/background-window/);
    // The post window is the active one, not the background blog window
    await expect(page.locator('.taskbar-task[data-for="main"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.taskbar-task[data-for="blog"]')).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking the background blog window brings it to front", async ({ page }) => {
    // On phones the maximized post window covers it; minimize first.
    await showDesktop(page);
    await page.locator('[data-win="blog"] .title-bar-text').click();
    await expect(page.locator('[data-win="blog"]')).toHaveClass(/front/);
    await expect(page.locator('.taskbar-task[data-for="blog"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.taskbar-task[data-for="main"]')).toHaveAttribute("aria-pressed", "false");
  });

  test("main content precedes the background window in tab order", async ({ page }) => {
    // DOM order drives tab/reading order: <main> must come before the
    // background blog window even though the blog window paints behind it.
    const order = await page.evaluate(() => {
      const main = document.querySelector('main[data-win="main"]');
      const blog = document.querySelector('[data-win="blog"]');
      return main.compareDocumentPosition(blog) & Node.DOCUMENT_POSITION_FOLLOWING ? "main-first" : "blog-first";
    });
    expect(order).toBe("main-first");
  });

  test("closing the post window falls back to the blog window", async ({ page }) => {
    await page.locator('main[data-win="main"]').getByRole("button", { name: "Close" }).click();
    await expect(page.locator('main[data-win="main"]')).not.toBeVisible();
    await expect(page.locator('[data-win="blog"]')).toHaveClass(/front/);
    await expect(page.locator('.taskbar-task[data-for="blog"]')).toHaveAttribute("aria-pressed", "true");
  });
});

test("about page renders content and attribution", async ({ page }) => {
  await page.goto("/about/");
  await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  await expect(page.locator("#content")).toContainText("OverClocked ReMix");
  await expect(page.locator("#content")).toContainText("Webamp");
});

import { test, expect } from "./helpers.js";

/* Opening a page repaints the main window instead of reloading the
   desktop, so everything else running - Winamp, The Internet, a Python
   session - is still there afterwards (see main.js, "Opening pages").
   A flag on `window` is the honest witness: it survives a swap and
   nothing else. */

const mark = (page) =>
  page.evaluate(() => {
    window.__desktopAlive = true;
  });

const alive = (page) => page.evaluate(() => window.__desktopAlive === true);

test.describe("opening pages", () => {
  test("a post opens in the main window without reloading the desktop", async ({ page }) => {
    await page.goto("/blog/");
    await mark(page);

    const link = page.locator(".post-table tbody tr a").first();
    const href = await link.getAttribute("href");
    const title = (await link.innerText()).trim();
    await link.click();

    await expect(page).toHaveURL(href);
    expect(await alive(page)).toBe(true);

    // The window, its taskbar button and the document title all follow
    await expect(page.locator("article h1")).toHaveText(title);
    await expect(page.locator('main[data-win="main"] .title-bar-text')).toContainText(title);
    await expect(page.locator('.taskbar-task[data-for="main"]')).toContainText(title);
    expect(await page.title()).toContain(title);
    await expect(page.locator('main[data-win="main"] .status-bar')).toContainText("words");

    // The blog folder comes along as the background window it always was
    await expect(page.locator('[data-win="blog"]')).toBeVisible();
    await expect(page.locator('.taskbar-task[data-for="blog"]')).toBeVisible();
    await expect(page.locator('.taskbar-task[data-for="main"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("Back returns to the folder, and takes the background window with it", async ({ page }) => {
    await page.goto("/blog/");
    await mark(page);
    await page.locator(".post-table tbody tr a").first().click();
    await expect(page.locator("article h1")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/blog\/?$/);
    expect(await alive(page)).toBe(true);
    await expect(page.locator(".post-table")).toBeVisible();
    await expect(page.locator('[data-win="blog"]')).toHaveCount(0);
    await expect(page.locator('.taskbar-task[data-for="blog"]')).toHaveCount(0);

    await page.goForward();
    await expect(page.locator("article h1")).toBeVisible();
    expect(await alive(page)).toBe(true);
    await expect(page.locator('[data-win="blog"]')).toBeVisible();
  });

  test("clicking a row rather than its link opens the post the same way", async ({ page }) => {
    await page.goto("/blog/");
    await mark(page);
    const row = page.locator(".post-table tbody tr").first();
    const href = await row.getAttribute("data-href");
    await row.locator("td").nth(1).click(); // the date cell, not the <a>
    await expect(page).toHaveURL(href);
    expect(await alive(page)).toBe(true);
  });

  test("the Start menu navigates, closes, and marks where you are", async ({ page }) => {
    await page.goto("/");
    await mark(page);
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "About" }).click();

    await expect(page).toHaveURL(/\/about\/?$/);
    expect(await alive(page)).toBe(true);
    await expect(page.locator("#start-menu")).toBeHidden();
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();

    await page.locator("#start-button").click();
    await expect(page.locator('#start-menu a[href*="about"]')).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.locator('#start-menu a[href$="/blog"]')).not.toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("opening a post reopens a main window the reader had closed", async ({ page }) => {
    await page.goto("/blog/");
    await page.locator(".post-table tbody tr a").first().click();
    await expect(page.locator("article h1")).toBeVisible();
    await mark(page);

    await page.locator('main[data-win="main"]').getByRole("button", { name: "Close" }).click();
    await expect(page.locator('main[data-win="main"]')).not.toBeVisible();

    // The blog folder is still open behind it: open another post from there
    await page.locator('[data-win="blog"] .post-table tbody tr a').nth(1).click();
    await expect(page.locator('main[data-win="main"]')).toBeVisible();
    await expect(page.locator('.taskbar-task[data-for="main"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(await alive(page)).toBe(true);
  });

  test("a page that isn't there is left to the browser", async ({ page }) => {
    await page.goto("/");
    await mark(page);
    await page.evaluate(() => window.MF.open("/no-such-folder/"));

    await expect(page.locator(".error-dialog")).toBeVisible();
    await expect(page).toHaveURL(/no-such-folder/);
    // A real navigation: the 404 keeps its status code and its own page
    expect(await alive(page)).toBe(false);
  });
});

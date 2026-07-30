import { test, expect, SLOW } from "./helpers.js";

/* "Find: All Files" - the Win98 file search, restaged over the site's
   own pages. The catalog is inlined in every page, so name searches are
   offline; only "Containing text" fetches Zola's elasticlunr index. */

test.describe("find files", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  const win = (page) => page.locator('[data-win="find"]');
  const status = (page) => page.locator("#find-status");
  const rows = (page) => page.locator("#find-rows tr");

  /* Results trickle in a chunk at a time; the count settles last. */
  const settled = async (page, re) =>
    expect(status(page)).toHaveText(re, { timeout: 4_000 * SLOW });

  const open = async (page) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Find: Files or Folders..." }).click();
    await expect(win(page)).toBeVisible();
  };

  test("opens from the Start menu with focus in the Named box", async ({ page }) => {
    await open(page);
    await expect(page.locator("#find-title")).toHaveText("Find: All Files");
    await expect(page.locator("#find-named")).toBeFocused();
    await expect(page.locator('.taskbar-task[data-for="find"]')).toBeVisible();
  });

  test("F3 opens it too, and Escape closes it", async ({ page }) => {
    await page.keyboard.press("F3");
    await expect(win(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(win(page)).toBeHidden();
    await expect(page.locator('.taskbar-task[data-for="find"]')).toBeHidden();
  });

  test("finds posts by name and opens one", async ({ page }) => {
    await open(page);
    await page.locator("#find-named").fill("hello");
    await page.locator("#find-now").click();
    await settled(page, /1 file\(s\) found/);
    await expect(page.locator("#find-title")).toHaveText("Find: Files named hello");

    const row = rows(page).first();
    await expect(row).toContainText("Hello, World");
    await expect(row).toContainText("C:\\Blog");
    await expect(row).toContainText("HTML Document");

    await row.getByRole("link").click();
    await expect(page).toHaveURL(/\/blog\/hello-world\/?$/);
  });

  test("supports MS-DOS wildcards", async ({ page }) => {
    await open(page);
    await page.locator("#find-named").fill("*.html");
    await page.locator("#find-now").click();
    // Every page is an HTML document; the Blog folder is not.
    await settled(page, /1[0-9] file\(s\) found/);
    await expect(rows(page).filter({ hasText: "File Folder" })).toHaveCount(0);
  });

  test('"Look in" and "Of type" narrow the search', async ({ page }) => {
    await open(page);
    await page.locator("#find-look").selectOption("C:\\Blog");
    await page.locator("#find-now").click();
    await settled(page, /file\(s\) found/);
    const folders = await page.locator("#find-rows tr td:nth-child(2)").allTextContents();
    expect(new Set(folders)).toEqual(new Set(["C:\\Blog"]));

    await page.locator("#find-new").click();
    await page.locator("#find-tab-adv").click();
    await page.locator("#find-type").selectOption("dir");
    await page.locator("#find-now").click();
    await settled(page, /1 file\(s\) found/);
    await expect(rows(page).first()).toContainText("Blog");
    await expect(rows(page).first()).toContainText("File Folder");
  });

  test("the search index is lazy: only fetched for a text search", async ({ page }) => {
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    const indexed = () => requests.some((u) => /search_index.*\.js/.test(u));

    await open(page);
    await page.locator("#find-named").fill("hello");
    await page.locator("#find-now").click();
    await settled(page, /file\(s\) found/);
    expect(indexed()).toBe(false);

    await page.locator("#find-new").click();
    await page.locator("#find-text").fill("gradient descent");
    await page.locator("#find-now").click();
    await settled(page, /[1-9][0-9]* file\(s\) found/);
    expect(indexed()).toBe(true);
    // Full text hits pages whose *title* says nothing about gradients
    await expect(rows(page).first()).toContainText("From lines to language models");
  });

  test("sorting by a column header toggles direction", async ({ page }) => {
    await open(page);
    await page.locator("#find-named").fill("*.html");
    await page.locator("#find-now").click();
    await settled(page, /file\(s\) found/);

    const modified = page.locator("#find-rows tr td:nth-child(5)");
    await page.locator('.find-sort[data-sort="date"]').click();
    const oldest = await modified.first().textContent();
    await page.locator('.find-sort[data-sort="date"]').click();
    const newest = await modified.first().textContent();
    expect(oldest < newest).toBe(true);
  });

  test("New Search clears the criteria and the results", async ({ page }) => {
    await open(page);
    await page.locator("#find-named").fill("hello");
    await page.locator("#find-now").click();
    await settled(page, /file\(s\) found/);
    await expect(page.locator("#find-results")).toBeVisible();

    await page.locator("#find-new").click();
    await expect(page.locator("#find-results")).toBeHidden();
    await expect(page.locator("#find-named")).toHaveValue("");
    await expect(status(page)).toHaveText("Ready");
    await expect(page.locator("#find-title")).toHaveText("Find: All Files");
  });

  test("nothing matching says so", async ({ page }) => {
    await open(page);
    await page.locator("#find-named").fill("zzzznope");
    await page.locator("#find-now").click();
    await settled(page, /0 file\(s\) found/);
    await expect(page.locator("#find-empty")).toBeVisible();
  });

  test("tabs are keyboard operable", async ({ page }) => {
    await open(page);
    const nameTab = page.locator("#find-tab-name");
    const dateTab = page.locator("#find-tab-date");
    await nameTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(dateTab).toBeFocused();
    await expect(dateTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#find-pane-date")).toBeVisible();
    await expect(page.locator("#find-pane-name")).toBeHidden();
    await page.keyboard.press("Home");
    await expect(nameTab).toHaveAttribute("aria-selected", "true");
  });
});

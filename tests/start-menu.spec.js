import { test, expect } from "@playwright/test";

test.describe("start menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens and closes from the Start button", async ({ page }) => {
    const startBtn = page.locator("#start-button");
    const menu = page.locator("#start-menu");
    await startBtn.click();
    await expect(menu).toBeVisible();
    await expect(startBtn).toHaveAttribute("aria-expanded", "true");
    await startBtn.click();
    await expect(menu).toBeHidden();
    await expect(startBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("focuses the current page item and supports arrow keys", async ({ page }) => {
    await page.locator("#start-button").click();
    // On the home page, "Home" is aria-current and receives focus.
    await expect(page.getByRole("menuitem", { name: "Home" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Blog" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Shut Down..." })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("menuitem", { name: "Home" })).toBeFocused();
  });

  test("Escape closes the menu and returns focus to Start", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#start-menu")).toBeHidden();
    await expect(page.locator("#start-button")).toBeFocused();
  });

  test("clicking outside closes the menu", async ({ page }) => {
    await page.locator("#start-button").click();
    const vp = page.viewportSize();
    await page.locator("#desktop").click({ position: { x: vp.width - 30, y: 200 } });
    await expect(page.locator("#start-menu")).toBeHidden();
  });

  test("navigates to the blog", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Blog" }).click();
    await expect(page).toHaveURL(/\/blog\/?$/);
  });

  test("shut down shows the screen; any key turns it back on", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Shut Down..." }).click();
    const shutdown = page.locator("#shutdown");
    await expect(shutdown).toBeVisible();
    await expect(shutdown).toContainText("safe to turn off");
    await page.keyboard.press("Enter");
    await expect(shutdown).toBeHidden();
    await expect(page.locator("#start-button")).toBeFocused();
  });
});

test.describe("control panel", () => {
  const open = async (page) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Control Panel" }).click();
    await expect(page.locator("#control-panel")).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens from the start menu with focus on the first control", async ({ page }) => {
    await open(page);
    await expect(page.locator("#cp-width")).toBeFocused();
  });

  test("OK persists settings to localStorage", async ({ page }) => {
    await open(page);
    await page.locator("#cp-width").fill("100");
    await page.locator("#cp-ok").click();
    await expect(page.locator("#control-panel")).toBeHidden();
    const settings = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mf-settings"))
    );
    expect(settings.readingWidth).toBe(100);
    const width = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--reading-width")
    );
    expect(width).toBe("100ch");
  });

  test("Cancel reverts the live preview", async ({ page }) => {
    await open(page);
    await page.locator("#cp-width").fill("100");
    await page.locator("#cp-cancel").click();
    const width = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--reading-width")
    );
    expect(width).toBe("80ch");
  });

  test("Escape closes and focus returns to the Start button", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#control-panel")).toBeHidden();
    // Opener was a start-menu item, hidden by now → falls back to Start.
    await expect(page.locator("#start-button")).toBeFocused();
  });
});

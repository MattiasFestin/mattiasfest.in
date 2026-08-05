import { test, expect, isMobile, showDesktop } from "./helpers.js";

test.describe("home page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads with the main window and taskbar", async ({ page }) => {
    await expect(page).toHaveTitle(/mattiasfest\.in/);
    await expect(page.locator("main.main-window")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible(); // taskbar
    await expect(page.locator("#start-button")).toBeVisible();
    await expect(page.locator("#clock")).not.toHaveText("--:--");
  });

  test("desktop shortcuts: all five on desktop, none on phones", async ({ page }) => {
    const icons = page.locator(".desktop-icon");
    if (isMobile()) {
      // No room for icons on a phone; the Start menu covers navigation
      await expect(icons.first()).toBeHidden();
      await page.locator("#start-button").click();
      for (const item of ["Home", "Blog", "About", "The Internet", "Winamp", "Python.exe"]) {
        await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
      }
      return;
    }
    await expect(icons).toHaveCount(5);
    for (const label of ["My Computer", "My Blog", "About Me", "The Internet", "Winamp"]) {
      await expect(icons.filter({ hasText: label })).toBeVisible();
    }
  });

  test("single click selects an icon, desktop click deselects", async ({ page }) => {
    test.skip(isMobile(), "desktop icons are hidden on phones");
    await showDesktop(page);
    const icon = page.locator(".desktop-icon", { hasText: "My Blog" });
    await icon.click();
    await expect(icon).toHaveClass(/selected/);
    const vp = page.viewportSize();
    await page.locator("#desktop").click({
      /* Middle of the wallpaper: clear of the icon column on the left
         and of the Office Assistant in the bottom-right corner. */
      position: { x: Math.round(vp.width / 2), y: vp.height - 120 },
    });
    await expect(icon).not.toHaveClass(/selected/);
  });

  test("double-clicking About Me navigates to the about page", async ({ page }) => {
    test.skip(isMobile(), "desktop icons are hidden on phones");
    await showDesktop(page);
    await page.locator(".desktop-icon", { hasText: "About Me" }).dblclick();
    await expect(page).toHaveURL(/\/about\/?$/);
    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
  });

  test("Enter on a focused icon launches it (keyboard support)", async ({ page }) => {
    test.skip(isMobile(), "desktop icons are hidden on phones");
    await showDesktop(page);
    await page.locator(".desktop-icon", { hasText: "My Blog" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/blog\/?$/);
  });

  test("skip link jumps to content", async ({ page, browserName }) => {
    // Safari doesn't Tab to links by default; real users press Option+Tab.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    const skip = page.locator(".skip-link");
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#content")).toBeFocused();
  });

  test("no console errors on load", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // GoatCounter/visitor-count requests may fail offline; ignore network noise.
    const real = errors.filter((e) => !/goatcounter|ERR_INTERNET|Failed to load resource/i.test(e));
    expect(real).toEqual([]);
  });
});

test("404 page renders the themed error page", async ({ page }) => {
  const response = await page.goto("/no-such-page/");
  expect(response.status()).toBe(404);
  await expect(page.locator("body")).toContainText(/404|not found/i);
});

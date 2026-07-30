import { test, expect } from "./helpers.js";

/* Faithful '98 title-bar buttons: the authentic 16x14 originals are the
   default on every device, desktop and mobile alike. The pre-paint
   script auto-disables them (2x accessible buttons instead) when the
   browser hints at a visually impaired user - scaled default text,
   forced colors, or a contrast preference. An explicit Control Panel
   choice always wins. */

const closeBtn = (page) =>
  page.locator('main[data-win="main"] .title-bar-controls [aria-label="Close"]');

test.describe("faithful '98 buttons", () => {
  test("authentic small buttons are the default on every device", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/faithful-98/);
    const box = await closeBtn(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(18);
    expect(box.height).toBeLessThanOrEqual(16);
  });

  test("high contrast mode gets the accessible 2x buttons", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "forced-colors emulation is not supported in WebKit");
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/faithful-98/);
    const box = await closeBtn(page).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  });

  test("an explicit user choice beats the detection", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "forced-colors emulation is not supported in WebKit");
    await page.emulateMedia({ forcedColors: "active" });
    await page.addInitScript(() => {
      localStorage.setItem("mf-settings", JSON.stringify({ faithful98: true }));
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/faithful-98/);
  });

  test("unchecking it in the Control Panel switches to 2x buttons", async ({ page }) => {
    await page.goto("/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Control Panel" }).click();
    // The checkbox reflects the effective (default-on) state
    await expect(page.locator("#cp-faithful")).toBeChecked();
    await page.locator('label[for="cp-faithful"]').click();
    await page.locator("#cp-ok").click();
    await expect(page.locator("html")).not.toHaveClass(/faithful-98/);
    const box = await closeBtn(page).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(24);
    // ...and the choice sticks across loads (pre-paint script)
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/faithful-98/);
  });

  test("Defaults button resets the checkbox to the detected default", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("mf-settings", JSON.stringify({ faithful98: false }));
    });
    await page.goto("/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Control Panel" }).click();
    await expect(page.locator("#cp-faithful")).not.toBeChecked();
    await page.locator("#cp-defaults").click();
    await expect(page.locator("#cp-faithful")).toBeChecked();
  });
});

import { test, expect } from "@playwright/test";

test.describe("window management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  const mainWin = (page) => page.locator('main[data-win="main"]');
  const mainTask = (page) => page.locator('.taskbar-task[data-for="main"]');

  test("minimize hides the window and deactivates its taskbar button", async ({ page }) => {
    await mainWin(page).getByRole("button", { name: "Minimize" }).click();
    await expect(mainWin(page)).not.toBeVisible();
    await expect(mainTask(page)).toHaveAttribute("aria-pressed", "false");
    // Focus is parked on the taskbar so keyboard users aren't dropped on <body>
    await expect(mainTask(page)).toBeFocused();
  });

  test("taskbar button restores a minimized window", async ({ page }) => {
    await mainWin(page).getByRole("button", { name: "Minimize" }).click();
    await mainTask(page).click();
    await expect(mainWin(page)).toBeVisible();
    await expect(mainTask(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking the active taskbar button minimizes the window", async ({ page }) => {
    await mainTask(page).click();
    await expect(mainWin(page)).not.toBeVisible();
  });

  test("maximize toggles and relabels to Restore", async ({ page }) => {
    const win = mainWin(page);
    const wasMaximized = await win.evaluate((w) => w.classList.contains("maximized"));
    const btnName = wasMaximized ? "Restore" : "Maximize";
    await win.getByRole("button", { name: btnName }).click();
    if (wasMaximized) {
      await expect(win).not.toHaveClass(/maximized/);
      await expect(win.getByRole("button", { name: "Maximize" })).toBeVisible();
    } else {
      await expect(win).toHaveClass(/maximized/);
      await expect(win.getByRole("button", { name: "Restore" })).toBeVisible();
    }
  });

  test("double-clicking the title bar toggles maximized", async ({ page }) => {
    const win = mainWin(page);
    const before = await win.evaluate((w) => w.classList.contains("maximized"));
    await win.locator(".title-bar-text").dblclick();
    const after = await win.evaluate((w) => w.classList.contains("maximized"));
    expect(after).toBe(!before);
  });

  test("close hides the window and its taskbar button", async ({ page }) => {
    await mainWin(page).getByRole("button", { name: "Close" }).click();
    await expect(mainWin(page)).not.toBeVisible();
    await expect(mainTask(page)).toBeHidden();
  });

  test("dragging the title bar moves the window", async ({ page }) => {
    const win = mainWin(page);
    // A maximized window can't be dragged; restore it first if needed.
    if (await win.evaluate((w) => w.classList.contains("maximized"))) {
      await win.getByRole("button", { name: "Restore" }).click();
    }
    const bar = win.locator(".title-bar-text");
    const before = await win.boundingBox();
    const barBox = await bar.boundingBox();
    await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(barBox.x + barBox.width / 2 + 120, barBox.y + barBox.height / 2 + 60, { steps: 5 });
    await page.mouse.up();
    const after = await win.boundingBox();
    expect(Math.round(after.x - before.x)).toBe(120);
    expect(Math.round(after.y - before.y)).toBe(60);
  });
});

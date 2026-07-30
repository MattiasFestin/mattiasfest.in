import { test, expect, launchApp, SLOW } from "./helpers.js";

/* Winamp is triple-lazy: nothing on page load, winamp.js on first open,
   which in turn pulls the ~900 KB Webamp bundle. These tests pin both
   the laziness and the player lifecycle. */

const openWinamp = async (page) => {
  await launchApp(page, "Winamp", "#menu-winamp");
  // #webamp itself is a zero-size wrapper; assert on the player window.
  // Webamp's main window renders once the skin has loaded. Boot fetches
  // and evaluates the ~900 KB bundle, so allow a bit more than default.
  await expect(page.locator("#webamp #main-window")).toBeVisible({ timeout: 5_000 * SLOW });
};

test.describe("winamp", () => {
  test("is not loaded on page load (lazy)", async ({ page }) => {
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const eager = requests.filter((u) => /winamp|webamp/i.test(u));
    expect(eager).toEqual([]);
  });

  test("opens centered, loads the bundle, and streams nothing until play", async ({ page }) => {
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/");
    await openWinamp(page);

    // Both lazy scripts were fetched on demand
    expect(requests.some((u) => /\/winamp.*\.js/.test(u))).toBe(true);
    expect(requests.some((u) => /\/webamp\/webamp\.bundle/.test(u))).toBe(true);
    // ...and at most a metadata preload of the *current* track: the
    // browser's media element preloads track 1 when Webamp renders, but
    // the other 11 must not be touched until someone actually plays.
    // Count distinct *tracks*, not URLs: archive.org redirects
    // /download/... to a node host (ia*.us.archive.org), so one track
    // legitimately shows up as two request URLs.
    const tracks = new Set(
      requests
        .filter((u) => /\.mp3(\?|$)/i.test(u))
        .map((u) => decodeURIComponent(u.split("?")[0].split("/").pop()))
    );
    expect(tracks.size).toBeLessThanOrEqual(1);
    if (tracks.size) {
      expect([...tracks][0]).toContain("Monstrous_Turtles"); // track 1 only
    }

    // Taskbar button appears and is active
    const task = page.locator('.taskbar-task[data-for="winamp"]');
    await expect(task).toBeVisible();
    await expect(task).toHaveAttribute("aria-pressed", "true");

    // Centered on the desktop (viewport minus taskbar)
    const main = await page.locator("#webamp #main-window").boundingBox();
    const viewport = page.viewportSize();
    const centerX = main.x + main.width / 2;
    expect(Math.abs(centerX - viewport.width / 2)).toBeLessThan(150);
  });

  test("has the OC ReMix playlist loaded", async ({ page }) => {
    await page.goto("/");
    await openWinamp(page);
    const text = await page.locator("#webamp #playlist-window").textContent();
    expect(text).toContain("OC ReMix");
    expect(text).toMatch(/Donkey Kong|Mario|Mega Man/);
  });

  test("taskbar button minimizes and restores the player", async ({ page }) => {
    await page.goto("/");
    await openWinamp(page);
    const task = page.locator('.taskbar-task[data-for="winamp"]');

    await task.click(); // active → minimize
    await expect(page.locator("#webamp #main-window")).toBeHidden();
    await expect(task).toBeVisible(); // still on the taskbar
    await expect(task).toHaveAttribute("aria-pressed", "false");

    await task.click(); // restore
    await expect(page.locator("#webamp #main-window")).toBeVisible();
    await expect(task).toHaveAttribute("aria-pressed", "true");
  });

  test("closing winamp removes its taskbar button", async ({ page }) => {
    await page.goto("/");
    await openWinamp(page);
    await page.locator("#webamp #main-window #close").click();
    await expect(page.locator("#webamp #main-window")).toBeHidden();
    await expect(page.locator('.taskbar-task[data-for="winamp"]')).toBeHidden();
  });

  test("opening another page keeps winamp playing and the desktop intact", async ({ page }) => {
    // Regression guard: open Winamp, then go to About Me. Pages open in
    // the main window without reloading the desktop, so the player is
    // still running afterwards — and the about page must lay out cleanly.
    await page.goto("/");
    await openWinamp(page);
    await page.evaluate(() => {
      window.__stillHere = true;
    });
    await launchApp(page, "About Me", 'a[role="menuitem"][href*="about"]');
    await expect(page).toHaveURL(/\/about\/?$/);

    await expect(page.getByRole("heading", { name: "About Me" })).toBeVisible();
    await expect(page.locator("main.main-window")).toBeVisible();
    await expect(page.locator(".desktop-icon")).toHaveCount(5);
    // Same document, same player: nothing was reloaded
    expect(await page.evaluate(() => window.__stillHere)).toBe(true);
    await expect(page.locator("#webamp #main-window")).toBeVisible();
    await expect(page.locator(".winamp-host")).toHaveCount(1);
    await expect(page.locator('.taskbar-task[data-for="winamp"]')).toBeVisible();
    // No layout breakage: nothing overflows the viewport horizontally
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
    // The taskbar still hugs the bottom edge
    const taskbar = await page.locator("footer.taskbar").boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round(taskbar.y + taskbar.height)).toBe(viewport.height);
  });
});

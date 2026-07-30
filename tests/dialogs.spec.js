import { test, expect } from "@playwright/test";
import { launchApp, SLOW } from "./helpers.js";

/* Popup dialogs are the top layer of the desktop metaphor: whatever is
   open - app windows, an always-on-top Winamp, the Start menu - a
   dialog that asks the user something must be visible and clickable.
   The service worker's "a new version is installed" prompt is the one
   that can appear unannounced, over whatever the user had open. */

/* Is the element actually the thing you'd hit at its own centre?
   Returns what got hit instead, for a useful failure message. */
const topAt = (page, id) =>
  page.evaluate((sel) => {
    const d = document.getElementById(sel);
    const r = d.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (d.contains(hit)) return "the dialog";
    if (!hit) return "nothing";
    const win = hit.closest("[data-win], .winamp-host, #webamp, .start-menu");
    return "covered by " + (win ? win.id || win.dataset.win || win.className : hit.tagName);
  }, id);

/* Show a dialog the way the app does, without needing its trigger. */
const showDialog = (page, id) =>
  page.evaluate((sel) => {
    document.getElementById(sel).hidden = false;
  }, id);

test.describe("dialog stacking", () => {
  test("the update prompt sits above app windows", async ({ page }) => {
    await page.goto("/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Python.exe" }).click();
    await expect(page.locator('[data-win="pyedit"]')).toBeVisible();

    await showDialog(page, "update-dialog");
    expect(await topAt(page, "update-dialog")).toBe("the dialog");
  });

  test("the update prompt sits above Winamp (which is always-on-top)", async ({ page }) => {
    await page.goto("/");
    await launchApp(page, "Winamp", "#menu-winamp");
    await expect(page.locator("#webamp #main-window")).toBeVisible({ timeout: 5_000 * SLOW });

    await showDialog(page, "update-dialog");
    expect(await topAt(page, "update-dialog")).toBe("the dialog");
  });

  test("the update prompt sits above the Start menu", async ({ page }) => {
    await page.goto("/");
    await page.locator("#start-button").click();
    await expect(page.locator("#start-menu")).toBeVisible();

    await showDialog(page, "update-dialog");
    expect(await topAt(page, "update-dialog")).toBe("the dialog");
  });

  test("the update prompt sits above other alert dialogs", async ({ page }) => {
    /* The regression: the prompt shared a z-index with the other alert
       dialogs and sits earlier in the DOM, so any of them covered it.
       A new version can land while the user is looking at any dialog. */
    await page.goto("/");
    await showDialog(page, "winamp-dialog");
    await showDialog(page, "update-dialog");
    expect(await topAt(page, "update-dialog")).toBe("the dialog");
  });

  test("the update prompt survives a real Winamp failure dialog", async ({ page }) => {
    // Same situation, reached the way a user would: Winamp fails to
    // load, its error dialog opens, then the new version announces.
    await page.route("**/webamp/webamp.bundle*", (route) => route.abort());
    await page.goto("/");
    await launchApp(page, "Winamp", "#menu-winamp");
    await expect(page.locator("#winamp-dialog")).toBeVisible({ timeout: 5_000 * SLOW });

    await showDialog(page, "update-dialog");
    expect(await topAt(page, "update-dialog")).toBe("the dialog");
  });

  test("every popup dialog outranks every window", async ({ page }) => {
    await page.goto("/");
    const stack = await page.evaluate(() => {
      const z = (el) => parseInt(getComputedStyle(el).zIndex, 10) || 0;
      const dialogs = [...document.querySelectorAll(".popup-dialog")].map((d) => ({
        id: d.id,
        z: z(d),
      }));
      const windows = [...document.querySelectorAll(".app-window")].map((w) => z(w));
      const host = document.querySelector(".winamp-host");
      return {
        lowestDialog: Math.min(...dialogs.map((d) => d.z)),
        highestWindow: Math.max(...windows, host ? z(host) : 0),
        dialogs,
      };
    });
    expect(stack.lowestDialog).toBeGreaterThan(stack.highestWindow);
  });

  test("the update prompt outranks every other dialog", async ({ page }) => {
    await page.goto("/");
    const z = await page.evaluate(() => {
      const zi = (el) => parseInt(getComputedStyle(el).zIndex, 10) || 0;
      const update = document.getElementById("update-dialog");
      const others = [...document.querySelectorAll(".popup-dialog")].filter(
        (d) => d.id !== "update-dialog"
      );
      return { update: zi(update), highestOther: Math.max(...others.map(zi)) };
    });
    expect(z.update).toBeGreaterThan(z.highestOther);
  });
});

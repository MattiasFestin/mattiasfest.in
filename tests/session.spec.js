import { test, expect, launchApp, SLOW } from "./helpers.js";

/* Long multi-app sessions. Individual window operations are covered in
   windows.spec.js; these drive several apps at once - opening,
   focusing, minimizing, maximizing, dragging, closing - and check the
   desktop's invariants after every step, which is where compound
   window-management bugs hide. */

/* A snapshot of every window and taskbar button. */
const desktop = (page) =>
  page.evaluate(() => {
    const wins = [...document.querySelectorAll(".app-window")].map((w) => ({
      id: w.dataset.win,
      closed: w.classList.contains("closed"),
      minimized: w.classList.contains("minimized"),
      maximized: w.classList.contains("maximized"),
      front: w.classList.contains("front"),
    }));
    const tasks = [...document.querySelectorAll(".taskbar-task")].map((b) => ({
      for: b.dataset.for,
      hidden: b.hidden,
      pressed: b.getAttribute("aria-pressed") === "true",
      active: b.classList.contains("active"),
    }));
    return { wins, tasks };
  });

/* Rules the desktop must never break, whatever the user did to get here. */
const expectConsistent = (s, step) => {
  const info = (msg) => `${msg} (after: ${step})`;
  const shown = s.wins.filter((w) => !w.closed && !w.minimized);

  // At most one window is focused, and it is actually on screen.
  const front = shown.filter((w) => w.front);
  expect(front.length, info("more than one window claims focus")).toBeLessThanOrEqual(1);

  // At most one taskbar button is pressed, and it isn't a hidden one.
  const pressed = s.tasks.filter((t) => t.pressed);
  expect(pressed.length, info("more than one taskbar button is pressed")).toBeLessThanOrEqual(1);
  for (const t of pressed) {
    expect(t.hidden, info(`hidden taskbar button "${t.for}" is pressed`)).toBe(false);
  }

  // aria-pressed must mirror the visual .active class, for screen readers.
  for (const t of s.tasks) {
    expect(t.pressed, info(`aria-pressed out of sync for "${t.for}"`)).toBe(t.active);
  }

  // The focused window's button is the pressed one.
  if (front.length) {
    expect(pressed[0]?.for, info("focused window is not the pressed task")).toBe(front[0].id);
  }

  // A button is shown exactly when its window is open.
  for (const w of s.wins) {
    const btn = s.tasks.find((t) => t.for === w.id);
    if (!btn) continue;
    expect(btn.hidden, info(`taskbar button "${w.id}" visibility wrong`)).toBe(w.closed);
  }

  // Something is on screen ⇒ something has focus.
  if (shown.length) {
    const anyPressed = s.tasks.some((t) => t.pressed);
    expect(anyPressed, info("windows are open but nothing is focused")).toBe(true);
  }
};

/* Is this window the thing you'd actually click at its own centre? */
const visiblyOnTop = (page, id) =>
  page.evaluate((win) => {
    const w = document.querySelector(`[data-win="${win}"]`);
    const r = w.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2));
    if (w.contains(hit)) return "itself";
    const other = hit && hit.closest("[data-win]");
    return other ? `covered by ${other.dataset.win}` : "covered by something else";
  }, id);

const check = async (page, step) => expectConsistent(await desktop(page), step);

/* Bring a window to the front the way a user would, without toggling a
   window that is already focused down into the taskbar. */
const raise = async (page, id) => {
  const btn = page.locator(`.taskbar-task[data-for="${id}"]`);
  if ((await btn.getAttribute("aria-pressed")) !== "true") await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
};

test.describe("multi-app session", () => {
  test("a long session of opening, focusing and closing keeps state sane", async ({ page }) => {
    await page.goto("/");
    await check(page, "load");

    // Open the editor, then the browser: each takes focus as it opens.
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Python.exe" }).click();
    await expect(page.locator('[data-win="pyedit"]')).toBeVisible();
    await check(page, "open editor");
    expect((await desktop(page)).wins.find((w) => w.id === "pyedit").front).toBe(true);

    await page.route("**://web.archive.org/**", (r) => r.fulfill({ contentType: "text/html", body: "<html></html>" }));
    await page.addInitScript(() => localStorage.setItem("mf-settings", JSON.stringify({ modemSound: false })));
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "The Internet" }).click();
    await expect(page.locator('[data-win="browser"]')).toBeVisible();
    await check(page, "open browser");

    // Cycle focus through the taskbar.
    for (const id of ["main", "pyedit", "browser", "main"]) {
      await page.locator(`.taskbar-task[data-for="${id}"]`).click();
      await check(page, `focus ${id}`);
      expect((await desktop(page)).wins.find((w) => w.id === id).front).toBe(true);
    }

    // Minimize the focused window: focus must move to something visible.
    await page.locator('.taskbar-task[data-for="main"]').click(); // active → minimize
    await check(page, "minimize main via taskbar");
    expect((await desktop(page)).wins.find((w) => w.id === "main").minimized).toBe(true);

    // Restore it again.
    await page.locator('.taskbar-task[data-for="main"]').click();
    await check(page, "restore main");
    expect((await desktop(page)).wins.find((w) => w.id === "main").front).toBe(true);

    // Close windows one by one; focus should fall back each time.
    for (const id of ["pyedit", "browser", "main"]) {
      await raise(page, id);
      await page.locator(`[data-win="${id}"]`).getByRole("button", { name: "Close" }).click();
      await check(page, `close ${id}`);
    }

    // Everything closed: nothing focused, no stray taskbar buttons.
    const end = await desktop(page);
    expect(end.wins.every((w) => w.closed)).toBe(true);
    expect(end.tasks.every((t) => t.hidden)).toBe(true);
  });

  test("a maximized window never covers the window you just focused", async ({ page }) => {
    await page.goto("/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Python.exe" }).click();
    const editor = page.locator('[data-win="pyedit"]');
    await expect(editor).toBeVisible();

    // Maximize the editor, then switch back to the main window.
    await editor.getByRole("button", { name: "Maximize" }).click();
    await expect(editor).toHaveClass(/maximized/);
    await page.locator('.taskbar-task[data-for="main"]').click();
    await check(page, "focus main behind a maximized editor");

    // Focus without visibility is a lie: the main window must be usable.
    expect(await visiblyOnTop(page, "main")).toBe("itself");
  });

  test("minimizing a maximized window keeps it maximized when restored", async ({ page }) => {
    await page.goto("/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Python.exe" }).click();
    const editor = page.locator('[data-win="pyedit"]');
    await expect(editor).toBeVisible();

    await editor.getByRole("button", { name: "Maximize" }).click();
    await editor.getByRole("button", { name: "Minimize" }).click();
    await check(page, "minimize a maximized editor");
    await page.locator('.taskbar-task[data-for="pyedit"]').click();
    await check(page, "restore a maximized editor");
    await expect(editor).toHaveClass(/maximized/);
    // Its button still says Restore, matching its state.
    await expect(editor.getByRole("button", { name: "Restore" })).toBeVisible();
  });

  test("a dragged window keeps its position through focus changes", async ({ page }) => {
    test.skip(test.info().project.name.includes("mobile"), "windows are maximized on phones");
    await page.goto("/");
    const main = page.locator('main[data-win="main"]');
    if (await main.evaluate((w) => w.classList.contains("maximized"))) {
      await main.getByRole("button", { name: "Restore" }).click();
    }

    // Drag the main window somewhere distinctive.
    const bar = main.locator(".title-bar-text");
    const box = await bar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    const moved = await main.boundingBox();

    // Open another app, focus it, come back: the position must survive.
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Python.exe" }).click();
    await expect(page.locator('[data-win="pyedit"]')).toBeVisible();
    await page.locator('.taskbar-task[data-for="main"]').click();
    await check(page, "refocus a dragged window");

    const after = await main.boundingBox();
    expect(Math.round(after.x)).toBe(Math.round(moved.x));
    expect(Math.round(after.y)).toBe(Math.round(moved.y));
    expect(await visiblyOnTop(page, "main")).toBe("itself");
  });

  test("Winamp and regular windows trade focus cleanly", async ({ page }) => {
    await page.goto("/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Python.exe" }).click();
    await expect(page.locator('[data-win="pyedit"]')).toBeVisible();

    await launchApp(page, "Winamp", "#menu-winamp");
    await expect(page.locator("#webamp #main-window")).toBeVisible({ timeout: 5_000 * SLOW });
    await check(page, "open winamp over the editor");
    // Winamp has focus, so no app window should claim it.
    const withWinamp = await desktop(page);
    expect(withWinamp.wins.some((w) => w.front)).toBe(false);
    expect(withWinamp.tasks.find((t) => t.for === "winamp").pressed).toBe(true);

    // Back to the editor, then back to Winamp via the taskbar.
    await page.locator('.taskbar-task[data-for="pyedit"]').click();
    await check(page, "focus editor while winamp is open");
    expect((await desktop(page)).tasks.find((t) => t.for === "winamp").pressed).toBe(false);

    await page.locator('.taskbar-task[data-for="winamp"]').click();
    await check(page, "focus winamp again");
    await expect(page.locator("#webamp #main-window")).toBeVisible();

    // Closing Winamp hands focus back to a real window.
    await page.locator("#webamp #main-window #close").click();
    await check(page, "close winamp");
    await expect(page.locator('.taskbar-task[data-for="winamp"]')).toBeHidden();
    expect((await desktop(page)).wins.some((w) => w.front)).toBe(true);
  });
});

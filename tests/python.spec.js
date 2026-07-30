import { test, expect } from "@playwright/test";
import { SLOW } from "./helpers.js";

/* Python.exe: lazy-loaded editor (editor.js) + Pyodide runtime in a
   worker (pyworker.js → jsDelivr CDN). UI tests stub the worker so they
   are fast, deterministic, and offline; one chromium-only test boots the
   real runtime end-to-end. */

const editorWin = (page) => page.locator('[data-win="pyedit"]');
const code = (page) => page.locator("#pyedit-code");

/* A worker that loads but never answers: the editor UI works fully
   while the runtime status stays parked on "Downloading…". */
const stubRuntime = (page) =>
  page.route("**/pyworker.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "/* stub runtime */" })
  );

const openFromStartMenu = async (page) => {
  await page.locator("#start-button").click();
  await page.getByRole("menuitem", { name: "Python.exe" }).click();
  await expect(editorWin(page)).toBeVisible();
};

const caretState = (page) =>
  code(page).evaluate((el) => ({
    start: el.selectionStart,
    end: el.selectionEnd,
    top: el.scrollTop,
    left: el.scrollLeft,
  }));

test.describe("python editor", () => {
  test.beforeEach(async ({ page }) => {
    await stubRuntime(page);
    await page.goto("/");
  });

  test("editor.js is lazy: fetched on first open, not on page load", async ({ page }) => {
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => /editor.*\.js/.test(u))).toEqual([]);
    await openFromStartMenu(page);
    expect(requests.some((u) => /editor.*\.js/.test(u))).toBe(true);
  });

  test("opens with the welcome buffer, focused, cursor at top-left", async ({ page }) => {
    await openFromStartMenu(page);
    await expect(editorWin(page).locator(".title-bar-text")).toHaveText("untitled.py - Python.exe");
    await expect(code(page)).toHaveValue(/Welcome to Python\.exe[\s\S]*Hello, World!/);
    await expect(code(page)).toBeFocused();
    expect(await caretState(page)).toEqual({ start: 0, end: 0, top: 0, left: 0 });
    // Taskbar button appears and is the active window
    const task = page.locator('.taskbar-task[data-for="pyedit"]');
    await expect(task).toBeVisible();
    await expect(task).toHaveAttribute("aria-pressed", "true");
  });

  test("syntax highlighting tokenizes keywords, strings, comments, numbers", async ({ page }) => {
    await openFromStartMenu(page);
    await code(page).fill('# a comment\ndef f():\n    return "hi" + str(42)\n');
    const hl = page.locator("#pyedit-highlight");
    await expect(hl.locator(".tok-comment")).toHaveText("# a comment");
    await expect(hl.locator(".tok-keyword")).toHaveText(["def", "return"]);
    await expect(hl.locator(".tok-string")).toHaveText('"hi"');
    await expect(hl.locator(".tok-number")).toHaveText("42");
  });

  test("gutter tracks line numbers as you type", async ({ page }) => {
    await openFromStartMenu(page);
    await code(page).fill("a = 1\nb = 2\nc = 3");
    await expect(page.locator("#pyedit-gutter")).toHaveText(/^1\s*2\s*3\s*$/);
  });

  test("Tab inserts four spaces instead of leaving the field", async ({ page }) => {
    await openFromStartMenu(page);
    await code(page).fill("x");
    await code(page).press("End");
    await code(page).press("Tab");
    await expect(code(page)).toHaveValue("x    ");
    await expect(code(page)).toBeFocused();
  });

  test("File > New clears the buffer", async ({ page }) => {
    await openFromStartMenu(page);
    await page.locator("#pyedit-file-btn").click();
    await expect(page.locator("#pyedit-file-menu")).toBeVisible();
    await page.locator("#pyedit-file-new").click();
    await expect(page.locator("#pyedit-file-menu")).toBeHidden();
    await expect(code(page)).toHaveValue("");
    await expect(editorWin(page).locator(".title-bar-text")).toHaveText("untitled.py - Python.exe");
    await expect(page.locator("#pyedit-status")).toHaveText("New file");
  });

  test("Save As saves to the virtual C:\\ drive and appends .py", async ({ page }) => {
    await openFromStartMenu(page);
    await code(page).fill("print(1)");
    await page.locator("#pyedit-file-btn").click();
    await page.locator("#pyedit-file-save").click(); // unsaved buffer → Save As
    const dlg = page.locator("#pyedit-saveas-dialog");
    await expect(dlg).toBeVisible();
    await expect(page.locator("#pyedit-saveas-name")).toBeFocused();
    await page.locator("#pyedit-saveas-name").fill("demo");
    await page.locator("#pyedit-saveas-ok").click();
    await expect(dlg).toBeHidden();
    await expect(editorWin(page).locator(".title-bar-text")).toHaveText("demo.py - Python.exe");
    await expect(page.locator("#pyedit-status")).toHaveText("Saved C:\\demo.py");
    const files = await page.evaluate(() => JSON.parse(localStorage.getItem("mf-pyfiles")));
    expect(files["demo.py"]).toBe("print(1)");
    // Focus returns to the code for immediate typing
    await expect(code(page)).toBeFocused();
  });

  test("Ctrl+S on a saved file saves silently", async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem("mf-pyfiles", JSON.stringify({ "work.py": "old" }))
    );
    await openFromStartMenu(page);
    // Open work.py, edit, Ctrl+S
    await page.locator("#pyedit-file-btn").click();
    await page.locator("#pyedit-file-open").click();
    await page.locator("#pyedit-open-list").selectOption("work.py");
    await page.locator("#pyedit-open-ok").click();
    await code(page).fill("new = True");
    await code(page).press("Control+s");
    await expect(page.locator("#pyedit-status")).toHaveText("Saved C:\\work.py");
    const files = await page.evaluate(() => JSON.parse(localStorage.getItem("mf-pyfiles")));
    expect(files["work.py"]).toBe("new = True");
  });

  test("saving over another existing file asks before replacing", async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem("mf-pyfiles", JSON.stringify({ "taken.py": "original" }))
    );
    await openFromStartMenu(page);
    await code(page).fill("intruder");
    await page.locator("#pyedit-file-btn").click();
    await page.locator("#pyedit-file-saveas").click();
    await page.locator("#pyedit-saveas-name").fill("taken.py");
    await page.locator("#pyedit-saveas-ok").click();

    const warn = page.locator("#pyedit-overwrite-dialog");
    await expect(warn).toBeVisible();
    await expect(warn).toContainText("C:\\taken.py already exists");

    // "No" goes back to Save As to pick another name
    await page.locator("#pyedit-overwrite-no").click();
    await expect(warn).toBeHidden();
    await expect(page.locator("#pyedit-saveas-name")).toBeFocused();

    // "Yes" replaces the file
    await page.locator("#pyedit-saveas-ok").click();
    await page.locator("#pyedit-overwrite-yes").click();
    const files = await page.evaluate(() => JSON.parse(localStorage.getItem("mf-pyfiles")));
    expect(files["taken.py"]).toBe("intruder");
    await expect(editorWin(page).locator(".title-bar-text")).toHaveText("taken.py - Python.exe");
  });

  test("Open lists files sorted, loads one with the cursor at top-left", async ({ page }) => {
    const body = "line1 = 1\nline2 = 2\n";
    await page.evaluate((src) =>
      localStorage.setItem("mf-pyfiles", JSON.stringify({ "b.py": src, "a.py": "pass" })),
      body
    );
    await openFromStartMenu(page);
    await code(page).press("End"); // move the caret away from home first
    await page.locator("#pyedit-file-btn").click();
    await page.locator("#pyedit-file-open").click();
    const list = page.locator("#pyedit-open-list");
    await expect(list).toBeFocused();
    await expect(list.locator("option")).toHaveText(["a.py", "b.py"]); // sorted
    await list.selectOption("b.py");
    await page.locator("#pyedit-open-ok").click();
    await expect(code(page)).toHaveValue(body);
    await expect(editorWin(page).locator(".title-bar-text")).toHaveText("b.py - Python.exe");
    await expect(code(page)).toBeFocused();
    expect(await caretState(page)).toEqual({ start: 0, end: 0, top: 0, left: 0 });
  });

  test("Delete removes a file; an empty drive disables the list", async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem("mf-pyfiles", JSON.stringify({ "gone.py": "x" }))
    );
    await openFromStartMenu(page);
    await page.locator("#pyedit-file-btn").click();
    await page.locator("#pyedit-file-open").click();
    await page.locator("#pyedit-open-delete").click();
    await expect(page.locator("#pyedit-status")).toHaveText("Deleted C:\\gone.py");
    const list = page.locator("#pyedit-open-list");
    await expect(list).toBeDisabled();
    await expect(list.locator("option")).toHaveText(["(no files on C:\\)"]);
    const files = await page.evaluate(() => JSON.parse(localStorage.getItem("mf-pyfiles")));
    expect(files).toEqual({});
    await page.locator("#pyedit-open-cancel").click();
    await expect(page.locator("#pyedit-open-dialog")).toBeHidden();
  });

  test("Escape closes the editor dialogs", async ({ page }) => {
    await openFromStartMenu(page);
    await page.locator("#pyedit-file-btn").click();
    await page.locator("#pyedit-file-saveas").click();
    await expect(page.locator("#pyedit-saveas-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pyedit-saveas-dialog")).toBeHidden();
  });

  test("Clear output empties the pane and resets the status", async ({ page }) => {
    await openFromStartMenu(page);
    await page.evaluate(() => {
      document.getElementById("pyedit-output").textContent = "stale output";
    });
    await page.locator("#pyedit-clear").click();
    await expect(page.locator("#pyedit-output")).toHaveText("");
    await expect(page.locator("#pyedit-status")).toHaveText("Ready");
  });

  test("closing the editor window hides its taskbar button", async ({ page }) => {
    await openFromStartMenu(page);
    await editorWin(page).getByRole("button", { name: "Close" }).click();
    await expect(editorWin(page)).not.toBeVisible();
    await expect(page.locator('.taskbar-task[data-for="pyedit"]')).toBeHidden();
  });
});

test.describe("try me buttons", () => {
  test.beforeEach(async ({ page }) => {
    await stubRuntime(page);
    await page.goto("/blog/python-exe/");
  });

  test("every python code block gets one", async ({ page }) => {
    const blocks = await page.locator('#content pre > code[data-lang="python"]').count();
    expect(blocks).toBeGreaterThan(0);
    await expect(page.locator("#content .tryme-btn")).toHaveCount(blocks);
  });

  test("opens the editor with the snippet, cursor at top-left", async ({ page }) => {
    const snippet = await page
      .locator('#content pre > code[data-lang="python"]')
      .first()
      .textContent();
    await page.locator("#content .tryme-btn").first().click();
    await expect(editorWin(page)).toBeVisible();
    await expect(code(page)).toHaveValue(snippet.replace(/\n$/, ""));
    await expect(editorWin(page).locator(".title-bar-text")).toHaveText("untitled.py - Python.exe");
    await expect(page.locator("#pyedit-output")).toHaveText("");
    await expect(code(page)).toBeFocused();
    expect(await caretState(page)).toEqual({ start: 0, end: 0, top: 0, left: 0 });
  });
});

test("a broken runtime download reports a friendly error", async ({ page }) => {
  await page.route("**/pyworker.js", (route) => route.abort());
  await page.goto("/");
  await page.locator("#start-button").click();
  await page.getByRole("menuitem", { name: "Python.exe" }).click();
  await expect(page.locator("#pyedit-status")).toHaveText(
    "Failed to load Python — check your connection"
  );
});

test("runs real Python via Pyodide @external", async ({ page }) => {
  test.skip(
    test.info().project.name !== "chromium",
    "the runtime is engine-independent; once is enough"
  );
  /* The only test that leaves the machine: it downloads a genuine
     ~10 MB runtime from a CDN and boots it while the other browser
     projects run in parallel, so it gets its own generous budget
     (scaled again on slower, busier CI runners). Tagged @external so
     the deploy gate can exclude it - a CDN hiccup must never block
     publishing a post. */
  test.setTimeout(180_000 * SLOW);
  const boot = 120_000 * SLOW;
  const run = 60_000 * SLOW;

  await page.goto("/");
  await page.locator("#start-button").click();
  await page.getByRole("menuitem", { name: "Python.exe" }).click();
  await expect(page.locator("#pyedit-status")).toHaveText("Ready", { timeout: boot });

  // Run the welcome program with F5
  await code(page).press("F5");
  await expect(page.locator("#pyedit-output")).toContainText("Hello, World!", { timeout: run });
  await expect(page.locator("#pyedit-status")).toHaveText(/Done in \d+ ms/, { timeout: run });

  // Errors surface as tracebacks, not silence
  await code(page).fill("boom(");
  await page.locator("#pyedit-run").click();
  await expect(page.locator("#pyedit-output")).toContainText("SyntaxError", { timeout: run });
  await expect(page.locator("#pyedit-status")).toHaveText("Error — see output", { timeout: run });
});

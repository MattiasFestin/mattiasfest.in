import { test, expect, isMobile, rightClickDesktop, SLOW } from "./helpers.js";

/* Desktop context menu, screen saver and the Office Assistant. */

test.describe("desktop context menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens on right-click of the desktop background", async ({ page }) => {
    const menu = page.locator("#desktop-menu");
    await expect(menu).toBeHidden();
    await rightClickDesktop(page);
    await expect(menu).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Paste", exact: true })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  test("leaves the native menu alone inside a window", async ({ page }) => {
    await page
      .locator('main[data-win="main"] .window-body')
      .click({ button: "right", position: { x: 20, y: 20 } });
    await expect(page.locator("#desktop-menu")).toBeHidden();
  });

  test("Escape closes it", async ({ page }) => {
    await rightClickDesktop(page);
    await expect(page.locator("#desktop-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#desktop-menu")).toBeHidden();
  });

  test("clicking elsewhere closes it", async ({ page }) => {
    await rightClickDesktop(page);
    await expect(page.locator("#desktop-menu")).toBeVisible();
    await page.locator("#start-button").click();
    await expect(page.locator("#desktop-menu")).toBeHidden();
  });

  test("stays on screen when opened near the bottom-right corner", async ({ page }) => {
    const vp = page.viewportSize();
    await rightClickDesktop(page, "bottom-right");
    const menu = page.locator("#desktop-menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  });

  test("Arrange Icons by Name sorts the shortcuts", async ({ page }) => {
    /* Desktop icons are hidden on phones; there is nothing to arrange. */
    test.skip(isMobile(), "no desktop icons on small screens");
    const labels = () =>
      page.locator(".desktop-icon .desktop-icon-label").allTextContents();
    const before = await labels();
    await rightClickDesktop(page);
    await page.getByRole("menuitem", { name: "Arrange Icons by Name" }).click();
    const after = await labels();
    expect(after).toEqual([...before].sort((a, b) => a.localeCompare(b)));

    await rightClickDesktop(page);
    await page.getByRole("menuitem", { name: "Line up Icons" }).click();
    expect(await labels()).toEqual(before);
  });

  test("Properties opens the Control Panel on the screen saver", async ({ page }) => {
    await rightClickDesktop(page);
    await page.getByRole("menuitem", { name: "Properties" }).click();
    await expect(page.locator("#control-panel")).toBeVisible();
    await expect(page.locator("#cp-saver")).toBeFocused();
  });
});

test.describe("screen saver", () => {
  const openControlPanel = async (page) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Control Panel" }).click();
    await expect(page.locator("#control-panel")).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Preview starts it and any input dismisses it", async ({ page }) => {
    await openControlPanel(page);
    await page.locator("#cp-saver-preview").click();
    const canvas = page.locator("#screensaver");
    await expect(canvas).toBeVisible();
    /* screensaver.js ignores input for the first 400ms so the click that
       started it can't immediately kill it. */
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await expect(canvas).toBeHidden();
  });

  test("the chosen mode and wait persist", async ({ page }) => {
    await openControlPanel(page);
    await page.locator("#cp-saver").selectOption("mystify");
    await page.locator("#cp-saver-wait").fill("12");
    await page.locator("#cp-ok").click();
    await expect(page.locator("#control-panel")).toBeHidden();
    const settings = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mf-settings"))
    );
    expect(settings.screensaver).toBe("mystify");
    expect(settings.screensaverWait).toBe(12);
  });

  test("loads nothing until it is actually needed", async ({ page }) => {
    /* The whole point of lazy-loading it: a reader who never idles
       never pays for the saver. */
    await expect(page.locator("#screensaver")).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.MFScreensaver)).toBe("undefined");

    await openControlPanel(page);
    await page.locator("#cp-saver-preview").click();
    await expect(page.locator("#screensaver")).toBeVisible();
  });

  test("'(None)' still previews, so the button is never a dead end", async ({ page }) => {
    await openControlPanel(page);
    await page.locator("#cp-saver").selectOption("none");
    await page.locator("#cp-saver-preview").click();
    await expect(page.locator("#screensaver")).toBeVisible();
  });
});

test.describe("office assistant", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Start > Help summons it and it says something", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    const assistant = page.locator("#assistant");
    await expect(assistant).toBeVisible();
    await expect(page.locator("#assistant-balloon")).toBeVisible();
    await expect(page.locator("#assistant-text")).not.toBeEmpty();
  });

  test("clicking the clip toggles a tip", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    const balloon = page.locator("#assistant-balloon");
    await expect(balloon).toBeVisible();
    await page.locator("#assistant-clip").click();
    await expect(balloon).toBeHidden();
    await page.locator("#assistant-clip").click();
    await expect(balloon).toBeVisible();
  });

  test("Escape closes the balloon but keeps the clip", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant-balloon")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#assistant-balloon")).toBeHidden();
    await expect(page.locator("#assistant")).toBeVisible();
  });

  test("dismissing it sticks across reloads", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();
    await page.locator("#assistant-close").click();
    await expect(page.locator("#assistant")).toBeHidden();

    const settings = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mf-settings"))
    );
    expect(settings.assistant).toBe(false);

    await page.reload();
    await expect(page.locator("#assistant")).toBeHidden();
    /* And the Control Panel agrees. */
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Control Panel" }).click();
    await expect(page.locator("#cp-assistant")).not.toBeChecked();
  });

  test("the Control Panel can bring it back", async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem("mf-settings", JSON.stringify({ assistant: false }))
    );
    await page.reload();
    await expect(page.locator("#assistant")).toBeHidden();
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Control Panel" }).click();
    /* 98.css hides the real checkbox and draws the label, so click that. */
    await page.locator('label[for="cp-assistant"]').click();
    await expect(page.locator("#cp-assistant")).toBeChecked();
    await page.locator("#cp-ok").click();
    await expect(page.locator("#assistant")).toBeVisible();
  });

  test("an opted-in visitor gets it back on the next page", async ({ page }) => {
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();
    await page.goto("/about/");
    await expect(page.locator("#assistant")).toBeVisible();
  });
});

test.describe("reading a post aloud", () => {
  /* The real Web Speech API is a black box with no completion guarantees
     and no voices at all in headless Firefox, so stand in a synthesizer
     that finishes each utterance promptly and keeps a transcript. */
  const SPEECH_STUB = () => {
    const spoken = [];
    let live = null;
    window.__spoken = spoken;
    window.__paused = false;
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.onend = null;
        this.onerror = null;
      }
    };
    const synth = {
      speak(u) {
        spoken.push(u.text);
        live = u;
        setTimeout(() => {
          if (live === u && u.onend) u.onend();
        }, 30);
      },
      /* cancel() drops the utterance in flight, exactly as the real one
         does - which is what the generation guard in clippy.js is for. */
      cancel() {
        live = null;
      },
      pause() {
        window.__paused = true;
      },
      resume() {
        window.__paused = false;
      },
    };
    /* speechSynthesis is a read-only accessor on window, so plain
       assignment is silently ignored in Chromium. */
    Object.defineProperty(window, "speechSynthesis", {
      value: synth,
      configurable: true,
    });
  };

  /* Tips are drawn at random from a pool the offer is only one member
     of, and a click on the clip toggles the balloon rather than always
     opening it - so click until the offer turns up. The pool is small
     and never repeats a tip until it is exhausted, so this terminates. */
  const openReadOffer = async (page) => {
    const offer = page.getByRole("button", { name: "Read it to me" });
    for (let i = 0; i < 40 && !(await offer.isVisible()); i++) {
      await page.locator("#assistant-clip").click();
    }
    await expect(offer).toBeVisible();
    return offer;
  };

  const summonOnPost = async (page) => {
    await page.addInitScript(SPEECH_STUB);
    await page.goto("/blog/hello-world/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();
  };

  test("the offer is opt-in and the read is announced politely", async ({ page }) => {
    await summonOnPost(page);

    /* Nothing is spoken until someone says yes. */
    expect(await page.evaluate(() => window.__spoken.length)).toBe(0);

    const live = page.locator("#assistant-live");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveRole("status");

    await (await openReadOffer(page)).click();
    await expect(live).toHaveText("Reading the post aloud.");
    await expect(page.locator("#assistant-text")).toContainText("Reading the post out loud");

    /* It reads the article, and says so when it runs out of it. */
    await expect(live).toHaveText("Finished reading.", { timeout: 10_000 * SLOW });
    const spoken = await page.evaluate(() => window.__spoken);
    expect(spoken[0]).toBe("Hello, World");
    expect(spoken).toContain("Code sample.");
    await expect(page.locator(".reading-now")).toHaveCount(0);
  });

  test("exactly one block is current, and it is marked for both eyes and AT", async ({ page }) => {
    await summonOnPost(page);
    await (await openReadOffer(page)).click();

    const current = page.locator("#content article [aria-current='true']");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveClass(/reading-now/);
    /* Focus never lands in the prose: this narrates, it doesn't drive,
       so a keyboard or screen-reader user keeps their place. */
    const focusInArticle = await page.evaluate(() => {
      var art = document.querySelector("#content article");
      return !!(art && document.activeElement && art.contains(document.activeElement));
    });
    expect(focusInArticle).toBe(false);
  });

  test("Pause and Resume swap in place", async ({ page }) => {
    await summonOnPost(page);
    await (await openReadOffer(page)).click();

    const pause = page.getByRole("button", { name: "Pause" });
    await pause.click();
    expect(await page.evaluate(() => window.__paused)).toBe(true);
    await expect(page.locator("#assistant-live")).toHaveText("Paused.");

    const resume = page.getByRole("button", { name: "Resume" });
    await expect(resume).toHaveAttribute("aria-pressed", "true");
    await resume.click();
    expect(await page.evaluate(() => window.__paused)).toBe(false);
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  });

  test("Stop ends it and takes the highlight with it", async ({ page }) => {
    await summonOnPost(page);
    await (await openReadOffer(page)).click();
    await expect(page.locator(".reading-now")).toHaveCount(1);

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.locator("#assistant-live")).toHaveText("Stopped.");
    await expect(page.locator(".reading-now")).toHaveCount(0);
    await expect(page.locator("#content article [aria-current]")).toHaveCount(0);

    /* And it stays stopped rather than resuming from the next block. */
    const said = await page.evaluate(() => window.__spoken.length);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__spoken.length)).toBe(said);
  });

  test("nothing to read, nothing offered", async ({ page }) => {
    await page.addInitScript(SPEECH_STUB);
    await page.goto("/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();

    /* Well past the size of the index pool, so it has cycled through
       every tip it has more than once. */
    for (let i = 0; i < 30; i++) await page.locator("#assistant-clip").click();
    await expect(page.getByRole("button", { name: "Read it to me" })).toHaveCount(0);
  });
});

test.describe("lazy loading", () => {
  /* The whole point: a reader who never asks for these never downloads
     them. Watch the wire rather than trusting the globals. */
  test("neither the assistant nor the saver is fetched by default", async ({ page }) => {
    const fetched = [];
    page.on("request", (r) => {
      const url = r.url();
      if (/\/(clippy|screensaver)[.\w]*\.js/.test(url)) fetched.push(url);
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    /* Comfortably past anything the page does on its own. */
    await page.waitForTimeout(2000);
    expect(fetched).toEqual([]);
    expect(await page.evaluate(() => typeof window.MFClippy)).toBe("undefined");
    expect(await page.evaluate(() => typeof window.MFScreensaver)).toBe("undefined");

    /* ...and each one arrives the moment it is actually asked for. */
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();
    expect(fetched.some((u) => u.includes("clippy"))).toBe(true);
    expect(fetched.some((u) => u.includes("screensaver"))).toBe(false);
  });
});

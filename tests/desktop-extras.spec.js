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

  /* Nobody asked for a paperclip, so the first one has to introduce
     itself - and then never again. */
  test("a first visit is welcomed, later ones are not", async ({ page }) => {
    await expect(page.locator("#assistant")).toBeVisible({ timeout: 15_000 * SLOW });
    await expect(page.locator("#assistant-text")).toContainText("I'll be down here");

    const settings = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mf-settings"))
    );
    expect(settings.assistantWelcomed).toBe(true);
    /* Saying hello is not a preference: the setting still records only
       what the reader actually chose. */
    expect(settings.assistant).toBeUndefined();

    await page.goto("/about/");
    await expect(page.locator("#assistant")).toBeVisible({ timeout: 15_000 * SLOW });
    await expect(page.locator("#assistant-balloon")).toBeHidden();
  });

  test("the welcome carries its own way out", async ({ page }) => {
    await expect(page.locator("#assistant")).toBeVisible({ timeout: 15_000 * SLOW });
    await page.getByRole("button", { name: "Go away" }).click();
    await expect(page.locator("#assistant")).toBeHidden();

    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("mf-settings")).assistant)
    ).toBe(false);
    await page.reload();
    await expect(page.locator("#assistant")).toBeHidden();
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
    let timer = null;
    let paused = false;
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
    /* An utterance only ends after a stretch of *unpaused* time, so a
       paused read really does stand still instead of quietly running to
       the end of the post underneath the test. */
    const arm = (u) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (live === u && u.onend) u.onend();
      }, 30);
    };
    const disarm = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const synth = {
      speak(u) {
        spoken.push(u.text);
        live = u;
        if (!paused) arm(u);
      },
      /* cancel() drops the utterance in flight, exactly as the real one
         does - which is what the generation guard in clippy.js is for.
         Per spec it leaves the paused state alone, which is a trap only
         an honest stub can catch. */
      cancel() {
        live = null;
        disarm();
      },
      pause() {
        paused = true;
        window.__paused = true;
        disarm();
      },
      resume() {
        paused = false;
        window.__paused = false;
        if (live) arm(live);
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

  /* Cancelling does not un-pause the engine, so a read that was paused
     before it was stopped used to leave the next one mute. */
  test("stopping a paused read doesn't silence the next one", async ({ page }) => {
    await summonOnPost(page);
    await (await openReadOffer(page)).click();

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator("#assistant-live")).toHaveText("Paused.");
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.locator("#assistant-live")).toHaveText("Stopped.");

    const said = await page.evaluate(() => window.__spoken.length);
    await (await openReadOffer(page)).click();
    await expect(page.locator("#assistant-live")).toHaveText("Reading the post aloud.");
    /* Past the first block: the second one only arrives if the engine
       actually finished the first. */
    await expect
      .poll(() => page.evaluate(() => window.__spoken.length), { timeout: 5_000 * SLOW })
      .toBeGreaterThan(said + 1);
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

  /* The whole point of the offer is that it turns up while you are
     still at the top of the post. Nothing is clicked here: an opted-in
     reader opens a post and the assistant works out the rest. */
  test("the offer arrives on its own when a post is opened", async ({ page }) => {
    test.setTimeout(30_000 * SLOW);
    await page.addInitScript(SPEECH_STUB);
    await page.addInitScript(() =>
      localStorage.setItem("mf-settings", JSON.stringify({ assistant: true }))
    );
    await page.goto("/blog/hello-world/");
    await expect(page.locator("#assistant")).toBeVisible();

    const offer = page.getByRole("button", { name: "Read it to me" });
    await expect(offer).toBeVisible({ timeout: 15_000 * SLOW });
    /* It knows how long the post is, and it still hasn't said a word
       out loud. */
    await expect(page.locator("#assistant-text")).toContainText(/(a minute|\d+ minutes) of it/);
    expect(await page.evaluate(() => window.__spoken.length)).toBe(0);
  });

  /* ...and nowhere else: the index has no article to read. */
  test("it doesn't volunteer the offer on a folder of posts", async ({ page }) => {
    test.setTimeout(30_000 * SLOW);
    await page.addInitScript(SPEECH_STUB);
    await page.addInitScript(() =>
      localStorage.setItem("mf-settings", JSON.stringify({ assistant: true }))
    );
    await page.goto("/blog/");
    await expect(page.locator("#assistant")).toBeVisible();
    await page.waitForTimeout(12_000 * SLOW);
    await expect(page.getByRole("button", { name: "Read it to me" })).toHaveCount(0);
  });
});

/* The assistant's tips are drawn from what the page and the desktop
   actually contain - see the app registry in main.js. */
test.describe("the assistant reads the room", () => {
  test("every window answers the same questions", async ({ page }) => {
    await page.goto("/blog/hello-world/");
    const desk = await page.evaluate(() => ({
      page: window.MF.app("main").content(),
      pyedit: window.MF.app("pyedit").state(),
      /* Answered from the markup, before editor.js has ever loaded. */
      pyeditTitle: window.MF.app("pyedit").title(),
      unknown: window.MF.app("solitaire"),
    }));

    expect(desk.page.kind).toBe("post");
    expect(desk.page.title).toBe("Hello, World");
    expect(desk.page.minutes).toBeGreaterThan(0);
    expect(desk.page.code).toBeGreaterThan(0);
    expect(desk.page.python).toContain("fizzbuzz");
    expect(desk.pyedit).toBe("closed");
    expect(desk.pyeditTitle).toContain("Python");
    expect(desk.unknown).toBeNull();
  });

  test("the blog index is a folder of posts, not a post", async ({ page }) => {
    await page.goto("/blog/");
    const content = await page.evaluate(() => window.MF.app("main").content());
    expect(content.kind).toBe("index");
    expect(content.minutes).toBe(0);
    expect(content.python).toBeNull();
  });

  test("opening an app is noticed by whoever subscribed", async ({ page }) => {
    await page.goto("/");
    const seen = await page.evaluate(async () => {
      const events = [];
      window.MF.on("app", (e) => events.push(e));
      window.MF.openFind();
      await new Promise((r) => setTimeout(r, 1000));
      return { events: events, state: window.MF.app("find").state() };
    });
    expect(seen.state).toBe("open");
    expect(seen.events.some((e) => e.id === "find" && e.state === "open")).toBe(true);
  });

  test("it never offers to open an app that is already open", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("F3");
    await expect(page.locator('[data-win="find"]')).toBeVisible();

    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();

    /* A tip is never repeated until the pool is exhausted, so twenty
       tips is every tip this page has, twice over. */
    const said = [];
    for (let i = 0; i < 40; i++) {
      await page.locator("#assistant-clip").click();
      const text = await page.locator("#assistant-text").textContent();
      if (text) said.push(text);
    }
    expect(said.some((t) => t.includes("Control Panel"))).toBe(true);
    expect(said.some((t) => t.includes("Start > Find"))).toBe(false);
  });

  /* Highlighting a phrase is the clearest signal anyone gives this
     desktop that they are looking for something. */
  test("a highlighted phrase becomes a full-text search", async ({ page }) => {
    test.setTimeout(30_000 * SLOW);
    await page.addInitScript(() =>
      localStorage.setItem("mf-settings", JSON.stringify({ assistant: true }))
    );
    await page.goto("/blog/hello-world/");
    await expect(page.locator("#assistant")).toBeVisible();

    await page.evaluate(() => {
      const el = document.querySelector("#content article h2");
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    const findIt = page.getByRole("button", { name: "Find it" });
    await expect(findIt).toBeVisible({ timeout: 15_000 * SLOW });
    await expect(page.locator("#assistant-text")).toContainText("Why this stack");

    await findIt.click();
    await expect(page.locator('[data-win="find"]')).toBeVisible();
    /* Into "Containing text", not the filename box: a sentence is not a
       file name, and the full-text index is what can answer it. */
    await expect(page.locator("#find-text")).toHaveValue("Why this stack?");
    await expect(page.locator("#find-status")).toHaveText(/file\(s\) found/, {
      timeout: 6_000 * SLOW,
    });
  });

  /* Across windows: what Python.exe knows about its last run is a fact
     the assistant can be unhelpful about. The runtime is stubbed, so
     this stays offline and instant. */
  test("it notices when a script in Python.exe blows up", async ({ page }) => {
    test.setTimeout(30_000 * SLOW);
    await page.route("**/pyworker.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `self.addEventListener("message", function (e) {
          if (e.data && e.data.kind === "run") {
            self.postMessage({ kind: "error", message: "NameError: name 'fizz' is not defined" });
          }
        });
        self.postMessage({ kind: "ready" });`,
      })
    );
    await page.addInitScript(() =>
      localStorage.setItem("mf-settings", JSON.stringify({ assistant: true }))
    );
    await page.goto("/");
    await expect(page.locator("#assistant")).toBeVisible();

    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Python.exe" }).click();
    await page.locator("#pyedit-run").click();
    await expect(page.locator("#pyedit-output")).toContainText("NameError");

    await expect(page.locator("#assistant-text")).toContainText("didn't run", {
      timeout: 15_000 * SLOW,
    });
    await expect(page.locator("#assistant-text")).toContainText("NameError");
  });
});

test.describe("lazy loading", () => {
  /* Nothing here is on the critical path. The saver is summon-only, and
     the assistant - on by default now - is still a deferred fetch that a
     reader who has dismissed it never pays for at all. */
  const watchScripts = (page) => {
    const fetched = [];
    page.on("request", (r) => {
      const url = r.url();
      if (/\/(clippy|screensaver)[.\w]*\.js/.test(url)) fetched.push(url);
    });
    return fetched;
  };

  test("the saver is not fetched until something wants one", async ({ page }) => {
    const fetched = watchScripts(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    /* Comfortably past anything the page does on its own. */
    await page.waitForTimeout(2000);
    expect(fetched.some((u) => u.includes("screensaver"))).toBe(false);
    expect(await page.evaluate(() => typeof window.MFScreensaver)).toBe("undefined");
  });

  test("the assistant is on by default, and arrives on its own", async ({ page }) => {
    const fetched = watchScripts(page);

    await page.goto("/");
    await expect(page.locator("#assistant")).toBeVisible({ timeout: 15_000 * SLOW });
    expect(fetched.some((u) => u.includes("clippy"))).toBe(true);
    expect(fetched.some((u) => u.includes("screensaver"))).toBe(false);
  });

  test("an assistant that was dismissed is never downloaded again", async ({ page }) => {
    /* Two seconds of deliberately watching nothing happen, then a summon
       on top of it - too much to fit in the default budget. */
    test.slow();
    await page.addInitScript(() =>
      localStorage.setItem("mf-settings", JSON.stringify({ assistant: false }))
    );
    const fetched = watchScripts(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(fetched).toEqual([]);
    expect(await page.evaluate(() => typeof window.MFClippy)).toBe("undefined");

    /* ...and it still arrives the moment it is actually asked for. */
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();
    expect(fetched.some((u) => u.includes("clippy"))).toBe(true);
  });
});

import { test as base, expect } from "@playwright/test";

/* Shared helpers for the desktop-metaphor UI across desktop and mobile
   projects. */

/* Headless browsers still hand their audio to the OS, so an unattended
   run dials the modem out loud. Chromium and Firefox are muted at launch
   (see playwright.config.js); WebKit has no such switch, and speech
   synthesis never touches the browser's audio output in *any* engine -
   it talks straight to the system voice service - so both are silenced
   here as well, in every page of every project. */
const SILENCE = () => {
  const RealAudioContext = window.AudioContext || window.webkitAudioContext;
  if (RealAudioContext) {
    /* Shadow the context's destination with a zero-gain node that still
       feeds the real one: currentTime, scheduling and every connect()
       then behave exactly as they do for a listener who can hear. */
    class SilentAudioContext extends RealAudioContext {
      constructor(...args) {
        super(...args);
        const sink = this.createGain();
        sink.gain.value = 0;
        sink.connect(this.destination);
        Object.defineProperty(this, "destination", { value: sink });
      }
    }
    window.AudioContext = SilentAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = SilentAudioContext;
  }

  /* clippy.js treats a missing synthesizer as "can't read aloud", so the
     offer never appears and no OS voice is ever asked to speak. The
     read-aloud specs install their own recording stub over this. */
  Object.defineProperty(window, "speechSynthesis", {
    value: undefined,
    configurable: true,
  });
};

/* Every spec imports test/expect from here rather than from Playwright
   so that nothing can opt out of the silencing by accident. */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(SILENCE);
    await use(context);
  },
});

export { expect };

export const isMobile = () => base.info().project.name.includes("mobile");

/* Matches the CI multiplier in playwright.config.js for the few
   explicit per-assertion timeouts in the specs. */
export const SLOW = process.env.CI ? 3 : 1;

/* On phones the main window starts maximized and covers the desktop
   icons; minimize it first, the way a real user reaches the desktop. */
export const showDesktop = async (page) => {
  const main = page.locator('main[data-win="main"]');
  const covering = await main.evaluate(
    (w) =>
      w.classList.contains("maximized") &&
      !w.classList.contains("minimized") &&
      !w.classList.contains("closed")
  );
  if (covering) await main.getByRole("button", { name: "Minimize" }).click();
};

/* Launch an app the way a user on that device would: desktop icon on
   desktop, Start menu on a phone (where windows cover the icons). */
export const launchApp = async (page, iconLabel, menuItemId) => {
  if (isMobile()) {
    await page.locator("#start-button").click();
    await page.locator(menuItemId).click();
  } else {
    await page.locator(".desktop-icon", { hasText: iconLabel }).dblclick();
  }
};

/* Right-click bare desktop. Where "bare" is depends on the browser and
   the device - icons run down the left on wide screens (and Firefox's
   label metrics differ from Chromium's), while phones hide the icons but
   start with a maximized window over everything - so probe for a point
   the contextmenu handler will actually accept instead of hard-coding
   one. Pass "bottom-right" to find the free point nearest that corner,
   which is what the edge-flipping test needs. */
export const rightClickDesktop = async (page, corner) => {
  await showDesktop(page);
  const point = await page.evaluate((fromEnd) => {
    const desk = document.getElementById("desktop");
    const r = desk.getBoundingClientRect();
    const xs = [];
    const ys = [];
    for (let x = r.left + 10; x < r.right - 10; x += 10) xs.push(Math.round(x));
    for (let y = r.top + 10; y < r.bottom - 10; y += 10) ys.push(Math.round(y));
    if (fromEnd) {
      xs.reverse();
      ys.reverse();
    }
    for (const y of ys) {
      for (const x of xs) {
        const el = document.elementFromPoint(x, y);
        /* The same test main.js applies before opening the menu. */
        if (el && desk.contains(el) && !el.closest(".app-window, .desktop-icon, .assistant")) {
          return { x, y };
        }
      }
    }
    return null;
  }, corner === "bottom-right");
  if (!point) throw new Error("no free desktop background to right-click");
  await page.mouse.click(point.x, point.y, { button: "right" });
  return point;
};

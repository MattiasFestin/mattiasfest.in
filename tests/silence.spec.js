import { test, expect } from "./helpers.js";

/* The harness itself. Headless is not the same as silent: without this,
   a full run dials the modem out loud and, on a machine with voices
   installed, reads a post aloud. Both silencers live outside the specs
   (playwright.config.js and helpers.js), so nothing else here would fail
   if one of them were dropped - until someone ran the suite with the
   speakers on. */
test.describe("the test browser is silent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Web Audio plays into a zero gain", async ({ page }) => {
    const gain = await page.evaluate(() => {
      /* Exactly what browser.js does to make the modem noise. */
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx.destination.gain ? ctx.destination.gain.value : null;
    });
    expect(gain).toBe(0);
  });

  test("nothing can reach the system voice", async ({ page }) => {
    /* Muting the browser would not help here - speech synthesis goes to
       the OS, not to the page's audio output. */
    expect(await page.evaluate(() => window.speechSynthesis)).toBeUndefined();
    /* And the assistant takes the hint rather than offering a read it
       cannot perform. */
    await page.goto("/blog/hello-world/");
    await page.locator("#start-button").click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page.locator("#assistant")).toBeVisible();
    for (let i = 0; i < 30; i++) await page.locator("#assistant-clip").click();
    await expect(page.getByRole("button", { name: "Read it to me" })).toHaveCount(0);
  });
});

import { test, expect, launchApp, SLOW } from "./helpers.js";

/* "The Internet": lazy-loaded browser.js, dial-up theater, then the web
   of 1998 via the Wayback Machine in a sandboxed iframe. Tests disable
   the modem sound (the Control Panel setting the code honors → quick
   silent dial) and stub web.archive.org so nothing leaves the machine. */

const FAKE_1998 = "<html><body><h1>Welcome to 1998</h1></body></html>";

test.describe("the internet", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("mf-settings", JSON.stringify({ modemSound: false }));
    });
    await page.route("**://web.archive.org/**", (route) =>
      route.fulfill({ contentType: "text/html", body: FAKE_1998 })
    );
    await page.goto("/");
  });

  const win = (page) => page.locator('[data-win="browser"]');

  const openInternet = (page) => launchApp(page, "The Internet", "#menu-internet");

  const connect = async (page) => {
    await openInternet(page);
    await expect(win(page)).toBeVisible();
    // Silent dial takes 1.5 s; wait for the theater to finish
    await expect(page.locator("#dialup")).toBeHidden({ timeout: 4_000 * SLOW });
  };

  test("browser.js is lazy: fetched on first open, not on page load", async ({ page }) => {
    const requests = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => /browser.*\.js/.test(u))).toEqual([]);
    await openInternet(page);
    await expect(win(page)).toBeVisible();
    expect(requests.some((u) => /browser.*\.js/.test(u))).toBe(true);
  });

  test("dials up, connects, and lands on Slashdot 1998", async ({ page }) => {
    await openInternet(page);
    // The dialing dialog runs its little theater
    await expect(page.locator("#dialup")).toBeVisible();
    await expect(page.locator("#dialup-status")).toHaveText(/Dialing 555-1998/);
    await expect(page.locator("#dialup")).toBeHidden({ timeout: 4_000 * SLOW });

    // Connected: home page is Slashdot via the Wayback Machine
    await expect(page.locator("#browser-address")).toHaveValue("slashdot.org");
    await expect(page.locator("#browser-title")).toHaveText("slashdot.org - The Internet");
    const frame = win(page).locator("iframe.browser-frame");
    await expect(frame).toHaveAttribute("src", /web\.archive\.org\/web\/1998if_\/http:\/\/slashdot\.org/);
    // Scripts stay buried with the popup ads of 1998
    await expect(frame).toHaveAttribute("sandbox", "allow-same-origin allow-forms");
    await expect(page.locator("#browser-status")).toHaveText("Done");
  });

  test("address bar navigates through the Wayback Machine", async ({ page }) => {
    await connect(page);
    await page.locator("#browser-address").fill("geocities.com");
    await page.locator("#browser-address").press("Enter");
    await expect(win(page).locator("iframe.browser-frame")).toHaveAttribute(
      "src",
      /web\.archive\.org\/web\/1998if_\/http:\/\/geocities\.com/
    );
    await expect(page.locator("#browser-title")).toHaveText("geocities.com - The Internet");
  });

  test("home and search buttons go to Slashdot and AltaVista", async ({ page }) => {
    await connect(page);
    await page.locator("#browser-search").click();
    await expect(page.locator("#browser-address")).toHaveValue("altavista.digital.com");
    await page.locator("#browser-home").click();
    await expect(page.locator("#browser-address")).toHaveValue("slashdot.org");
  });

  test("favorites: presets, add from address bar, remove", async ({ page }) => {
    await connect(page);
    const menu = page.locator("#favorites-menu");

    await page.locator("#browser-favorites").click();
    await expect(menu).toBeVisible();
    // The bookmarks of a 1998 programmer
    await expect(menu.locator(".fav-item", { hasText: "GeoCities" })).toBeVisible();
    await expect(menu.locator(".fav-item", { hasText: "Annica Tigers HTML-skola" })).toBeVisible();

    // Add the current page (slashdot.org isn't a preset)
    await page.locator("#fav-add").click();
    await expect(menu).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mf-favorites")))).toEqual([
      { name: "slashdot.org", url: "slashdot.org" },
    ]);

    // It shows up with a remove button; removing clears it again
    await page.locator("#browser-favorites").click();
    const mine = menu.locator(".fav-row", { hasText: "slashdot.org" });
    await expect(mine).toBeVisible();
    await mine.getByRole("button", { name: /Remove slashdot\.org/ }).click();
    await expect(menu.locator(".fav-row")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mf-favorites")))).toEqual([]);
  });

  test("Escape closes the favorites menu and refocuses the button", async ({ page }) => {
    await connect(page);
    await page.locator("#browser-favorites").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#favorites-menu")).toBeHidden();
    await expect(page.locator("#browser-favorites")).toBeFocused();
  });

  test("cancel while dialing hangs up and closes the window", async ({ page }) => {
    await openInternet(page);
    await expect(page.locator("#dialup")).toBeVisible();
    await page.locator("#dialup-cancel").click();
    await expect(win(page)).not.toBeVisible();
    await expect(page.locator("#browser-status")).toHaveText("Disconnected.");
  });

  test("the connection survives close and reopen (session keeps state)", async ({ page }) => {
    await connect(page);
    await page.locator("#browser-address").fill("geocities.com");
    await page.locator("#browser-address").press("Enter");
    await win(page).getByRole("button", { name: "Close" }).click();
    await expect(win(page)).not.toBeVisible();
    // Reopen: no re-dial, page still on geocities
    await openInternet(page);
    await expect(win(page)).toBeVisible();
    await expect(page.locator("#dialup")).toBeHidden();
    await expect(page.locator("#browser-address")).toHaveValue("geocities.com");
  });
});

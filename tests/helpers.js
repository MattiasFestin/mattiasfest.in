import { test } from "@playwright/test";

/* Shared helpers for the desktop-metaphor UI across desktop and mobile
   projects. */

export const isMobile = () => test.info().project.name.includes("mobile");

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

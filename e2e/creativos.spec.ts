import type { Page } from "@playwright/test";
import { type E2eApp, expect, test } from "./fixtures";

// Creativos: the screenshot studio. Nothing here saves: «Guardar» is never pressed, so the design in
// the test database stays as it was.

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

const creativos = (a: E2eApp) => `/a/${a.slug}/creativos`;

test.describe.configure({ timeout: 180_000 });

test("smoke: elegir una pantalla, cambiar el titular y descargar el ZIP", async ({ page, apps }) => {
  const app = apps[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, creativos(app));
  const headline = page.getByRole("textbox", { name: /^Titular \d/ });
  await expect(headline).toBeVisible();
  // A second screen to select: added when the design has only one.
  const second = page.getByRole("button", { name: "Pantalla 2", exact: true });
  if ((await second.count()) === 0) await page.getByRole("button", { name: /Añadir pantalla/ }).click();
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await headline.fill("Titular de *prueba*");
  await expect(headline).toHaveValue("Titular de *prueba*");
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: /ZIP/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});

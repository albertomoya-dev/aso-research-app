import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { appPaths, firstMarkets, GLOBAL_ROUTES } from "./route-list";

// WCAG 2.1 A and AA, in both themes: /dev/ui (and its floating layers) and every route.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const THEMES = ["light", "dark"] as const;

async function openWithTheme(page: Page, path: string, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

function summary(violations: { id: string; impact?: string | null; nodes: { target: unknown }[] }[]) {
  return violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" ")}`);
}

for (const theme of THEMES) {
  test(`/dev/ui sin fallos AA · página en tema ${theme}`, async ({ page }) => {
    await openWithTheme(page, "/dev/ui", theme);
    await expect(page.getByRole("heading", { name: "Componentes", level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.theme ?? "light")).toBe(theme);
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(summary(result.violations)).toEqual([]);
  });

  test(`/dev/ui: capas flotantes sin fallos AA · ${theme}`, async ({ page }) => {
    await openWithTheme(page, "/dev/ui", theme);
    const showcase = page.getByTestId(`showcase-${theme}`);
    await showcase.getByRole("button", { name: "Abrir diálogo" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const dialog = await new AxeBuilder({ page }).withTags(TAGS).include("[role=dialog]").analyze();
    expect(summary(dialog.violations)).toEqual([]);
    await page.keyboard.press("Escape");
    await showcase.getByRole("button", { name: "Más acciones" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    const menu = await new AxeBuilder({ page }).withTags(TAGS).include("[role=menu]").analyze();
    expect(summary(menu.violations)).toEqual([]);
  });
}

// Every route in both themes, for EVERY market of the test database (and the product pages for the
// first market of each product): ANY violation of the WCAG 2.0/2.1 A and AA rules fails, whatever its
// impact. They are written to test-results/axe-routes-<theme>-<slot>.json. One test per market and one
// for the global routes, so the workers share them; the slots past the last market are skipped.
const MARKET_SLOTS = 8;

async function checkPaths(page: Page, paths: string[], theme: (typeof THEMES)[number], file: string) {
  const report: Record<string, string[]> = {};
  for (const path of paths) {
    await openWithTheme(page, path, theme);
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    report[`${path} · ${theme}`] = summary(result.violations);
    expect.soft(summary(result.violations), `${path} · ${theme}`).toEqual([]);
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/axe-routes-${theme}-${file}.json`, JSON.stringify(report, null, 2));
}

test.describe("rutas: accesibilidad AA", () => {
  for (const theme of THEMES) {
    test(`rutas globales sin fallos de axe · ${theme}`, async ({ page }) => {
      test.setTimeout(300_000);
      await checkPaths(page, GLOBAL_ROUTES, theme, "global");
    });

    for (let slot = 0; slot < MARKET_SLOTS; slot++) {
      test(`rutas del mercado ${slot + 1} sin fallos de axe · ${theme}`, async ({ page, apps }) => {
        test.skip(slot >= apps.length, `La base de datos de prueba tiene ${apps.length} mercados`);
        test.setTimeout(900_000);
        const app = apps[slot];
        const first = firstMarkets(apps).some((a) => a.id === app.id);
        await checkPaths(page, appPaths(app, first), theme, String(slot + 1));
      });
    }
  }
});

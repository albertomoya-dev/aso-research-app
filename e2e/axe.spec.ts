import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { allPaths } from "./route-list";

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

// Every route of the first market of the test database, in both themes: serious and critical
// violations fail the run; minor and moderate ones are annotated. All of them are written to
// test-results/axe-routes-<theme>.json.
const BLOCKING = new Set(["serious", "critical"]);

test.describe("rutas: accesibilidad AA", () => {
  test.describe.configure({ timeout: 180_000 });
  // The paths depend on the database, so one test walks them (workers would each load the fixture).
  for (const theme of THEMES) {
    test(`todas las rutas sin fallos graves · ${theme}`, async ({ page, apps }) => {
      test.setTimeout(900_000);
      const report: Record<string, string[]> = {};
      for (const path of allPaths(apps[0])) {
        await openWithTheme(page, path, theme);
        const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        report[`${path} · ${theme}`] = summary(result.violations);
        const minor = result.violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
        if (minor.length > 0) {
          test.info().annotations.push({ type: "axe", description: `${path} · ${theme}: ${minor.map((v) => `${v.id}×${v.nodes.length}`).join(", ")}` });
        }
        expect.soft(summary(result.violations.filter((v) => BLOCKING.has(v.impact ?? ""))), `${path} · ${theme}`).toEqual([]);
      }
      mkdirSync("test-results", { recursive: true });
      writeFileSync(`test-results/axe-routes-${theme}.json`, JSON.stringify(report, null, 2));
    });
  }
});

import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// WCAG 2.1 A and AA. /dev/ui must pass in both themes; the current screens are only reported
// until the redesign phases go through them.
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

// Report only: annotated and written to test-results/axe-routes.json.
const MAIN_ROUTES = ["/", "/buscar", "/novedades", "/resumen", "/ajustes", "/apps/1", "/apps/1/ideas", "/apps/1/metadata", "/apps/1/competidores", "/apps/1/producto"];

test("rutas actuales: informe de accesibilidad (no bloquea)", async ({ page }) => {
  test.setTimeout(300_000);
  const report: Record<string, string[]> = {};
  for (const theme of THEMES) {
    for (const path of MAIN_ROUTES) {
      await openWithTheme(page, path, theme);
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      report[`${path} · ${theme}`] = summary(result.violations);
      if (result.violations.length > 0) {
        test.info().annotations.push({ type: "axe", description: `${path} · ${theme}: ${result.violations.map((v) => `${v.id}×${v.nodes.length}`).join(", ")}` });
      }
    }
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/axe-routes.json", JSON.stringify(report, null, 2));
});

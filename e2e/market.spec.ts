import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { type E2eApp, expect, measureOverflow, test, VIEWPORTS } from "./fixtures";

// Phase 31: Mercado › Competidores, Reseñas and Tendencias. Read only: nothing here follows a competitor,
// analyses reviews or prepares a season (they would write to the database or call the stores).

const market = (a: E2eApp) => `/a/${a.slug}/${a.country}`;
const PAGES = ["competidores", "resenas", "tendencias"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

const serious = (violations: { id: string; impact?: string | null; nodes: { target: unknown }[] }[]) =>
  violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" ")}`);

test.describe.configure({ timeout: 180_000 });

test("Reseñas: sin selector de país, con la columna de fuentes y tu app primero", async ({ page, apps }) => {
  const app = apps[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(app)}/resenas`);
  await expect(page.getByRole("heading", { name: "Reseñas", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cambiar país" })).toHaveCount(0);
  const sources = page.getByRole("navigation", { name: "Fuentes de reseñas" });
  await expect(sources).toBeVisible();
  const first = sources.getByRole("link").first();
  await expect(first).toContainText("(tu app)");
  await expect(first).toHaveAttribute("aria-current", "page");
});

test("Competidores: la cuota es una barra dentro de cada fila y la fila abre el panel", async ({ page, apps }) => {
  const app = apps[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(app)}/competidores`);
  const table = page.getByRole("table", { name: "Competidores" });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  await expect(table.getByTestId("share-bar")).toHaveCount(count);
  await expect(table.getByRole("switch").first()).toBeVisible();
  // The first competitor (not your app) opens its panel.
  const competitor = rows.filter({ has: page.getByRole("switch") }).first();
  await competitor.locator("td").nth(2).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "Analizar reseñas" })).toHaveAttribute("href", /\/resenas\?t=/);
  await expect(panel.getByRole("heading", { name: /^Keywords compartidas contigo/ })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(TAGS).include("[role=dialog]").analyze();
  expect(serious(axe.violations)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("Tendencias: las filas sin datos van plegadas tras «Mostrar N sin datos»", async ({ page, apps }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let folded = 0;
  for (const app of apps) {
    await open(page, `${market(app)}/tendencias`);
    const toggle = page.getByText(/^Mostrar \d+ sin datos$/);
    if ((await toggle.count()) === 0) continue;
    folded++;
    const list = page.getByRole("list", { name: "Keywords sin datos" });
    await expect(list).toBeHidden();
    // No row of the heatmap says «sin datos»: they are all behind the toggle.
    await expect(page.getByRole("table", { name: "Interés por mes" }).getByText(/sin datos/i)).toHaveCount(0);
    await toggle.click();
    await expect(list).toBeVisible();
    await expect(page.getByText(/^Ocultar \d+ sin datos$/)).toBeVisible();
  }
  test.info().annotations.push({ type: "tendencias", description: `${folded} mercados con filas sin datos plegadas` });
  expect(folded, "algún mercado de la base de prueba tiene keywords sin datos").toBeGreaterThan(0);
});

for (const sub of PAGES) {
  test(`${sub}: sin scroll horizontal a 390 y 1440 px, y sin fallos graves de axe`, async ({ page, apps }) => {
    const app = apps[0];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await open(page, `${market(app)}/${sub}`);
      const overflow = await measureOverflow(page);
      expect(overflow.scrollWidth, `${sub} @${vp.width}: ${overflow.widest ?? ""}`).toBeLessThanOrEqual(overflow.innerWidth);
      expect(overflow.mainScrollWidth, `${sub} @${vp.width}: <main> ${overflow.widest ?? ""}`).toBeLessThanOrEqual(overflow.mainClientWidth);
    }
    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, `${market(app)}/${sub}`);
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(serious(result.violations), `${sub} · ${theme}`).toEqual([]);
    }
  });
}

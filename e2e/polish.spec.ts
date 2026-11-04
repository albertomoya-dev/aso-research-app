import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test, VIEWPORTS } from "./fixtures";
import { appPaths, firstMarkets, GLOBAL_ROUTES } from "./route-list";

// Phase 33 (DESIGN.md §1): on every route, at most ONE visible primary button, and no explanatory
// text longer than 2 lines outside a HelpTip or an EmptyState, at 390 and 1440 px. Store data
// and data lines (reviews, listing texts and their diffs, AI output, app names, impact figures) are
// marked `data-content`: they are not explanation, so they are skipped.
// The global routes once, and the routes of the first market of EVERY product (real data differs).

test.describe.configure({ timeout: 900_000 });

async function open(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

/** Visible primary buttons (Button variant="primary" or the buttonPrimary class string). */
function visiblePrimaries(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".btn-primary, [data-variant=primary]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden";
      })
      .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 60)),
  );
}

/**
 * Blocks of text inside <main> taller than two lines: every <p>, and every <div>, <span> or <li>
 * holding only text (no child elements), which is how a paragraph slips in without a <p>. Controls,
 * links, tables and short strings (a word wrapped in a narrow column is layout, not explanation) are
 * left out.
 */
function longParagraphs(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main p, main div, main span, main li"))
      .filter((el) => el.tagName === "P" || (el.children.length === 0 && (el.textContent ?? "").trim().length >= 60))
      .filter(
        (el) =>
          !el.closest(
            "[data-help-tip], [data-empty-state], [role=tooltip], [role=dialog], [data-content], details:not([open]), button, a, label, select, table, [aria-hidden=true], .sr-only",
          ),
      )
      .filter((el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || el.getClientRects().length === 0) return false;
        const fontSize = parseFloat(style.fontSize);
        const lineHeight = style.lineHeight === "normal" ? fontSize * 1.4 : parseFloat(style.lineHeight);
        const box = el.getBoundingClientRect();
        if (box.width <= 1) return false;
        const content = box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        return content > lineHeight * 2 + 2;
      })
      .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90)}`),
  );
}

async function checkPaths(page: Page, paths: string[], file: string) {
  const report: Record<string, { primaries?: string[]; paragraphs?: string[] }> = {};
  for (const path of paths) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await open(page, path);
      const primaries = await visiblePrimaries(page);
      const key = `${path} @${vp.width}`;
      if (primaries.length > 1) report[key] = { primaries };
      expect.soft(primaries.length, `${key}: como mucho un botón principal (${primaries.join(" | ")})`).toBeLessThanOrEqual(1);
      const paragraphs = await longParagraphs(page);
      if (paragraphs.length > 0) report[key] = { ...report[key], paragraphs };
      expect.soft(paragraphs, `${key}: sin textos explicativos de más de 2 líneas`).toEqual([]);
    }
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/polish-${file}.json`, JSON.stringify(report, null, 2));
}

test("rutas globales: una acción principal y sin textos de más de 2 líneas", async ({ page }) => {
  await checkPaths(page, GLOBAL_ROUTES, "global");
});

// One test per product (its first market), so the workers share them; slots past the last are skipped.
for (let slot = 0; slot < 6; slot++) {
  test(`app ${slot + 1}: una acción principal por pantalla y sin textos de más de 2 líneas`, async ({ page, apps }) => {
    const products = firstMarkets(apps);
    test.skip(slot >= products.length, `La base de datos de prueba tiene ${products.length} apps`);
    await checkPaths(page, appPaths(products[slot], true), String(slot + 1));
  });
}

// Ajustes › Producto (D7): features as cards, edited in a side panel. Nothing is saved here.
test("Producto: las funciones se editan en un panel lateral, no en filas", async ({ page, apps }) => {
  const app = apps[0];
  await open(page, `/a/${app.slug}/ajustes/producto`);
  await expect(page.getByRole("status").filter({ hasText: /La IA (anuncia|no anuncia)|ficha de producto está vacía/ })).toBeVisible();
  // No more six-field rows: no feature name field until a panel opens.
  await expect(page.locator('input[name="name"]')).toHaveCount(0);
  const cards = page.getByRole("list", { name: "Funciones" }).getByRole("button");
  const target = (await cards.count()) > 0 ? cards.first() : page.getByRole("button", { name: "Añadir función" }).first();
  await target.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /^(Editar|Añadir) función$/ })).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Nombre" })).toBeVisible();
  await expect(sheet.getByRole("combobox", { name: "Estado" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

// A name of only spaces passes `required`, but the server refuses it: the panel says so and stays open.
test("Producto: una función sin nombre (solo espacios) no se da por guardada", async ({ page, apps }) => {
  const app = apps[0];
  await open(page, `/a/${app.slug}/ajustes/producto`);
  await page.getByRole("button", { name: "Añadir función" }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Nombre" }).fill("   ");
  await sheet.getByRole("button", { name: "Añadir", exact: true }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Ponle un nombre a la función.");
  await expect(sheet).toBeVisible();
  await expect(page.getByText("Función añadida")).toHaveCount(0);
});

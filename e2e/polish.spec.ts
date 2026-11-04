import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test, VIEWPORTS } from "./fixtures";
import { allPaths } from "./route-list";

// Phase 33 (DESIGN.md §1): on every route, at most ONE visible primary button, and no explanatory
// paragraph longer than 2 lines outside a HelpTip or an EmptyState. Store data (reviews, listing
// texts, AI output) is marked `data-content` and is not explanation, so it is skipped.

test.describe.configure({ timeout: 600_000 });

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

/** <p> inside <main> taller than two lines. */
function longParagraphs(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("main p"))
      .filter((p) => !p.closest("[data-help-tip], [data-empty-state], [role=tooltip], [role=dialog], [data-content], details:not([open])"))
      .filter((p) => {
        const style = getComputedStyle(p);
        if (style.display === "none" || style.visibility === "hidden" || p.getClientRects().length === 0) return false;
        const fontSize = parseFloat(style.fontSize);
        const lineHeight = style.lineHeight === "normal" ? fontSize * 1.4 : parseFloat(style.lineHeight);
        const box = p.getBoundingClientRect();
        if (box.width <= 1) return false;
        const content = box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        return content > lineHeight * 2 + 2;
      })
      .map((p) => (p.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90)),
  );
}

test("una acción principal por pantalla y sin párrafos de más de 2 líneas", async ({ page, apps }) => {
  const report: Record<string, { primaries?: string[]; paragraphs?: string[] }> = {};
  for (const path of allPaths(apps[0])) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await open(page, path);
      const primaries = await visiblePrimaries(page);
      const key = `${path} @${vp.width}`;
      if (primaries.length > 1) report[key] = { primaries };
      expect.soft(primaries.length, `${key}: como mucho un botón principal (${primaries.join(" | ")})`).toBeLessThanOrEqual(1);
      // The paragraph rule is about desktop reading width (1440 px).
      if (vp.width === 1440) {
        const paragraphs = await longParagraphs(page);
        if (paragraphs.length > 0) report[key] = { ...report[key], paragraphs };
        expect.soft(paragraphs, `${key}: sin párrafos explicativos de más de 2 líneas`).toEqual([]);
      }
    }
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/polish.json", JSON.stringify(report, null, 2));
});

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

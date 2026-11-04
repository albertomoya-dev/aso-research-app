import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { type E2eApp, expect, measureOverflow, test, VIEWPORTS } from "./fixtures";

// Phase 30: the store listing page (/ficha). Nothing here saves: no button that writes is pressed.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function open(page: Page, path: string, theme?: "light" | "dark") {
  if (theme) await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

/** The Google Play «recordatorio» app in Spain, the reference listing of the test database. */
function reference(apps: E2eApp[]): E2eApp {
  const app = apps.find((a) => a.slug === "recordatorio" && a.country === "es");
  test.skip(!app, "La base de datos de prueba no tiene la app «recordatorio» en España");
  return app!;
}
const ficha = (a: E2eApp) => `/a/${a.slug}/${a.country}/ficha`;

test.describe.configure({ timeout: 180_000 });

test("la vista previa muestra icono, título, descripción corta y 3 capturas", async ({ page, apps }) => {
  const app = reference(apps);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, ficha(app));
  const preview = page.getByRole("figure", { name: "Vista previa en Google Play" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("img", { name: "Icono de la app" })).toBeVisible();
  const title = await page.getByRole("textbox", { name: /^Título/ }).inputValue();
  const short = await page.getByRole("textbox", { name: /^Descripción corta/ }).inputValue();
  expect(title.length).toBeGreaterThan(0);
  await expect(preview.locator('[data-preview="title"]')).toHaveText(title);
  await expect(preview.locator('[data-preview="tagline"]')).toHaveText(short);
  await expect(preview.getByRole("img", { name: /^Captura \d/ })).toHaveCount(3);
  // The preview follows the editor.
  await page.getByRole("textbox", { name: /^Título/ }).fill("Título de prueba");
  await expect(preview.locator('[data-preview="title"]')).toHaveText("Título de prueba");
});

test("pulsar una keyword de Cobertura la resalta en el texto", async ({ page, apps }) => {
  const app = reference(apps);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, ficha(app));
  await page.getByRole("tab", { name: "Cobertura" }).click();
  // A keyword whose exact phrase is in a field: the first of the «En …» groups.
  const group = page.getByRole("group", { name: /^En / }).first();
  test.skip((await group.count()) === 0, "Ninguna keyword está entera en un campo");
  const keyword = group.getByRole("button").first();
  await expect(page.locator('[data-mark~="focus"]')).toHaveCount(0);
  await keyword.click();
  await expect(keyword).toHaveAttribute("aria-pressed", "true");
  const marks = page.locator('[data-mark~="focus"]');
  await expect(marks.first()).toBeAttached();
  const term = (await keyword.innerText()).replace(/\s*\d+×$/, "").trim();
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  expect(fold(await marks.first().innerText())).toBe(fold(term));
  // Pressing it again clears the highlight.
  await keyword.click();
  await expect(page.locator('[data-mark~="focus"]')).toHaveCount(0);
});

test("las vistas Publicada y Comparar sustituyen al bloque de la ficha publicada", async ({ page, apps }) => {
  const app = reference(apps);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, ficha(app));
  await page.getByRole("tab", { name: "Publicada" }).click();
  await expect(page.getByRole("region", { name: "Ficha publicada" })).toBeVisible();
  await page.getByRole("tab", { name: "Borrador" }).click();
  await page.getByRole("textbox", { name: /^Título/ }).fill("Recordatorio Zafiro");
  await page.getByRole("tab", { name: "Comparar" }).click();
  const compare = page.getByRole("region", { name: "Publicada frente a borrador" });
  await expect(compare.locator("ins").filter({ hasText: "Zafiro" })).toBeVisible();
});

test("/dev/ui: la propuesta de la IA se acepta campo a campo desde el diff", async ({ page }) => {
  await open(page, "/dev/ui", "light");
  const showcase = page.getByTestId("showcase-light");
  const proposal = showcase.getByRole("region", { name: "Propuesta de la IA" });
  const draft = showcase.getByTestId("proposal-demo-draft");
  await expect(proposal.locator("del").first()).toBeVisible();
  await expect(proposal.locator("ins").first()).toBeVisible();
  await expect(proposal.getByText(/Cobertura ponderada/)).toBeVisible();
  await expect(proposal.getByRole("heading", { name: /^Gana/ })).toBeVisible();

  await proposal.getByRole("button", { name: "Aceptar campo: Título" }).click();
  await expect(draft.locator('[data-field="title"]')).toHaveText("Recordatorio de pastillas");
  await expect(proposal.getByRole("button", { name: "Aceptar campo: Título" })).toHaveCount(0);
  // The other fields are still pending and untouched.
  await expect(draft.locator('[data-field="shortDescription"]')).toHaveText("Avisos para tus medicinas, gratis y sin registro.");
  await proposal.getByRole("button", { name: "Descartar campo: Descripción corta" }).click();
  await expect(draft.locator('[data-field="shortDescription"]')).toHaveText("Avisos para tus medicinas, gratis y sin registro.");
  await expect(proposal.getByRole("button", { name: "Aceptar todo (1)" })).toBeVisible();
  await proposal.getByRole("button", { name: "Aceptar todo (1)" }).click();
  await expect(proposal).toHaveCount(0);
});

// Phase 33: Tendencias «Preparar temporada» opens /ficha?focus=…, and the optimizer's focus starts filled.
// The e2e server has no Anthropic key, so the field is not there: the page then shows the focus in a note.
test("?focus= rellena el enfoque de «Optimizar con IA»", async ({ page, apps }) => {
  const app = reference(apps);
  const focus = "Temporada de «pastillero» en diciembre";
  await open(page, `${ficha(app)}?focus=${encodeURIComponent(focus)}`);
  await expect(page.getByRole("heading", { name: "Ficha de la tienda", level: 1 })).toBeVisible();
  const field = page.locator("#ai-focus");
  if ((await field.count()) > 0) await expect(field).toHaveValue(focus);
  else await expect(page.getByTestId("focus-note")).toContainText(focus);
});

for (const vp of VIEWPORTS) {
  test(`/ficha sin scroll horizontal · ${vp.name}`, async ({ page, apps }) => {
    const app = reference(apps);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await open(page, ficha(app));
    await expect(page.getByRole("heading", { name: "Ficha de la tienda", level: 1 })).toBeVisible();
    for (const tab of ["Vista previa", "Cobertura", "Normas", "Notas de la versión"]) {
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      const o = await measureOverflow(page);
      expect(o.scrollWidth, `documento con «${tab}» (${o.widest ?? ""})`).toBeLessThanOrEqual(o.innerWidth);
      expect(o.mainScrollWidth, `<main> con «${tab}» (${o.widest ?? ""})`).toBeLessThanOrEqual(o.mainClientWidth);
    }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`/ficha sin fallos graves de accesibilidad · ${theme}`, async ({ page, apps }) => {
    const app = reference(apps);
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, ficha(app), theme);
    await expect(page.getByRole("heading", { name: "Ficha de la tienda", level: 1 })).toBeVisible();
    for (const tab of ["Vista previa", "Cobertura", "Normas"]) {
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const serious = result.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical" || v.id === "scrollable-region-focusable" || v.id === "link-in-text-block")
        .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" ")}`);
      expect(serious, `pestaña «${tab}»`).toEqual([]);
    }
  });
}

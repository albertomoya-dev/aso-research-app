import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { type E2eApp, expect, measureOverflow, test } from "./fixtures";

// Creativos: the screenshot editor (phase 32). Nothing here saves: «Guardar» is never pressed, so the
// design in the test database stays as it was.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function open(page: Page, path: string, theme?: "light" | "dark") {
  if (theme) await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

const creativos = (a: E2eApp) => `/a/${a.slug}/creativos`;
const headlineBox = (page: Page) => page.getByRole("textbox", { name: /^Titular \d/ });
const thumb = (page: Page, n: number) => page.getByRole("button", { name: `Pantalla ${n}`, exact: true });

/** Opens the studio with at least two screens. */
async function openStudio(page: Page, apps: E2eApp[]) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, creativos(apps[0]));
  await expect(headlineBox(page)).toBeVisible();
  if ((await thumb(page, 2).count()) === 0) await page.getByRole("button", { name: /Añadir pantalla/ }).click();
  await expect(thumb(page, 2)).toBeVisible();
}

test.describe.configure({ timeout: 180_000 });

test("smoke: elegir una pantalla, cambiar el titular y descargar el ZIP", async ({ page, apps }) => {
  await openStudio(page, apps);
  await thumb(page, 2).click();
  await expect(thumb(page, 2)).toHaveAttribute("aria-pressed", "true");
  await headlineBox(page).fill("Titular de *prueba*");
  await expect(headlineBox(page)).toHaveValue("Titular de *prueba*");
  const download = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: /ZIP/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});

test("las secciones del inspector se pliegan y se despliegan", async ({ page, apps }) => {
  await openStudio(page, apps);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  for (const name of [/^Texto/, /^Captura$/, /^Dispositivo$/, /^Estilo$/, /^Fondo$/]) {
    await expect(inspector.getByRole("button", { name })).toBeVisible();
  }
  const device = inspector.getByRole("button", { name: "Dispositivo" });
  await expect(device).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("slider", { name: /Tamaño del móvil/ })).toBeHidden();
  await device.click();
  await expect(device).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("slider", { name: /Tamaño del móvil/ })).toBeVisible();
  const text = inspector.getByRole("button", { name: /^Texto/ });
  await text.click();
  await expect(text).toHaveAttribute("aria-expanded", "false");
  await expect(headlineBox(page)).toBeHidden();
  await text.click();
  await expect(headlineBox(page)).toBeVisible();
});

test("las miniaturas se reordenan con los botones y con Alt+flechas", async ({ page, apps }) => {
  await openStudio(page, apps);
  await thumb(page, 1).click();
  await headlineBox(page).fill("Orden uno");
  await page.getByRole("button", { name: "Bajar la pantalla 1" }).click();
  // The screen moved to position 2 and stays selected.
  await expect(thumb(page, 2)).toHaveAttribute("aria-pressed", "true");
  await expect(thumb(page, 2)).toHaveAttribute("title", "Orden uno");
  await expect(headlineBox(page)).toHaveValue("Orden uno");
  await expect(page.getByText("Pantalla 1 movida a la posición 2.")).toBeVisible();
  // Back with the keyboard.
  await thumb(page, 2).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(thumb(page, 1)).toHaveAttribute("title", "Orden uno");
  await expect(thumb(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(thumb(page, 1)).toBeFocused();
  // Arrows alone only move the selection.
  await page.keyboard.press("ArrowDown");
  await expect(thumb(page, 2)).toHaveAttribute("aria-pressed", "true");
  await expect(thumb(page, 1)).toHaveAttribute("title", "Orden uno");
});

test("una plantilla no pisa tus colores sin preguntar (H23)", async ({ page, apps }) => {
  await openStudio(page, apps);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("button", { name: "Estilo" }).click();
  const accent = page.getByLabel(/^Acento/);
  await accent.fill("#123456");
  await expect(accent).toHaveValue("#123456");
  await page.getByRole("button", { name: "Cambiar plantilla" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Plantillas" })).toBeVisible();
  await dialog.getByRole("button", { name: "Tarjeta" }).click();
  await expect(dialog.getByRole("heading", { name: "¿Sustituir tus colores?" })).toBeVisible();
  // «Mantener mis colores» applies the composition and keeps the accent.
  await dialog.getByRole("button", { name: "Mantener mis colores" }).click();
  await expect(dialog).toBeHidden();
  await expect(inspector.getByText("Plantilla: Tarjeta")).toBeVisible();
  await expect(accent).toHaveValue("#123456");
  // «Usar los de la plantilla» replaces them, and the toast undoes it.
  await page.getByRole("button", { name: "Cambiar plantilla" }).click();
  await dialog.getByRole("button", { name: "Resplandor" }).click();
  await dialog.getByRole("button", { name: "Usar los de la plantilla" }).click();
  await expect(inspector.getByText("Plantilla: Resplandor")).toBeVisible();
  await expect(accent).not.toHaveValue("#123456");
  await page.locator("[data-sonner-toast]").filter({ hasText: "Resplandor" }).getByRole("button", { name: "Deshacer" }).click();
  await expect(inspector.getByText("Plantilla: Tarjeta")).toBeVisible();
  await expect(accent).toHaveValue("#123456");
});

test("móvil: aviso «Mejor en un ordenador», zonas apiladas y sin scroll horizontal", async ({ page, apps }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, creativos(apps[0]));
  await expect(page.getByText("Mejor en un ordenador.")).toBeVisible();
  await expect(headlineBox(page)).toBeVisible();
  const overflow = await measureOverflow(page);
  expect(overflow.scrollWidth, overflow.widest).toBeLessThanOrEqual(overflow.innerWidth);
  expect(overflow.mainScrollWidth, overflow.widest).toBeLessThanOrEqual(overflow.mainClientWidth);
});

for (const theme of ["light", "dark"] as const) {
  test(`Creativos sin fallos AA · ${theme}`, async ({ page, apps }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, creativos(apps[0]), theme);
    await expect(headlineBox(page)).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" ")}`)).toEqual([]);
  });
}

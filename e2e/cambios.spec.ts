import AxeBuilder from "@axe-core/playwright";
import { neon } from "@neondatabase/serverless";
import type { Page } from "@playwright/test";
import { type E2eApp, expect, test } from "./fixtures";

// Cambios y pruebas (phase 32): the timeline with its impact and the experiments board. The one entry
// this creates is deleted through the page, and again in afterAll in case a step failed.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const LABEL_PREFIX = "e2e cambio";

async function open(page: Page, path: string, theme?: "light" | "dark") {
  if (theme) await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

const cambios = (a: E2eApp) => `/a/${a.slug}/${a.country}/cambios`;

test.describe.configure({ timeout: 180_000 });

test.afterAll(async () => {
  const sql = neon(process.env.E2E_RESOLVED_DATABASE_URL!);
  await sql`delete from annotations where source = 'manual' and label like ${LABEL_PREFIX + "%"}`;
});

test("la línea de tiempo muestra un cambio manual con su impacto, y se borra", async ({ page, apps }) => {
  const app = apps[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, cambios(app));
  await expect(page.getByRole("heading", { name: "Cambios y pruebas", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Línea de tiempo/ })).toBeVisible();

  const label = `${LABEL_PREFIX} ${Date.now()}`;
  await page.getByRole("button", { name: "Añadir cambio" }).click();
  const dialog = page.getByRole("dialog", { name: "Añadir cambio" });
  await dialog.getByLabel("Qué cambió").fill(label);
  await dialog.getByRole("button", { name: "Añadir anotación" }).click();
  await expect(dialog).toBeHidden();

  const entry = page.getByRole("listitem", { name: label });
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute("data-kind", "manual");
  await expect(entry.getByText("Manual").first()).toBeVisible();
  // Its impact: the aggregate line with its DeltaBadge, or «Sin datos suficientes» on a market without positions.
  const impact = entry.locator("[data-impact]");
  await expect(impact).toHaveText(/keywords? medidas? · posición media .+ → |Sin datos suficientes/);

  await entry.getByRole("button", { name: `Borrar «${label}»` }).click();
  await page.getByRole("dialog", { name: "¿Borrar este cambio?" }).getByRole("button", { name: "Borrar" }).click();
  await expect(entry).toHaveCount(0);
});

test("los experimentos van en tres columnas y se editan en un panel lateral", async ({ page, apps }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, cambios(apps[0]));
  for (const name of ["Planeado", "En marcha", "Terminado"]) {
    await expect(page.getByRole("region", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  const columns = page.locator("section[data-status]");
  await expect(columns).toHaveCount(3);
  // Side by side on desktop.
  const boxes = await Promise.all([0, 1, 2].map((i) => columns.nth(i).boundingBox()));
  expect(boxes[0]!.y).toBeCloseTo(boxes[2]!.y, 0);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  await page.getByRole("button", { name: "Nuevo experimento" }).click();
  const sheet = page.getByRole("dialog", { name: "Nuevo experimento" });
  await expect(sheet.getByLabel("Nombre")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

for (const theme of ["light", "dark"] as const) {
  test(`Cambios y pruebas sin fallos AA · ${theme}`, async ({ page, apps }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, cambios(apps[0]), theme);
    await expect(page.getByRole("heading", { name: "Cambios y pruebas", level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" ")}`)).toEqual([]);
  });
}

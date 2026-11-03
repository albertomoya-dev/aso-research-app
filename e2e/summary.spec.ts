import AxeBuilder from "@axe-core/playwright";
import { neon } from "@neondatabase/serverless";
import type { Page } from "@playwright/test";
import { type E2eApp, expect, measureOverflow, test, VIEWPORTS } from "./fixtures";

// Phase 28: Inicio and a market's Resumen. Nothing here changes data.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const market = (a: E2eApp) => `/a/${a.slug}/${a.country}`;

test.describe.configure({ timeout: 180_000 });

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
}

/** Annotations of a market in the last `days` days and whether it has checks: what the chart can show. */
async function chartData(appId: number, days = 30) {
  const sql = neon(process.env.E2E_RESOLVED_DATABASE_URL!);
  const [row] = (await sql`
    select (select count(*) from annotations where app_id = ${appId} and date >= current_date - ${days}::int) as annotations,
           (select count(*) from rank_snapshots where app_id = ${appId} and date >= current_date - ${days}::int) as snapshots`) as { annotations: string; snapshots: string }[];
  return { annotations: Number(row.annotations), snapshots: Number(row.snapshots) };
}

test("Inicio: KPIs, una fila por mercado que abre su Resumen y «Qué hacer hoy»", async ({ page, apps }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const started = Date.now();
  await open(page, "/");
  const kpis = page.getByRole("region", { name: "Cifras de todas las apps" });
  await expect(kpis).toBeVisible();
  for (const label of ["En el TOP 10", "En el TOP 30", "Visibilidad media", "Avisos sin leer"]) {
    await expect.soft(kpis.getByRole("heading", { name: label })).toBeVisible();
  }
  const rows = page.getByTestId("home-market-row");
  await expect(rows).toHaveCount(apps.length);
  await expect(page.getByRole("heading", { name: "Qué hacer hoy" })).toBeVisible();
  // The task list (or its «nada urgente» line) streams in after the health of every market.
  await expect(page.getByTestId("today-tasks").or(page.getByText("Nada urgente hoy."))).toBeVisible({ timeout: 60_000 });
  test.info().annotations.push({ type: "timing", description: `Inicio completo (con salud y tareas) en ${Date.now() - started} ms con ${apps.length} mercados` });

  // Rows go by app name, then country; each one links to a followed market's Resumen.
  const link = rows.first().getByRole("link");
  const href = (await link.getAttribute("href"))!;
  expect(apps.map(market)).toContain(href);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
});

test("Inicio: tiempo de servidor de la primera respuesta", async ({ request }) => {
  // Warm-up, then the measured request: the full HTML, streamed sections included.
  await request.get("/");
  const started = Date.now();
  const response = await request.get("/");
  const ms = Date.now() - started;
  expect(response.status()).toBe(200);
  test.info().annotations.push({ type: "timing", description: `GET / (HTML completo) en ${ms} ms` });
});

test("Inicio en el móvil: tarjetas en lugar de la tabla", async ({ page, apps }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/");
  await expect(page.getByTestId("home-market-row").first()).toBeHidden();
  const cards = page.getByRole("region", { name: "Tus apps" }).getByRole("listitem");
  await expect(cards).toHaveCount(apps.length);
});

test("Resumen: KPIs, gráfico con las anotaciones, próximos pasos, movimientos y competencia", async ({ page, apps }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The market with the most checks shows the most.
  const withData = [];
  for (const a of apps) withData.push({ a, ...(await chartData(a.id)) });
  const pick = withData.sort((x, y) => y.annotations - x.annotations || y.snapshots - x.snapshots)[0];
  await open(page, market(pick.a));
  const kpis = page.getByRole("region", { name: "Cifras de la semana" });
  for (const label of ["Visibilidad", "En el TOP 10", "En el TOP 30", "Valoración"]) {
    await expect.soft(kpis.getByRole("heading", { name: label, exact: true })).toBeVisible();
  }
  if (pick.snapshots > 0) {
    await expect(page.getByTestId("visibility-chart").locator("svg.recharts-surface")).toBeVisible();
    const markers = page.getByTestId("annotation-marker");
    if (pick.annotations > 0) await expect(markers.first()).toBeAttached();
    else {
      await expect(markers).toHaveCount(0);
      test.info().annotations.push({ type: "note", description: "La base de datos de prueba no tiene anotaciones en los últimos 30 días: sin marcas que comprobar." });
    }
  } else {
    await expect(page.getByText(/Aún no hay posiciones en estos 30 días/)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Próximos pasos" })).toBeVisible();
  await expect(page.getByText(/en orden|Nada urgente/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Movimientos de la semana" })).toBeVisible();
  // The range switcher keeps the page and changes the chart.
  await page.getByRole("navigation", { name: "Periodo del gráfico" }).getByRole("link", { name: "90 días" }).click();
  await expect(page).toHaveURL(/\?dias=90$/);
  await expect(page.getByRole("link", { name: "90 días" })).toHaveAttribute("aria-current", "page");
  // The keyword table is still one click away.
  await expect(page.getByRole("navigation", { name: /^Navegación de / }).getByRole("link", { name: /^Seguimiento/ })).toHaveAttribute("href", `${market(pick.a)}/keywords`);
});

for (const vp of VIEWPORTS) {
  test(`Inicio y Resumen sin scroll horizontal a ${vp.width} px`, async ({ page, apps }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of ["/", ...new Set(apps.map(market))]) {
      await open(page, path);
      const o = await measureOverflow(page);
      expect.soft(o.scrollWidth, `${path} @${vp.width}${o.widest ? ` (${o.widest})` : ""}`).toBeLessThanOrEqual(o.innerWidth);
      expect.soft(o.mainScrollWidth, `${path} @${vp.width}: <main>${o.widest ? ` (${o.widest})` : ""}`).toBeLessThanOrEqual(o.mainClientWidth);
    }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Inicio y Resumen sin fallos AA de axe · ${theme}`, async ({ page, apps }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    for (const path of ["/", market(apps[0])]) {
      await open(page, path);
      // Wait for the streamed sections, so axe sees the finished page.
      await expect(page.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 60_000 });
      const result = await new AxeBuilder({ page }).withTags(TAGS).include("main").analyze();
      expect.soft(
        result.violations.map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => JSON.stringify(n.target)).join(" ")}`),
      ).toEqual([]);
    }
  });
}

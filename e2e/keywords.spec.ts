import { neon } from "@neondatabase/serverless";
import { type E2eApp, expect, measureOverflow, test } from "./fixtures";

// Phase 29: the keyword table (Seguimiento), its detail panel and the Encontrar screen.

const market = (a: E2eApp) => `/a/${a.slug}/${a.country}`;

async function open(page: import("@playwright/test").Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

test.describe.configure({ timeout: 180_000 });

const withKeywords = (apps: E2eApp[]) => {
  const app = apps.find((a) => a.keywordId != null);
  if (!app) throw new Error("La base de datos de prueba no tiene ninguna app con keywords.");
  return app;
};

test("Seguimiento: como mucho 25 botones visibles sin selección", async ({ page, apps }) => {
  const app = withKeywords(apps);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(app)}/keywords`);
  await expect(page.getByRole("table", { name: "Keywords" })).toBeVisible();
  const visible = await page.locator("button:visible").count();
  test.info().annotations.push({ type: "botones", description: `${visible} botones visibles en ${market(app)}/keywords` });
  expect(visible).toBeLessThanOrEqual(25);
  // Ticking a row brings the floating selection bar.
  await page.getByRole("table", { name: "Keywords" }).getByRole("checkbox").nth(1).check();
  await expect(page.getByRole("region", { name: "Acciones con la selección" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Acciones con la selección" }).getByRole("button", { name: "Cambiar relevancia" })).toBeVisible();
});

test("?k= abre el panel de detalle, y se cierra quitándolo de la URL", async ({ page, apps }) => {
  const app = withKeywords(apps);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(app)}/keywords?k=${app.keywordId}`);
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "Analizar TOP 10" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Quitar" })).toBeVisible();
  await expect(panel.getByText(/^Dónde aparece en tu ficha/)).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.width).toBe(480);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]k=/);
  // Opening a row from the table puts it back in the URL.
  await page.getByRole("table", { name: "Keywords" }).getByRole("link").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/[?&]k=\d+/);
});

test("a 390 px la tabla pasa a tarjetas, con los filtros en una hoja inferior y sin scroll horizontal", async ({ page, apps }) => {
  const app = withKeywords(apps);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `${market(app)}/keywords`);
  await expect(page.getByRole("list", { name: "Keywords" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Keywords" })).toBeHidden();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("dialog", { name: "Filtros" })).toBeVisible();
  await page.keyboard.press("Escape");
  const overflow = await measureOverflow(page);
  expect(overflow.scrollWidth, overflow.widest ?? "").toBeLessThanOrEqual(overflow.innerWidth);
});

test("Encontrar: lo descartado no vuelve tras recargar", async ({ page, apps }) => {
  const app = apps[0];
  const sql = neon(process.env.E2E_RESOLVED_DATABASE_URL!);
  const term = `e2e descartar ${Date.now()}`;
  // A review word waiting in the tray, as the analysis of the reviews leaves it.
  await sql`insert into keyword_candidates (app_id, term, source, reason) values (${app.id}, ${term}, 'reviews', 'Aparece en las reseñas')`;
  try {
    await open(page, `${market(app)}/encontrar?fuente=pendientes`);
    const list = page.getByRole("region", { name: "Candidatas pendientes" });
    const box = list.getByRole("checkbox", { name: new RegExp(term) });
    await expect(box).toBeVisible();
    await expect(list.getByText("Reseñas").first()).toBeVisible();
    await box.check();
    await list.getByRole("button", { name: /^Descartar 1$/ }).click();
    await expect(box).toBeHidden();
    await open(page, `${market(app)}/encontrar?fuente=pendientes`);
    await expect(page.getByText(term)).toHaveCount(0);
    const [row] = (await sql`select status from keyword_candidates where app_id = ${app.id} and term = ${term}`) as { status: string }[];
    expect(row.status).toBe("dismissed");
  } finally {
    await sql`delete from keyword_candidates where app_id = ${app.id} and term = ${term}`;
  }
});

test("las páginas antiguas de Encontrar redirigen con 308 a su fuente y conservan la query", async ({ request, apps }) => {
  const app = apps[0];
  const cases = [
    [`${market(app)}/descubrir?seed=correr`, `${market(app)}/encontrar?seed=correr&fuente=autocompletado`],
    [`${market(app)}/ideas`, `${market(app)}/encontrar?fuente=ia`],
    [`${market(app)}/top10?kw=all`, `${market(app)}/encontrar?kw=all&fuente=top10`],
    [`/apps/${app.id}/descubrir?seed=correr`, `${market(app)}/encontrar?seed=correr&fuente=autocompletado`],
    [`/apps/${app.id}/top10`, `${market(app)}/encontrar?fuente=top10`],
  ] as const;
  for (const [from, to] of cases) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect.soft(response.status(), `${from} responde 308`).toBe(308);
    const location = new URL(response.headers()["location"] ?? "", "http://x");
    expect.soft(location.pathname + location.search, `${from} lleva a ${to}`).toBe(to);
  }
});

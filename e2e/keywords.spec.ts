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

// Every kind of candidate waiting in the tray: review words, autocomplete and TOP 10 terms kept in
// keyword_candidates, and an AI idea (ai_suggestions). Test rows, deleted at the end.
const DISMISS_CASES = [
  { source: "reviews", table: "keyword_candidates" },
  { source: "autocomplete", table: "keyword_candidates" },
  { source: "top10", table: "keyword_candidates" },
  { source: "ai", table: "ai_suggestions" },
] as const;

for (const { source, table } of DISMISS_CASES) {
  test(`Encontrar: lo descartado (${source}) no vuelve tras recargar`, async ({ page, apps }) => {
    const app = apps[0];
    const sql = neon(process.env.E2E_RESOLVED_DATABASE_URL!);
    const term = `e2e descartar ${source} ${Date.now()}`;
    if (table === "ai_suggestions") {
      await sql`insert into ai_suggestions (app_id, term, language, intent, relevance, estimated_competition, reason, model, prompt_version)
        values (${app.id}, ${term}, 'es', 'own', 4, 'media', 'Prueba e2e', 'e2e', 'e2e')`;
    } else {
      await sql`insert into keyword_candidates (app_id, term, source, reason) values (${app.id}, ${term}, ${source}, 'Prueba e2e')`;
    }
    try {
      await open(page, `${market(app)}/encontrar?fuente=pendientes`);
      const list = page.getByRole("region", { name: "Candidatas pendientes" });
      const box = list.getByRole("checkbox", { name: new RegExp(term) });
      await expect(box).toBeVisible();
      if (source === "reviews") await expect(list.getByText("Reseñas").first()).toBeVisible();
      await box.check();
      await list.getByRole("button", { name: /^Descartar 1$/ }).click();
      await expect(box).toBeHidden();
      await open(page, `${market(app)}/encontrar?fuente=pendientes`);
      await expect(page.getByText(term)).toHaveCount(0);
      const rows = (table === "ai_suggestions"
        ? await sql`select status from ai_suggestions where app_id = ${app.id} and term = ${term}`
        : await sql`select status from keyword_candidates where app_id = ${app.id} and term = ${term}`) as { status: string }[];
      expect(rows.map((r) => r.status)).toContain("dismissed");
      // An AI idea is also dismissed in its own source.
      if (source === "ai") {
        await open(page, `${market(app)}/encontrar?fuente=ia`);
        await expect(page.getByText(term)).toHaveCount(0);
      }
    } finally {
      await sql`delete from keyword_candidates where app_id = ${app.id} and term = ${term}`;
      await sql`delete from ai_suggestions where app_id = ${app.id} and term = ${term}`;
    }
  });
}

// The panel keeps a copy of the keyword's data: what is saved in it shows when it is opened again.
test("panel: la relevancia y la intención guardadas se ven al volver a abrirlo", async ({ page, apps }) => {
  const app = withKeywords(apps);
  const sql = neon(process.env.E2E_RESOLVED_DATABASE_URL!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(app)}/keywords`);
  // The first row shown, whatever the default filters leave.
  const link = page.getByRole("table", { name: "Keywords" }).getByRole("link").first();
  const term = (await link.textContent())!.trim();
  const keywordId = Number(new URL((await link.getAttribute("href"))!, "http://x").searchParams.get("k"));
  const [before] = (await sql`select relevance, relevance_source, relevance_checked_at, intent from app_keywords
    where app_id = ${app.id} and keyword_id = ${keywordId}`) as { relevance: number | null; relevance_source: string | null; relevance_checked_at: string | null; intent: string | null }[];
  try {
    const openPanel = async () => {
      await page.getByRole("table", { name: "Keywords" }).getByRole("link", { name: term, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      return page.getByRole("dialog");
    };
    let panel = await openPanel();
    const relevance = before.relevance === 5 ? "4" : "5";
    const intent = before.intent === "foreign" ? "own" : "foreign";
    await panel.getByRole("combobox", { name: `Relevancia de ${term}` }).selectOption(relevance);
    await expect(panel.getByRole("combobox", { name: `Relevancia de ${term}` })).toBeEnabled();
    await panel.getByRole("combobox", { name: `Intención de ${term}` }).selectOption(intent);
    await expect(panel.getByRole("combobox", { name: `Intención de ${term}` })).toBeEnabled();
    await expect(panel.getByRole("combobox", { name: `Relevancia de ${term}` })).toHaveValue(relevance);
    await expect(panel.getByRole("combobox", { name: `Intención de ${term}` })).toHaveValue(intent);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    // Opened from the table, closing goes back in the history: the URL loses ?k=.
    await expect(page).not.toHaveURL(/[?&]k=/);
    panel = await openPanel();
    await expect(panel.getByRole("combobox", { name: `Relevancia de ${term}` })).toHaveValue(relevance);
    await expect(panel.getByRole("combobox", { name: `Intención de ${term}` })).toHaveValue(intent);
  } finally {
    await sql`update app_keywords set relevance = ${before.relevance}, relevance_source = ${before.relevance_source},
      relevance_checked_at = ${before.relevance_checked_at}, intent = ${before.intent}
      where app_id = ${app.id} and keyword_id = ${keywordId}`;
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

import { collectErrors, type E2eApp, expect, measureOverflow, recordOverflow, test, VIEWPORTS } from "./fixtures";

// Every current route, for every app in the test database, at 390 and 1440 px: it answers 200 and
// logs no errors. Neither the document nor <main> (which scrolls on its own) may scroll sideways on
// any route (DESIGN.md; since phase 32 there is no report-only exception).

const GLOBAL_ROUTES = ["/", "/apps/nueva", "/actividad", "/actividad?vista=semana", "/integraciones"];

const market = (a: E2eApp) => `/a/${a.slug}/${a.country}`;
const product = (a: E2eApp) => `/a/${a.slug}`;

const APP_ROUTES: { route: string; path: (app: E2eApp) => string | null }[] = [
  { route: "/a/[app]/[market]", path: market },
  { route: "/a/[app]/[market]/keywords/[keywordId]", path: (a) => (a.keywordId ? `${market(a)}/keywords/${a.keywordId}` : null) },
  { route: "/a/[app]/[market]/keywords?k=[keywordId]", path: (a) => (a.keywordId ? `${market(a)}/keywords?k=${a.keywordId}` : null) },
  ...[
    "keywords",
    "encontrar",
    "encontrar?fuente=pendientes",
    "encontrar?fuente=ia",
    "encontrar?fuente=top10",
    "competidores",
    "resenas",
    "tendencias",
    "ficha",
    "ficha/publicar",
    "cambios",
  ].map((sub) => ({
    route: `/a/[app]/[market]/${sub}`,
    path: (a: E2eApp) => `${market(a)}/${sub}`,
  })),
  // Product-level pages: the same for every market of a product, so they are visited once per product.
  ...[
    "ajustes",
    "ajustes/producto",
    "ajustes/mercados",
    "ajustes/marcas",
    "ajustes/play",
    "ajustes/peligro",
    "creativos",
    "creativos/icono",
    "creativos/logo",
    "creativos/video",
  ].map((sub) => ({
    route: `/a/[app]/${sub}`,
    path: (a: E2eApp) => `${product(a)}/${sub}`,
  })),
];

// Old /apps/[id] URLs (bookmarks, weekly emails) must answer 308 to their new path.
const LEGACY_REDIRECTS: { from: (a: E2eApp) => string; to: (a: E2eApp) => string }[] = [
  { from: (a) => `/apps/${a.id}`, to: (a) => `${market(a)}/keywords` },
  { from: (a) => `/apps/${a.id}/metadata`, to: (a) => `${market(a)}/ficha` },
  { from: (a) => `/apps/${a.id}/estacionalidad`, to: (a) => `${market(a)}/tendencias` },
  { from: (a) => `/apps/${a.id}/producto`, to: (a) => `${product(a)}/ajustes/producto` },
  { from: (a) => `/apps/${a.id}/creativos/icono`, to: (a) => `${product(a)}/creativos/icono` },
  // Phase 29: the three find pages are one screen; the old /apps/[id] URLs go straight to it.
  { from: (a) => `/apps/${a.id}/descubrir`, to: (a) => `${market(a)}/encontrar` },
  { from: (a) => `/apps/${a.id}/ideas`, to: (a) => `${market(a)}/encontrar` },
];

// Some pages read Google Play live (search, autocomplete, reviews), so they get room.
test.describe.configure({ timeout: 300_000 });

/** One load; null status when the navigation itself failed (timeout, aborted). */
async function load(page: import("@playwright/test").Page, path: string): Promise<number | null> {
  try {
    const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    return response?.status() ?? null;
  } catch {
    return null;
  }
}

async function visit(page: import("@playwright/test").Page, route: string, path: string) {
  const errors = collectErrors(page);
  for (const vp of VIEWPORTS) {
    await test.step(`${path} a ${vp.width} px`, async () => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      errors.length = 0;
      let status = await load(page, path);
      // The pages read the database and Google Play over the network; one retry absorbs a dropped
      // connection, and it is annotated so a flaky route still shows up.
      if (status !== 200 || errors.length > 0) {
        test.info().annotations.push({ type: "retry", description: `${path} @${vp.width}: ${status ?? "sin respuesta"} · ${errors.join(" | ").slice(0, 300)}` });
        errors.length = 0;
        status = await load(page, path);
      }
      expect.soft(status, `${path} responde 200`).toBe(200);
      const overflow = await measureOverflow(page);
      recordOverflow({ route, path, width: vp.width, ...overflow });
      if (overflow.scrollWidth > overflow.innerWidth || overflow.mainScrollWidth > overflow.mainClientWidth) {
        test.info().annotations.push({
          type: "overflow",
          description: `${path} @${vp.width}: documento ${overflow.scrollWidth}/${overflow.innerWidth}, main ${overflow.mainScrollWidth}/${overflow.mainClientWidth}${overflow.widest ? ` · ${overflow.widest}` : ""}`,
        });
      }
      const culprit = overflow.widest ? ` (${overflow.widest})` : "";
      expect.soft(overflow.scrollWidth, `${path} @${vp.width}: el documento no hace scroll horizontal${culprit}`).toBeLessThanOrEqual(overflow.innerWidth);
      expect.soft(overflow.mainScrollWidth, `${path} @${vp.width}: <main> no hace scroll horizontal${culprit}`).toBeLessThanOrEqual(overflow.mainClientWidth);
      expect.soft(errors, `${path} @${vp.width} sin errores en la consola`).toEqual([]);
    });
  }
}

for (const route of GLOBAL_ROUTES) {
  test(`ruta ${route}`, async ({ page }) => {
    await visit(page, route, route);
  });
}

for (const { route, path } of APP_ROUTES) {
  test(`ruta ${route}`, async ({ page, apps }) => {
    expect(apps.length, "la base de datos de prueba tiene apps").toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const app of apps) {
      const p = path(app);
      if (p && !seen.has(p)) {
        seen.add(p);
        await visit(page, route, p);
      }
    }
  });
}

test("las URLs antiguas redirigen con 308", async ({ request, apps }) => {
  for (const app of apps) {
    for (const { from, to } of LEGACY_REDIRECTS) {
      const response = await request.get(from(app), { maxRedirects: 0 });
      expect.soft(response.status(), `${from(app)} responde 308`).toBe(308);
      expect.soft(new URL(response.headers()["location"] ?? "", "http://x").pathname, `${from(app)} lleva a ${to(app)}`).toBe(to(app));
    }
  }
});

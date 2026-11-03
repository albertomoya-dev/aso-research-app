import { collectErrors, type E2eApp, expect, measureOverflow, recordOverflow, test, VIEWPORTS } from "./fixtures";

// Every current route, for every app in the test database, at 390 and 1440 px: it answers 200 and
// logs no errors. Horizontal overflow is measured and annotated, not asserted (phases 27–29 fix it).

const GLOBAL_ROUTES = ["/", "/buscar", "/novedades", "/resumen", "/ajustes"];

const APP_ROUTES: { route: string; path: (app: E2eApp) => string | null }[] = [
  { route: "/apps/[id]", path: (a) => `/apps/${a.id}` },
  { route: "/apps/[id]/keywords/[keywordId]", path: (a) => (a.keywordId ? `/apps/${a.id}/keywords/${a.keywordId}` : null) },
  ...["descubrir", "ideas", "top10", "competidores", "resenas", "estacionalidad", "metadata", "metadata/publicar", "producto", "creativos", "creativos/icono", "creativos/logo", "creativos/video", "cambios"].map((sub) => ({
    route: `/apps/[id]/${sub}`,
    path: (a: E2eApp) => `/apps/${a.id}/${sub}`,
  })),
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
    for (const app of apps) {
      const p = path(app);
      if (p) await visit(page, route, p);
    }
  });
}

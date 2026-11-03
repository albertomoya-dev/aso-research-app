import { type E2eApp, expect, test } from "./fixtures";

// Phase 27: the navigation shell. Nothing here changes data: the unfollow dialog is opened, never sent.

const market = (a: E2eApp) => `/a/${a.slug}/${a.country}`;

async function open(page: import("@playwright/test").Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

test.describe.configure({ timeout: 180_000 });

test("las páginas globales antiguas redirigen con 308 y conservan la query", async ({ request }) => {
  const cases = [
    ["/novedades?app=1", "/actividad?app=1"],
    ["/resumen", "/actividad?vista=semana"],
    ["/ajustes", "/integraciones"],
    ["/buscar?q=pills&store=android", "/apps/nueva?q=pills&store=android"],
  ] as const;
  for (const [from, to] of cases) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect.soft(response.status(), `${from} responde 308`).toBe(308);
    const location = new URL(response.headers()["location"] ?? "", "http://x");
    expect.soft(location.pathname + location.search, `${from} lleva a ${to}`).toBe(to);
  }
});

test("/apps/nueva es la búsqueda de apps, no un id antiguo", async ({ page }) => {
  await open(page, "/apps/nueva");
  await expect(page.getByRole("heading", { name: "Añadir app", level: 1 })).toBeVisible();
});

test("dentro de una app: barra lateral de la app, sin pestañas horizontales y cabecera con el mercado", async ({ page, apps }) => {
  const app = apps[0];
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(app)}/keywords`);
  // The old tab bar is gone, and no tab list carries the app's sections.
  await expect(page.locator('nav[aria-label="Secciones de la app"]')).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  const sidebar = page.getByRole("navigation", { name: /^Navegación de / });
  for (const name of ["Resumen", "Seguimiento", "Encontrar", "Competidores", "Reseñas", "Tendencias", "Ficha de la tienda", "Creativos", "Cambios y pruebas", "Ajustes de la app"]) {
    await expect.soft(sidebar.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(sidebar.getByRole("link", { name: /^Seguimiento/ })).toHaveAttribute("aria-current", "page");
  // The header: market picker and the primary action.
  await expect(page.getByRole("button", { name: /^Mercado: / })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualizar posiciones" })).toBeVisible();
});

test("«Dejar de seguir» solo está en Ajustes › Zona de peligro, con confirmación escribiendo el nombre", async ({ page, apps }) => {
  const app = apps[0];
  for (const sub of ["", "/keywords", "/ficha", "/competidores"]) {
    await open(page, `${market(app)}${sub}`);
    await expect.soft(page.getByRole("button", { name: /Dejar de seguir/ }), `${sub || "/"} sin «Dejar de seguir»`).toHaveCount(0);
  }
  await open(page, `/a/${app.slug}/ajustes/peligro`);
  const buttons = page.getByRole("button", { name: /^Dejar de seguir / });
  await expect(buttons.first()).toBeVisible();
  await buttons.first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Dejar de seguir", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill("otra cosa");
  await expect(confirm).toBeDisabled();
  const title = (await dialog.getByRole("heading").textContent())!.replace(/^Dejar de seguir (.+) en .+$/, "$1");
  await dialog.getByRole("textbox").fill(title);
  await expect(confirm).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("cambiar de mercado mantiene la subpágina y las páginas de la app recuerdan el mercado", async ({ page, apps }) => {
  const bySlug = Map.groupBy(apps, (a) => a.slug);
  const multi = [...bySlug.values()].find((m) => m.length > 1);
  test.skip(!multi, "La base de datos de prueba no tiene ninguna app en dos países");
  const [first, second] = multi!;
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(first)}/tendencias`);
  await page.getByRole("button", { name: /^Mercado: / }).click();
  await page.getByRole("menuitem").filter({ hasNotText: "Añadir" }).nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/a/${second.slug}/${second.country}/tendencias$`));
  // From the second market, Creativos carries it and the way back returns to it.
  const sidebar = page.getByRole("navigation", { name: /^Navegación de / });
  await expect(sidebar.getByRole("link", { name: /^Creativos/ })).toHaveAttribute("href", `/a/${second.slug}/creativos?m=${second.country}`);
  await sidebar.getByRole("link", { name: /^Creativos/ }).click();
  await expect(page).toHaveURL(new RegExp(`/a/${second.slug}/creativos`));
  await expect(sidebar.getByRole("link", { name: /^Seguimiento/ })).toHaveAttribute("href", `${market(second)}/keywords`);
});

test("⌘K abre la paleta con las acciones del mercado", async ({ page, apps }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, `${market(apps[0])}/keywords`);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const name of ["Actualizar posiciones", "Optimizar ficha", "Generar ideas"]) {
    await expect.soft(dialog.getByRole("option", { name: new RegExp(name) })).toBeVisible();
  }
  await dialog.getByRole("combobox").fill("Integraciones");
  await dialog.getByRole("option", { name: /Integraciones/ }).click();
  await expect(page).toHaveURL(/\/integraciones$/);
});

test("en el móvil la barra lateral pasa a una barra inferior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/");
  await expect(page.getByRole("navigation", { name: "Principal", exact: true })).toBeHidden();
  const bar = page.getByRole("navigation", { name: "Principal (móvil)" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Más" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Integraciones" })).toBeVisible();
});

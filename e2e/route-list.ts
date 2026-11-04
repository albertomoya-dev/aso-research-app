import type { E2eApp } from "./fixtures";

// Every current route, shared by routes.spec (status, overflow, console), polish.spec (one primary,
// short paragraphs) and axe.spec (accessibility).

export const GLOBAL_ROUTES = ["/", "/apps/nueva", "/actividad", "/actividad?vista=semana", "/integraciones"];

export const marketPath = (a: E2eApp) => `/a/${a.slug}/${a.country}`;
export const productPath = (a: E2eApp) => `/a/${a.slug}`;

/** Pages of one market of an app (`/a/[app]/[market]/…`). */
export const MARKET_SUBPAGES = [
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
];

/** Product-level pages: the same for every market of a product. */
export const PRODUCT_SUBPAGES = [
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
];

export const APP_ROUTES: { route: string; path: (app: E2eApp) => string | null }[] = [
  { route: "/a/[app]/[market]", path: marketPath },
  { route: "/a/[app]/[market]/keywords/[keywordId]", path: (a) => (a.keywordId ? `${marketPath(a)}/keywords/${a.keywordId}` : null) },
  { route: "/a/[app]/[market]/keywords?k=[keywordId]", path: (a) => (a.keywordId ? `${marketPath(a)}/keywords?k=${a.keywordId}` : null) },
  ...MARKET_SUBPAGES.map((sub) => ({ route: `/a/[app]/[market]/${sub}`, path: (a: E2eApp) => `${marketPath(a)}/${sub}` })),
  ...PRODUCT_SUBPAGES.map((sub) => ({ route: `/a/[app]/${sub}`, path: (a: E2eApp) => `${productPath(a)}/${sub}` })),
];

const isProductRoute = (route: string) => !route.startsWith("/a/[app]/[market]");

/** The first market (lowest id) of each product: the product pages are the same for all its markets. */
export function firstMarkets(apps: readonly E2eApp[]): E2eApp[] {
  const seen = new Map<string, E2eApp>();
  for (const a of [...apps].sort((x, y) => x.id - y.id)) if (!seen.has(a.slug)) seen.set(a.slug, a);
  return [...seen.values()];
}

/**
 * The global routes once, then every market route of each market in `apps` and the product routes of
 * the first market of each product (real data differs per market: one market cannot stand in for all).
 */
export function allPaths(apps: readonly E2eApp[]): string[] {
  const first = new Set(firstMarkets(apps).map((a) => a.id));
  return [...GLOBAL_ROUTES, ...apps.flatMap((app) => appPaths(app, first.has(app.id)))];
}

/** The market routes of one market and, with `withProduct`, the product routes of its app. */
export function appPaths(app: E2eApp, withProduct: boolean): string[] {
  return APP_ROUTES.filter(({ route }) => withProduct || !isProductRoute(route))
    .map(({ path }) => path(app))
    .filter((p): p is string => p != null);
}

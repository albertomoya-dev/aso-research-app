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

/** One path per route, for the first market of the test database (it stands in for every app). */
export function allPaths(app: E2eApp | undefined): string[] {
  const paths = [...GLOBAL_ROUTES];
  if (app) for (const { path } of APP_ROUTES) {
    const p = path(app);
    if (p) paths.push(p);
  }
  return paths;
}

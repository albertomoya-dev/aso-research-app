// Old global pages → new ones (docs/REDISENO_UX.md §8), served as 308s by next.config.ts. The app
// pages (`/apps/[id]/…`) need the database and redirect from app/apps/[id]/[[...rest]]/route.ts.

import { FIND_PAGE_SOURCES } from "./market-path";

export const GLOBAL_REDIRECTS = [
  { source: "/novedades", destination: "/actividad", permanent: true },
  { source: "/resumen", destination: "/actividad?vista=semana", permanent: true },
  { source: "/ajustes", destination: "/integraciones", permanent: true },
  { source: "/buscar", destination: "/apps/nueva", permanent: true },
] as const;

/**
 * Where an old global URL goes, as Next.js applies the rules above: the request's query is passed
 * through and appended to the destination's own. Null when `pathname` is not an old page.
 */
export function globalRedirectTarget(pathname: string, search = ""): string | null {
  const rule = GLOBAL_REDIRECTS.find((r) => r.source === pathname.replace(/\/+$/, ""));
  if (!rule) return null;
  const [path, own = ""] = rule.destination.split("?");
  const query = new URLSearchParams(own);
  for (const [k, v] of new URLSearchParams(search)) query.append(k, v);
  return query.size ? `${path}?${query}` : path;
}

/**
 * The three find pages of a market (phase 27) → the one Encontrar screen (phase 29), as 308s. The market
 * segment is a two-letter country, so product pages (`/a/x/creativos/…`) never match.
 */
export const FIND_REDIRECTS = Object.entries(FIND_PAGE_SOURCES).map(([page, fuente]) => ({
  source: `/a/:app/:market([a-z][a-z])/${page}`,
  destination: `/a/:app/:market/encontrar?fuente=${fuente}`,
  permanent: true,
}));

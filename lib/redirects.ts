// Old global pages → new ones (docs/REDISENO_UX.md §8), served as 308s by next.config.ts. The app
// pages (`/apps/[id]/…`) need the database and redirect from app/apps/[id]/[[...rest]]/route.ts.

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

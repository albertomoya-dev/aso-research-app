// Filters of the Actividad page (pure, tested): period, market and type, read from the query string.

import type { AlertKind } from "./alerts";

export const ACTIVITY_PERIODS = [
  { id: "hoy", label: "Hoy", days: 0 },
  { id: "7", label: "7 días", days: 7 },
  { id: "30", label: "30 días", days: 30 },
] as const;
export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number]["id"];

export const ACTIVITY_TYPES: { id: string; label: string; kinds: AlertKind[] }[] = [
  { id: "posicion", label: "Posición", kinds: ["entered_top10", "left_top10", "moved_up", "moved_down", "lost_ranking"] },
  { id: "competidor", label: "Competidor", kinds: ["new_leader", "competitor_change"] },
  { id: "temporada", label: "Temporada", kinds: ["seasonal_peak"] },
];

export type ActivityFilters = {
  period: ActivityPeriod;
  /** Market (`apps.id`), or null for all of them. Same `?app=` as the old /novedades. */
  appId: number | null;
  /** An id of ACTIVITY_TYPES, or null for every type. */
  type: string | null;
  /** «semana»: the weekly summary table instead of the feed. */
  view: "feed" | "semana";
};

type Query = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export function parseActivityFilters(query: Query): ActivityFilters {
  const period = ACTIVITY_PERIODS.find((p) => p.id === one(query.periodo))?.id ?? "7";
  const app = Number(one(query.app));
  const type = ACTIVITY_TYPES.find((t) => t.id === one(query.tipo))?.id ?? null;
  return {
    period,
    appId: Number.isSafeInteger(app) && app > 0 ? app : null,
    type,
    view: one(query.vista) === "semana" ? "semana" : "feed",
  };
}

/** `/actividad` with the filters changed by `patch`; defaults are left out of the URL. */
export function activityHref(filters: ActivityFilters, patch: Partial<ActivityFilters> = {}): string {
  const f = { ...filters, ...patch };
  const q = new URLSearchParams();
  if (f.view === "semana") q.set("vista", "semana");
  if (f.period !== "7") q.set("periodo", f.period);
  if (f.appId) q.set("app", String(f.appId));
  if (f.type) q.set("tipo", f.type);
  return q.size ? `/actividad?${q}` : "/actividad";
}

/** First day (inclusive) of the period, given today's date (YYYY-MM-DD): «7 días» is today and the 6 before. */
export function periodStart(period: ActivityPeriod, today: string): string {
  const days = ACTIVITY_PERIODS.find((p) => p.id === period)!.days;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Math.max(0, days - 1));
  return d.toISOString().slice(0, 10);
}

/** The alert kinds a type filter keeps, or null for all. */
export function kindsForType(type: string | null): AlertKind[] | null {
  return ACTIVITY_TYPES.find((t) => t.id === type)?.kinds ?? null;
}

/** The type an alert belongs to (for its icon). */
export function typeOfKind(kind: AlertKind): string {
  return ACTIVITY_TYPES.find((t) => t.kinds.includes(kind))?.id ?? "posicion";
}

// Filters of the Actividad page (pure, tested): period, market and type, read from the query string.

import type { AlertKind } from "./alerts";
import type { AnnotationSource } from "./annotations";

export const ACTIVITY_PERIODS = [
  { id: "hoy", label: "Hoy", days: 0 },
  { id: "7", label: "7 días", days: 7 },
  { id: "30", label: "30 días", days: 30 },
] as const;
export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number]["id"];

/**
 * The «Tipo» filter (REDISENO §6.12). Every alert kind belongs to exactly one type, and the feed also
 * shows the automatic annotations of the own listing as «Ficha»:
 * - Posición: rank moves (±5), TOP 10 in and out, lost ranking.
 * - Competidor: a competitor's listing changed, a new leader on a keyword.
 * - Temporada: a seasonal peak is coming.
 * - Ficha: our own listing changed in the store (annotation `auto`) or was published from Rankeo (`publish`).
 * The «Alerta» type of the design has no kind of its own (every alert is one of the above), so it is not
 * a filter: «Todo» shows them all.
 */
export const ACTIVITY_TYPES: { id: string; label: string; kinds: AlertKind[]; annotations: AnnotationSource[] }[] = [
  { id: "posicion", label: "Posición", kinds: ["entered_top10", "left_top10", "moved_up", "moved_down", "lost_ranking"], annotations: [] },
  { id: "competidor", label: "Competidor", kinds: ["new_leader", "competitor_change"], annotations: [] },
  { id: "temporada", label: "Temporada", kinds: ["seasonal_peak"], annotations: [] },
  { id: "ficha", label: "Ficha", kinds: [], annotations: ["auto", "publish"] },
];

/** Annotation sources the feed shows as «Ficha» entries (manual notes are the user's own, not activity). */
export const ACTIVITY_ANNOTATION_SOURCES: AnnotationSource[] = ACTIVITY_TYPES.flatMap((t) => t.annotations);

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

/** The alert kinds a type filter keeps, or null for all ([] for a type without alerts, like «Ficha»). */
export function kindsForType(type: string | null): AlertKind[] | null {
  return ACTIVITY_TYPES.find((t) => t.id === type)?.kinds ?? null;
}

/** The annotation sources a type filter keeps in the feed: every «Ficha» source with no filter, none for the alert types. */
export function annotationSourcesForType(type: string | null): AnnotationSource[] {
  return ACTIVITY_TYPES.find((t) => t.id === type)?.annotations ?? ACTIVITY_ANNOTATION_SOURCES;
}

/** The type an alert belongs to (for its icon). */
export function typeOfKind(kind: AlertKind): string {
  return ACTIVITY_TYPES.find((t) => t.kinds.includes(kind))?.id ?? "posicion";
}

/** What the feed needs of an alert and of an annotation. */
type FeedAlert = { id: number; date: string; kind: AlertKind; tone: "up" | "down" | "info" };
type FeedAnnotation = { id: number; date: string; source: AnnotationSource };

export type ActivityEntry<A extends FeedAlert, N extends FeedAnnotation> = { type: "alert"; alert: A } | { type: "annotation"; annotation: N };

/** Order of a «Ficha» entry within its day: with our own moves, after the TOP 10 and #1 changes (lib/alerts `alertPriority`). */
const ANNOTATION_PRIORITY = 1;

/**
 * Alerts and «Ficha» annotations in one feed, grouped by day (newest first). Within a day, what happened
 * to our app goes first (`priority`, lib/alerts `alertPriority`; a listing change ranks with our own
 * moves), then the newest.
 */
export function activityDays<A extends FeedAlert, N extends FeedAnnotation>(
  alerts: readonly A[],
  annotations: readonly N[],
  priority: (alert: A) => number,
): [string, ActivityEntry<A, N>[]][] {
  const entries = [
    ...alerts.map((alert) => ({ date: alert.date, rank: priority(alert), id: alert.id, entry: { type: "alert" as const, alert } })),
    ...annotations.map((annotation) => ({ date: annotation.date, rank: ANNOTATION_PRIORITY, id: annotation.id, entry: { type: "annotation" as const, annotation } })),
  ];
  const days = Map.groupBy(entries, (e) => e.date);
  return [...days.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((date) => [date, days.get(date)!.toSorted((a, b) => a.rank - b.rank || b.id - a.id).map((e) => e.entry)]);
}

/** Second line of a «Ficha» entry: the fields that changed, or what kind of change it was. */
export function annotationSummary(source: AnnotationSource, detail: { changes?: { label: string }[] } | null | undefined): string {
  const fields = [...new Set((detail?.changes ?? []).map((c) => c.label.toLocaleLowerCase()))];
  const what = source === "publish" ? "Publicado desde Rankeo" : "Cambio visto en la tienda";
  return fields.length ? `${what}: ${fields.join(", ")}` : what;
}

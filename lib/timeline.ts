import type { AnnotationDetail, AnnotationSource } from "./annotations";
import type { ExperimentStatus } from "./experiments";
import { EXPERIMENT_STATUSES } from "./experiments";
import type { AggregateImpact } from "./impact";

// The «Cambios y pruebas» page (phase 32): what kind of change each timeline entry is, the entries
// grouped by month, and the experiments by column. Pure, so it is tested without a database.

/** Detected (listing, version, icon, screenshots, a publication from Rankeo) or written by hand. */
export type TimelineKind = "listing" | "version" | "icon" | "screenshots" | "publish" | "manual";

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  listing: "Ficha",
  version: "Versión",
  icon: "Icono",
  screenshots: "Capturas",
  publish: "Publicación",
  manual: "Manual",
};

/**
 * The kind of an annotation. An automatic one is named after what changed: only the version →
 * «Versión»; the icon or the screenshots (alone or with the version) → «Icono» / «Capturas»; any text
 * field → «Ficha».
 */
export function timelineKind(a: { source: AnnotationSource; detail: AnnotationDetail | null }): TimelineKind {
  if (a.source === "manual") return "manual";
  if (a.source === "publish" || a.detail?.kind === "publish") return "publish";
  const fields = new Set((a.detail?.changes ?? []).map((c) => c.field));
  fields.delete("version");
  if (fields.size === 0) return a.detail?.changes.some((c) => c.field === "version") ? "version" : "listing";
  if (fields.size === 1 && fields.has("icon")) return "icon";
  if (fields.size === 1 && fields.has("screenshots")) return "screenshots";
  return "listing";
}

/** Detected kinds come from the store or from Rankeo; manual ones from the user (campaigns, press…). */
export const isDetected = (kind: TimelineKind) => kind !== "manual";

const month = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

/** «noviembre de 2026» for "2026-11-04". */
export function monthLabel(isoDate: string): string {
  return month.format(new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`));
}

export type MonthGroup<T> = { key: string; label: string; items: T[] };

/** Entries by month (YYYY-MM), newest month first and, inside it, newest first; ties keep their order. */
export function groupByMonth<T>(items: readonly T[], dateOf: (item: T) => string): MonthGroup<T>[] {
  const sorted = items
    .map((item, i) => ({ item, i, date: dateOf(item) }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.i - b.i);
  const groups: MonthGroup<T>[] = [];
  for (const { item, date } of sorted) {
    const key = date.slice(0, 7);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      group = { key, label: monthLabel(date), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export type ImpactLine = {
  /** «12 keywords afectadas · posición media 23 → 18», or null when no keyword has a mean on both sides. */
  text: string | null;
  /** Positions gained on average, rounded, for DeltaBadge (0 = «=»); null without `text`. */
  delta: number | null;
  /** Entries and exits of the results, counted apart: «2 entran en resultados». */
  extras: string[];
};

/**
 * The impact next to a timeline entry, from `aggregateImpact`. `scope` "affected" counts the keywords
 * with a changed word; "all" (manual entries, no word diff) counts every keyword measured.
 */
export function impactLine(a: AggregateImpact, scope: "affected" | "all"): ImpactLine {
  const extras: string[] = [];
  if (a.entered > 0) extras.push(`${a.entered} ${a.entered === 1 ? "entra" : "entran"} en resultados`);
  if (a.left > 0) extras.push(`${a.left} ${a.left === 1 ? "sale" : "salen"} de resultados`);
  if (a.affected === 0 || a.before == null || a.after == null || a.change == null) return { text: null, delta: null, extras };
  // Whole positions read best; a small change keeps its decimal so «9 → 10» never hides a «=».
  const digits = a.verdict === "flat" || Math.round(a.before) === Math.round(a.after) ? 1 : 0;
  const n = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: digits });
  const noun = scope === "affected" ? (a.affected === 1 ? "keyword afectada" : "keywords afectadas") : a.affected === 1 ? "keyword medida" : "keywords medidas";
  return {
    text: `${a.affected} ${noun} · posición media ${n(a.before)} → ${n(a.after)}`,
    delta: a.verdict === "flat" ? 0 : Math.round(a.change),
    extras,
  };
}

/** Experiments in the three columns of the board, keeping their order (newest first from the query). */
export function experimentColumns<T extends { status: ExperimentStatus }>(experiments: readonly T[]): Record<ExperimentStatus, T[]> {
  const out = Object.fromEntries(EXPERIMENT_STATUSES.map((s) => [s, [] as T[]])) as Record<ExperimentStatus, T[]>;
  for (const e of experiments) out[e.status].push(e);
  return out;
}

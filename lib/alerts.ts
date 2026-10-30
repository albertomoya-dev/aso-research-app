import type { KeywordIntent } from "./relevance";
import type { AppSummary } from "./stores/types";

export type AlertKind = "entered_top10" | "left_top10" | "moved_up" | "moved_down" | "lost_ranking" | "new_leader" | "competitor_change" | "seasonal_peak";
export type AlertTone = "up" | "down" | "info";

export type DraftAlert = {
  kind: AlertKind;
  keywordId: number | null;
  tone: AlertTone;
  title: string;
  detail: string;
  /** One line for the grouped «N keywords cambiaron de nº 1» alert; never stored. */
  line?: string;
};

export type RankPoint = {
  keywordId: number;
  term: string;
  position: number | null;
  top5: AppSummary[];
  /** How many results the store returned: a null position means "outside the first `depth`". */
  depth: number;
  /** 1–5 from app_keywords; null while nobody has rated it (counts as relevant). */
  relevance: number | null;
  intent: KeywordIntent | null;
};

export type DetectOptions = {
  /** Store ids of the competitors the user watches for this app. */
  watchedStoreIds: Set<string>;
  /** Keywords rated below this skip moves, losses and other apps' new #1. Default 3. */
  minRelevance?: number;
};

/** A move this big within the first 50 results is worth an alert; deeper down positions jump around. */
export const MOVE_THRESHOLD = 5;
const WATCH_DEPTH = 50;
/** A new #1 matters when we compete for the keyword: our app within the first 30 results. */
export const LEADER_WATCH = 30;
export const DEFAULT_MIN_RELEVANCE = 3;

const pos = (p: number | null) => (p == null ? "fuera del ranking" : `#${p}`);

/** Unrated keywords count as relevant; foreign intent (people want another kind of app) never does. */
export function isAlertRelevant(point: Pick<RankPoint, "relevance" | "intent">, minRelevance = DEFAULT_MIN_RELEVANCE): boolean {
  if (point.intent === "foreign") return false;
  return point.relevance == null || point.relevance >= minRelevance;
}

/**
 * Compares each keyword with its previous check and returns at most one ranking alert
 * per keyword (the most important one), plus a new-leader alert when #1 changed.
 *
 * Noise rules:
 * - A new #1 is reported only when our app is within the first 30 (before or now), when
 *   we gain or lose #1 ourselves, or when the old or new #1 is a watched competitor.
 * - "No longer in the results" needs the previous position to be inside what the store
 *   returned today; Google Play often returns only ~30 results, so #35 → "out of 30" says nothing.
 * - Keywords below `minRelevance` (or with foreign intent) keep only TOP 10 entries and
 *   exits and our own #1: moves, losses and other apps' new #1 are skipped.
 */
export function detectRankAlerts(previous: RankPoint[], current: RankPoint[], ownStoreId: string, opts: DetectOptions): DraftAlert[] {
  const before = new Map(previous.map((p) => [p.keywordId, p]));
  const alerts: DraftAlert[] = [];
  for (const now of current) {
    const prev = before.get(now.keywordId);
    if (!prev) continue;
    const relevant = isAlertRelevant(now, opts.minRelevance);
    const a = prev.position;
    const b = now.position;
    // "Out" only means "below a" when the store returned more than a results today.
    const outBelow = (p: number) => b == null && p < now.depth;
    const detail = `${pos(a)} → ${b == null ? `fuera de los ${now.depth} resultados` : pos(b)}`;
    const base = { keywordId: now.keywordId, detail };
    if (b != null && b <= 10 && (a == null || a > 10)) {
      alerts.push({ ...base, kind: "entered_top10", tone: "up", title: `«${now.term}» entra en el TOP 10` });
    } else if (a != null && a <= 10 && ((b != null && b > 10) || outBelow(a))) {
      alerts.push({ ...base, kind: "left_top10", tone: "down", title: `«${now.term}» sale del TOP 10` });
    } else if (relevant && a != null && a <= WATCH_DEPTH && outBelow(a)) {
      alerts.push({ ...base, kind: "lost_ranking", tone: "down", title: `«${now.term}»: ya no apareces en los resultados` });
    } else if (relevant && a != null && b != null && Math.min(a, b) <= WATCH_DEPTH && Math.abs(a - b) >= MOVE_THRESHOLD) {
      const up = b < a;
      alerts.push({
        ...base,
        kind: up ? "moved_up" : "moved_down",
        tone: up ? "up" : "down",
        title: `«${now.term}» ${up ? "sube" : "baja"} ${Math.abs(a - b)} posiciones`,
      });
    }
    const oldLeader = prev.top5[0];
    const newLeader = now.top5[0];
    if (oldLeader && newLeader && oldLeader.id !== newLeader.id) {
      const gained = newLeader.id === ownStoreId;
      const lost = oldLeader.id === ownStoreId;
      const competing = (a != null && a <= LEADER_WATCH) || (b != null && b <= LEADER_WATCH);
      const watched = opts.watchedStoreIds.has(newLeader.id) || opts.watchedStoreIds.has(oldLeader.id);
      if (gained || lost || (relevant && (competing || watched))) {
        alerts.push({
          kind: "new_leader",
          keywordId: now.keywordId,
          tone: gained ? "up" : lost ? "down" : "info",
          title: gained ? `Eres el nº 1 en «${now.term}»` : `Nuevo nº 1 en «${now.term}»: ${newLeader.title}`,
          detail: `Antes: ${oldLeader.title}`,
          line: `«${now.term}»: ${oldLeader.title} → ${newLeader.title}`,
        });
      }
    }
  }
  return alerts;
}

/** Lines shown in a grouped alert before «y N más». */
const GROUP_LINES = 8;

/**
 * Other apps' new #1 of one day collapse into a single alert (keywordId null) so a busy day
 * is one line in Novedades. Our own #1 (gained or lost) stays per keyword: it is about us.
 */
export function groupLeaderAlerts(alerts: DraftAlert[]): DraftAlert[] {
  const others = alerts.filter((a) => a.kind === "new_leader" && a.tone === "info");
  const rest = alerts.filter((a) => !(a.kind === "new_leader" && a.tone === "info"));
  if (others.length === 0) return rest;
  if (others.length === 1) return [...rest, { ...others[0], keywordId: null, detail: others[0].line ?? others[0].detail }];
  const lines = others.map((a) => a.line ?? a.title);
  const extra = lines.length - GROUP_LINES;
  return [
    ...rest,
    {
      kind: "new_leader",
      keywordId: null,
      tone: "info",
      title: `${others.length} keywords cambiaron de nº 1`,
      detail: lines.slice(0, GROUP_LINES).join(" · ") + (extra > 0 ? ` · y ${extra} más` : ""),
    },
  ];
}

/** Alert types the user can switch off per app, as shown in the preferences form. */
export const ALERT_KIND_GROUPS: { id: string; label: string; kinds: AlertKind[] }[] = [
  { id: "top10", label: "Entra o sale del TOP 10", kinds: ["entered_top10", "left_top10"] },
  { id: "moves", label: "Sube o baja 5 posiciones o más", kinds: ["moved_up", "moved_down"] },
  { id: "lost", label: "Deja de aparecer en los resultados", kinds: ["lost_ranking"] },
  { id: "leader", label: "Cambios de nº 1", kinds: ["new_leader"] },
  { id: "competitor", label: "Una ficha vigilada cambia", kinds: ["competitor_change"] },
  { id: "seasonal", label: "Un pico de temporada empieza en 3 semanas", kinds: ["seasonal_peak"] },
];
export const ALL_ALERT_KINDS: AlertKind[] = ALERT_KIND_GROUPS.flatMap((g) => g.kinds);

export type AlertPrefs = { kinds: AlertKind[]; minRelevance: number };
export const DEFAULT_ALERT_PREFS: AlertPrefs = { kinds: ALL_ALERT_KINDS, minRelevance: DEFAULT_MIN_RELEVANCE };

/** Keeps the alerts whose type the user wants. */
export function applyAlertPrefs<T extends { kind: AlertKind }>(alerts: T[], prefs: AlertPrefs): T[] {
  const wanted = new Set(prefs.kinds);
  return alerts.filter((a) => wanted.has(a.kind));
}

/** Order within a day: what happened to our app first, then coming peaks, other apps' #1 and competitor listings. */
export function alertPriority(alert: { kind: AlertKind; tone: AlertTone }): number {
  if (alert.kind === "entered_top10" || alert.kind === "left_top10") return 0;
  if (alert.kind === "new_leader") return alert.tone === "info" ? 3 : 0;
  if (alert.kind === "seasonal_peak") return 2;
  if (alert.kind === "competitor_change") return 4;
  return 1;
}

export type WeekRow = {
  keywordId: number;
  term: string;
  now: number | null;
  before: number | null;
  /** Results the store returned in each check: a null position means "outside the first N". */
  nowDepth: number | null;
  beforeDepth: number | null;
  /** False when the keyword had no check by the baseline date: there is nothing to compare. */
  hasBefore: boolean;
};

/**
 * "move": both positions known. "entered": from outside the first N to #k (k ≤ N).
 * "left": from #k to outside the first N (k ≤ N).
 */
export type WeekMove = WeekRow & { change: number; movement: "move" | "entered" | "left" };

export type WeekSummary = {
  tracked: number;
  improved: number;
  worsened: number;
  top10: number;
  top10Before: number;
  /** Keywords with no check by the baseline date: left out of gains and losses. */
  noBaseline: number;
  /**
   * Biggest gains and losses, most first. For "entered" and "left" the real jump is unknown;
   * `change` is the least it can be (N + 1 − k), used only to sort and never shown.
   */
  gainers: WeekMove[];
  losers: WeekMove[];
};

function weekMove(r: WeekRow): WeekMove | null {
  if (!r.hasBefore) return null;
  if (r.before != null && r.now != null) return { ...r, change: r.before - r.now, movement: "move" };
  if (r.before == null && r.now != null && r.beforeDepth != null && r.now <= r.beforeDepth) {
    return { ...r, change: r.beforeDepth + 1 - r.now, movement: "entered" };
  }
  if (r.before != null && r.now == null && r.nowDepth != null && r.before <= r.nowDepth) {
    return { ...r, change: -(r.nowDepth + 1 - r.before), movement: "left" };
  }
  // Out both times, or out of a shorter list than the known position: no honest comparison.
  return null;
}

export function summarizeWeek(rows: WeekRow[], limit = 5): WeekSummary {
  const moves = rows.map(weekMove).filter((m): m is WeekMove => m != null && m.change !== 0);
  const inTop10 = (p: number | null) => p != null && p <= 10;
  return {
    tracked: rows.length,
    improved: moves.filter((m) => m.change > 0).length,
    worsened: moves.filter((m) => m.change < 0).length,
    top10: rows.filter((r) => inTop10(r.now)).length,
    top10Before: rows.filter((r) => r.hasBefore && inTop10(r.before)).length,
    noBaseline: rows.filter((r) => !r.hasBefore).length,
    gainers: moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, limit),
    losers: moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, limit),
  };
}

/** "#4", or "> 30" when the app was outside the 30 results the store returned. */
export function weekPosition(position: number | null, depth: number | null): string {
  if (position != null) return `#${position}`;
  return depth != null ? `> ${depth}` : "fuera";
}

/** The movement in words: "sube 6", "entra en los primeros 30", "sale de los primeros 30". */
export function describeMove(m: WeekMove): string {
  if (m.movement === "entered") return `entra en los primeros ${m.beforeDepth}`;
  if (m.movement === "left") return `sale de los primeros ${m.nowDepth}`;
  return `${m.change > 0 ? "sube" : "baja"} ${Math.abs(m.change)}`;
}

/**
 * The date to compare against: the latest check on or before `since` (a week ago), or, when
 * the app is newer than that, its oldest check as long as a later one exists. Null when there
 * is only one day of data.
 */
export function pickBaseline(dates: string[], since: string): string | null {
  if (dates.length === 0) return null;
  const sorted = [...new Set(dates)].sort();
  const onOrBefore = sorted.filter((d) => d <= since);
  if (onOrBefore.length > 0) return onOrBefore.at(-1)!;
  return sorted.length > 1 ? sorted[0] : null;
}

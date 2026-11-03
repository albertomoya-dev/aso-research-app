import type { AlertKind, AlertTone } from "./alerts";
import { type HealthId, type HealthItem, type NextSeason, SEASON_WARN_DAYS } from "./health";
import { marketPath } from "./market-path";

// «Qué hacer hoy» on Inicio: health lines, unread alerts and coming seasonal peaks of every market,
// scored, deduplicated and cut to a short list. Pure; the page loads the inputs.

export type TodayMarket = { id: number; productSlug: string; title: string; country: string };

export type TodayAlert = {
  appId: number;
  kind: AlertKind;
  tone: AlertTone;
  title: string;
  keywordId: number | null;
  date: string;
};

export type TodayInput = {
  markets: { market: TodayMarket; health: HealthItem[]; seasons: NextSeason[] }[];
  /** Unread alerts of any market; alerts of a market not in `markets` are ignored. */
  alerts: TodayAlert[];
};

export type TodaySeverity = "bad" | "warn" | "info";

export type TodayTask = {
  key: string;
  /** Higher first; see the scoring table in `whatToDoToday`. */
  score: number;
  severity: TodaySeverity;
  source: "health" | "alert" | "season";
  market: TodayMarket;
  text: string;
  action: string;
  href: string;
  /** Day of the alert (YYYY-MM-DD), newest first on ties; "" for health lines and peaks. */
  date: string;
};

export const TODAY_MAX = 5;

/** Tie-breaker inside a health status: what costs rankings first. */
const HEALTH_WEIGHT: Record<HealthId, number> = {
  "listing-age": 8,
  policy: 7,
  coverage: 6,
  reviews: 5,
  irrelevant: 4,
  screenshots: 3,
  season: 0,
};

/** Alerts that ask for something, by kind (and tone for a #1 change). Good news is not a task. */
function alertScore(a: TodayAlert): number | null {
  if (a.tone === "up") return null;
  switch (a.kind) {
    case "new_leader":
      return a.tone === "down" ? 90 : 35;
    case "left_top10":
      return 85;
    case "lost_ranking":
      return 80;
    case "moved_down":
      return 70;
    case "seasonal_peak":
      return 65;
    case "competitor_change":
      return 45;
    default:
      return null;
  }
}

/** The first sentence of a hint, without its final full stop. */
export function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/);
  return (end === -1 ? text : text.slice(0, end)).trim();
}

/**
 * Screenshots are the app's; the listing-age line compares the app's product sheet with each country's
 * listing, so two countries with the same version say the same thing: one task. The rest are per market.
 */
function healthKey(id: HealthId, market: TodayMarket, text: string): string {
  if (id === "screenshots") return `screenshots:${market.productSlug}`;
  if (id === "listing-age") return `listing-age:${market.productSlug}:${text}`;
  return `health:${market.id}:${id}`;
}

const weeks = (days: number) => (days >= 14 ? `${Math.round(days / 7)} semanas` : days === 1 ? "1 día" : `${days} días`);
const termOf = (title: string) => /«(.+?)»/.exec(title)?.[1]?.toLowerCase() ?? null;

/**
 * Scoring (higher first):
 * - health «necesita atención» 100 + weight, «mejorable» 60 + weight (lines without a link are skipped);
 * - your #1 lost 90, out of the TOP 10 85, out of the results 80, a big drop 70, a seasonal alert 65,
 *   a watched listing changed 45, another app's new #1 35; rises are not tasks;
 * - a peak in season now 75, one starting within SEASON_WARN_DAYS 60–70 (sooner is higher), at most 2 per market.
 *
 * Dedupe: a seasonal alert and a coming peak of the same market and keyword are one task (the peak, worded
 * with the days left); the health «Próximo pico» line is replaced by the peaks; screenshots and the
 * listing against the product sheet belong to the app, so the same line appears once per app, not once per
 * country; one task per keyword and market. Ties: newest alert, then app name.
 */
export function whatToDoToday(input: TodayInput, limit = TODAY_MAX): TodayTask[] {
  const byId = new Map(input.markets.map((m) => [m.market.id, m.market]));
  const tasks: TodayTask[] = [];

  for (const { market, health, seasons } of input.markets) {
    for (const item of health) {
      if (item.id === "season" || !item.href || !item.action) continue;
      if (item.status !== "bad" && item.status !== "warn") continue;
      const text = firstSentence(item.hint);
      tasks.push({
        key: healthKey(item.id, market, text),
        score: (item.status === "bad" ? 100 : 60) + HEALTH_WEIGHT[item.id],
        severity: item.status,
        source: "health",
        market,
        text,
        action: item.action,
        href: item.href,
        date: "",
      });
    }
    for (const s of seasons.filter((x) => x.running || x.days <= SEASON_WARN_DAYS).slice(0, 2)) {
      tasks.push({
        key: `season:${market.id}:${s.term.toLowerCase()}`,
        score: s.running ? 75 : 60 + Math.round(10 * (1 - s.days / SEASON_WARN_DAYS)),
        severity: "warn",
        source: "season",
        market,
        text: s.running ? `«${s.term}» está en temporada` : `«${s.term}» entra en temporada en ${weeks(s.days)}`,
        action: "Preparar la ficha",
        href: marketPath(market, "/ficha"),
        date: "",
      });
    }
  }

  for (const alert of input.alerts) {
    const market = byId.get(alert.appId);
    const score = alertScore(alert);
    if (!market || score == null) continue;
    const term = termOf(alert.title);
    const seasonal = alert.kind === "seasonal_peak";
    tasks.push({
      key: seasonal && term ? `season:${market.id}:${term}` : alert.keywordId != null ? `alert:${market.id}:${alert.keywordId}` : `alert:${market.id}:${alert.kind}:${alert.title}`,
      score,
      severity: score >= 80 ? "bad" : "warn",
      source: "alert",
      market,
      text: alert.title,
      ...(seasonal
        ? { action: "Preparar la ficha", href: marketPath(market, "/ficha") }
        : alert.kind === "competitor_change"
          ? { action: "Ver competidores", href: marketPath(market, "/competidores") }
          : alert.keywordId != null
            ? { action: "Ver la keyword", href: marketPath(market, `/keywords/${alert.keywordId}`) }
            : { action: "Ver en Actividad", href: `/actividad?app=${market.id}` }),
      date: alert.date,
    });
  }

  // A coming peak replaces the alert about it, whatever their scores: it says how long is left.
  const peaks = new Set(tasks.filter((t) => t.source === "season").map((t) => t.key));
  const sorted = tasks
    .filter((t) => t.source !== "alert" || !peaks.has(t.key))
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date) || a.market.title.localeCompare(b.market.title));
  const seen = new Set<string>();
  const out: TodayTask[] = [];
  for (const t of sorted) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
    if (out.length === limit) break;
  }
  return out;
}

import type { AppSummary } from "./stores/types";

export type AlertKind = "entered_top10" | "left_top10" | "moved_up" | "moved_down" | "lost_ranking" | "new_leader" | "competitor_change";
export type AlertTone = "up" | "down" | "info";

export type DraftAlert = { kind: AlertKind; keywordId: number | null; tone: AlertTone; title: string; detail: string };

export type RankPoint = { keywordId: number; term: string; position: number | null; top5: AppSummary[] };

/** A move this big within the first 50 results is worth an alert; deeper down positions jump around. */
export const MOVE_THRESHOLD = 5;
const WATCH_DEPTH = 50;

const pos = (p: number | null) => (p == null ? "fuera del ranking" : `#${p}`);

/**
 * Compares each keyword with its previous check and returns at most one ranking alert
 * per keyword (the most important one), plus a new-leader alert when #1 changed.
 */
export function detectRankAlerts(previous: RankPoint[], current: RankPoint[], ownStoreId: string): DraftAlert[] {
  const before = new Map(previous.map((p) => [p.keywordId, p]));
  const alerts: DraftAlert[] = [];
  for (const now of current) {
    const prev = before.get(now.keywordId);
    if (!prev) continue;
    const a = prev.position;
    const b = now.position;
    const detail = `${pos(a)} → ${pos(b)}`;
    const base = { keywordId: now.keywordId, detail };
    if (b != null && b <= 10 && (a == null || a > 10)) {
      alerts.push({ ...base, kind: "entered_top10", tone: "up", title: `«${now.term}» entra en el TOP 10` });
    } else if (a != null && a <= 10 && (b == null || b > 10)) {
      alerts.push({ ...base, kind: "left_top10", tone: "down", title: `«${now.term}» sale del TOP 10` });
    } else if (a != null && b == null && a <= WATCH_DEPTH) {
      alerts.push({ ...base, kind: "lost_ranking", tone: "down", title: `«${now.term}»: ya no apareces en los resultados` });
    } else if (a != null && b != null && Math.min(a, b) <= WATCH_DEPTH && Math.abs(a - b) >= MOVE_THRESHOLD) {
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
      const own = newLeader.id === ownStoreId;
      alerts.push({
        kind: "new_leader",
        keywordId: now.keywordId,
        tone: own ? "up" : oldLeader.id === ownStoreId ? "down" : "info",
        title: own ? `Eres el nº 1 en «${now.term}»` : `Nuevo nº 1 en «${now.term}»: ${newLeader.title}`,
        detail: `Antes: ${oldLeader.title}`,
      });
    }
  }
  return alerts;
}

export type WeekRow = { keywordId: number; term: string; now: number | null; before: number | null };

export type WeekSummary = {
  tracked: number;
  improved: number;
  worsened: number;
  top10: number;
  top10Before: number;
  /** Biggest gains and losses, most first. Positions outside the ranking count as 201. */
  gainers: (WeekRow & { change: number })[];
  losers: (WeekRow & { change: number })[];
};

const OUT = 201;

export function summarizeWeek(rows: WeekRow[], limit = 5): WeekSummary {
  const moves = rows
    .filter((r) => r.now != null || r.before != null)
    .map((r) => ({ ...r, change: (r.before ?? OUT) - (r.now ?? OUT) }))
    .filter((r) => r.change !== 0);
  const inTop10 = (p: number | null) => p != null && p <= 10;
  return {
    tracked: rows.length,
    improved: moves.filter((m) => m.change > 0).length,
    worsened: moves.filter((m) => m.change < 0).length,
    top10: rows.filter((r) => inTop10(r.now)).length,
    top10Before: rows.filter((r) => inTop10(r.before)).length,
    gainers: moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, limit),
    losers: moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, limit),
  };
}

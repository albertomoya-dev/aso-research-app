import { describe, expect, it } from "vitest";
import type { HealthItem } from "@/lib/health";
import {
  competitionLine,
  homeKpis,
  marketWeek,
  ownShare,
  ownShareSeries,
  rowSnapshots,
  shareWeek,
  sortSteps,
  topKeywordsPosition,
} from "@/lib/home";
import { aggregateImpact, annotationImpact, formatAggregateImpact, type Impact } from "@/lib/impact";
import type { AppSummary } from "@/lib/stores/types";
import { visibilityShare } from "@/lib/visibility";

const app = (id: string): AppSummary => ({ store: "android", id, title: id, developer: "", icon: "", rating: null, url: "" });

describe("ownShare", () => {
  it("gives the same share as visibilityShare from our position and the size of the TOP 5", () => {
    const top5 = (ids: string[]) => ids.map(app);
    const snaps = [
      { keywordId: 1, date: "d", top5: top5(["x", "me", "y", "z", "w"]) },
      { keywordId: 2, date: "d", top5: top5(["me", "x", "y"]) },
      { keywordId: 3, date: "d", top5: top5(["x", "y", "z", "w", "v"]) },
    ];
    const popularity = new Map<number, number | null>([
      [1, 60],
      [2, null],
      [3, 30],
    ]);
    const expected = visibilityShare(snaps, popularity).find((r) => r.app.id === "me")!.share;
    const reduced = snaps.map((s) => ({ keywordId: s.keywordId, position: s.top5.findIndex((a) => a.id === "me") + 1 || 17, slots: s.top5.length }));
    expect(ownShare(reduced, popularity)).toBeCloseTo(expected, 10);
  });

  it("is 0 outside every TOP 5 and null without checks", () => {
    expect(ownShare([{ keywordId: 1, position: null, slots: 5 }], new Map())).toBe(0);
    expect(ownShare([], new Map())).toBeNull();
  });

  it("draws one value per day, with null on days without checks", () => {
    const snaps = [
      { keywordId: 1, date: "2026-11-01", position: 1, depth: 30, slots: 5 },
      { keywordId: 1, date: "2026-11-03", position: 30, depth: 30, slots: 5 },
    ];
    expect(ownShareSeries(snaps, new Map(), "2026-11-03", 4)).toEqual([null, 40, null, 0]);
  });
});

describe("marketWeek", () => {
  const s = (keywordId: number, date: string, position: number | null, depth = 30) => ({ keywordId, date, position, depth, term: `k${keywordId}` });

  it("compares the latest check with the one a week before and counts TOP changes over keywords with both", () => {
    const w = marketWeek(
      [
        s(1, "2026-10-27", 12),
        s(1, "2026-11-03", 8),
        s(2, "2026-10-27", 25),
        s(2, "2026-11-03", 35),
        // Added this week: in the TOP 10 now, but not a gain.
        s(3, "2026-11-02", 4),
      ],
      "2026-11-03",
    );
    expect(w.baselineDate).toBe("2026-10-27");
    expect(w.week).toMatchObject({ top10: 2, top10Before: 0, top30: 2, top30Before: 2, noBaseline: 1 });
    expect(w.top10Change).toBe(1);
    expect(w.top30Change).toBe(-1);
    expect(w.week.gainers.map((g) => g.term)).toEqual(["k1"]);
  });

  it("has no changes with a single day of data", () => {
    const w = marketWeek([s(1, "2026-11-03", 3)], "2026-11-03");
    expect(w.baselineDate).toBeNull();
    expect([w.top10Change, w.top30Change]).toEqual([null, null]);
    expect(w.week.top10).toBe(1);
  });

  it("reads the checks out of keyword rows", () => {
    const snaps = rowSnapshots([{ id: 7, term: "pastillas", history: [{ date: "2026-11-03", position: 4, depth: 30 }] }]);
    expect(snaps).toEqual([{ keywordId: 7, term: "pastillas", date: "2026-11-03", position: 4, depth: 30 }]);
  });
});

describe("topKeywordsPosition", () => {
  const k = (keywordId: number, opportunity: number | null, position: number | null, extra: { relevance?: number | null; intent?: "foreign" | null } = {}) => ({
    keywordId,
    term: `palabra${keywordId}`,
    relevance: extra.relevance ?? null,
    intent: extra.intent ?? null,
    opportunity,
    position,
  });

  it("takes the 5 relevant keywords with the most opportunity and leaves out-of-results ones out of the mean", () => {
    const r = topKeywordsPosition(
      [
        k(1, 90, 4),
        k(2, 80, null),
        k(3, 70, 10),
        k(4, 99, 1, { relevance: 1 }), // irrelevant
        k(5, 95, 2, { intent: "foreign" }), // another kind of app
        k(6, 60, 7),
        k(7, null, 3),
        k(8, 10, 50),
      ],
      "es",
    );
    // Top 5 relevant by opportunity: 1, 2, 3, 6, 8 (unknown opportunity last). Ranked: 4, 10, 7, 50.
    expect(r).toEqual({ mean: 17.8, known: 4, count: 5 });
  });

  it("is unknown when none of them ranks", () => {
    expect(topKeywordsPosition([k(1, 50, null)], "es")).toEqual({ mean: null, known: 0, count: 1 });
  });
});

describe("homeKpis", () => {
  it("adds the counts, and the changes only of markets with a week to compare", () => {
    const k = homeKpis([
      { top10: 3, top10Change: 1, top30: 10, top30Change: -2, share: 12, shareBefore: 10, unread: 4 },
      { top10: 2, top10Change: null, top30: 5, top30Change: null, share: 4, shareBefore: null, unread: 0 },
      { top10: 0, top10Change: null, top30: 0, top30Change: null, share: null, shareBefore: null, unread: 1 },
    ]);
    expect(k).toEqual({ top10: 5, top10Change: 1, top30: 15, top30Change: -2, share: 8, shareChange: 2, unread: 5, unreadMarkets: 2 });
  });

  it("has no change at all when no market has a baseline", () => {
    const k = homeKpis([{ top10: 1, top10Change: null, top30: 1, top30Change: null, share: null, shareBefore: null, unread: 0 }]);
    expect([k.top10Change, k.top30Change, k.share, k.shareChange]).toEqual([null, null, null, null]);
  });
});

describe("shareWeek", () => {
  it("reads the latest day and the baseline day of the series", () => {
    const points = [
      { date: "2026-10-25", me: 5 },
      { date: "2026-10-27", me: 6 },
      { date: "2026-11-03", me: 9.5 },
    ];
    expect(shareWeek(points, "me", "2026-11-03")).toEqual({ now: 9.5, before: 6 });
    expect(shareWeek([{ date: "2026-11-03", me: 2 }], "me", "2026-11-03")).toEqual({ now: 2, before: null });
    expect(shareWeek([], "me", "2026-11-03")).toEqual({ now: null, before: null });
  });
});

describe("sortSteps", () => {
  const item = (id: HealthItem["id"], status: HealthItem["status"], href: string | null = "/x"): HealthItem => ({
    id,
    label: id,
    status,
    value: "",
    hint: "",
    href,
    action: href ? "Ir" : null,
  });

  it("puts the worst first and folds what is fine or has nothing to do", () => {
    const { tasks, fine, noData } = sortSteps([
      item("coverage", "good", null),
      item("season", "warn"),
      item("reviews", "unknown"),
      item("policy", "bad"),
      item("screenshots", "unknown", null),
      item("irrelevant", "good", null),
    ]);
    expect(tasks.map((t) => t.id)).toEqual(["policy", "season", "reviews"]);
    expect(fine.map((t) => t.id)).toEqual(["coverage", "irrelevant"]);
    expect(noData.map((t) => t.id)).toEqual(["screenshots"]);
  });
});

describe("competitionLine", () => {
  it("shows the 3 strongest others and you last, with the rest of the TOP 5", () => {
    const row = (id: string, share: number) => ({ app: { id, title: id.toUpperCase() }, share });
    const line = competitionLine([row("a", 33), row("b", 15), row("me", 3), row("c", 10), row("d", 9)], "me");
    expect(line.shown.map((s) => [s.title, s.share, s.own])).toEqual([
      ["A", 33, false],
      ["B", 15, false],
      ["C", 10, false],
      ["Tú", 3, true],
    ]);
    expect(line.rest).toBe(39);
    expect(competitionLine([], "me").shown).toEqual([{ id: "me", title: "Tú", share: 0, own: true }]);
  });
});

describe("aggregateImpact", () => {
  const days = (from: string, n: number, position: number | null) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(`${from}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), position };
    });
  const impact = (before: number | null, after: number | null): Impact =>
    annotationImpact([...days("2026-10-01", 14, before), ...days("2026-10-16", 14, after)], "2026-10-15", { today: "2026-11-03" });

  it("averages the mean positions over the keywords measured on both sides", () => {
    const a = aggregateImpact([impact(20, 15), impact(26, 21), impact(null, 5), impact(8, null)]);
    expect(a).toMatchObject({ affected: 2, before: 23, after: 18, change: 5, verdict: "up", entered: 1, left: 1, complete: true });
    expect(formatAggregateImpact(a)).toBe("2 keywords · 23 → 18 ▲ · 1 entra en resultados · 1 sale de resultados");
  });

  it("reads a drop, a flat change and nothing to measure", () => {
    expect(formatAggregateImpact(aggregateImpact([impact(10, 14)]))).toBe("1 keyword · 10 → 14 ▼");
    expect(formatAggregateImpact(aggregateImpact([impact(9, 9.4), impact(9, 9.6)]))).toBe("2 keywords · 9 → 9,5 =");
    const none = aggregateImpact([]);
    expect(none).toMatchObject({ affected: 0, before: null, verdict: "unknown" });
    expect(formatAggregateImpact(none)).toBe("Sin datos suficientes");
    expect(aggregateImpact([impact(null, 3), impact(null, 4)]).verdict).toBe("entered");
  });
});

import { describe, expect, it } from "vitest";
import { chartSeries, MAX_SHARE_SERIES, OTHERS_ID, seriesColor, shareChartKind, sharedKeywords, withOthers } from "@/lib/competitor-view";
import { cronBudget, OWN_LISTINGS_STOP_AT_MS, RELEVANCE_STOP_AT_MS, REVIEW_FRESHNESS_STOP_AT_MS } from "@/lib/cron-step";
import { nextSeasons } from "@/lib/health";
import { freshnessSignal, hasNewReviews, sourcesToCheck } from "@/lib/review-freshness";
import type { AppSummary } from "@/lib/stores/types";
import { HEAT_CLASS, heatBucket, prepareAnnotation, prepareFocus, startsInLabel, upcomingPeaks } from "@/lib/trends-view";

// Phase 31: Competidores (share chart and shared keywords), Reseñas (the «reseñas nuevas» dot) and
// Tendencias (heatmap scale, coming peaks, «Preparar»).

const series = [
  { id: "own", title: "Runly", own: true },
  { id: "a", title: "A", own: false },
  { id: "b", title: "B", own: false },
  { id: "c", title: "C", own: false },
  { id: "d", title: "D", own: false },
  { id: "e", title: "E", own: false },
];

describe("share chart", () => {
  it("draws at most 5 series, your app first, and puts the rest of 100 % in «Otros»", () => {
    const points = [{ date: "2026-11-01", own: 30, a: 20, b: 15, c: 10, d: 5, e: 4 }];
    const out = chartSeries([...series.slice(1), series[0]], points);
    expect(out.series.map((s) => s.id)).toEqual(["own", "a", "b", "c", "d", OTHERS_ID]);
    expect(out.series.filter((s) => s.id !== OTHERS_ID)).toHaveLength(MAX_SHARE_SERIES);
    expect(out.points[0][OTHERS_ID]).toBe(20);
  });

  it("leaves «Otros» out when the drawn series hold everything", () => {
    const out = chartSeries(series.slice(0, 2), [{ date: "2026-11-01", own: 60, a: 40 }]);
    expect(out.series.map((s) => s.id)).toEqual(["own", "a"]);
    expect(out.points[0]).not.toHaveProperty(OTHERS_ID);
  });

  it("never gives «Otros» a negative share after rounding", () => {
    expect(withOthers([{ date: "x", own: 50.1, a: 50 }], ["own", "a"])[0][OTHERS_ID]).toBe(0);
    expect(withOthers([{ date: "x", own: 33.3, a: 33.3 }], ["own", "a"])[0][OTHERS_ID]).toBe(33.4);
  });

  it("uses bars with a single day of data and areas from the second", () => {
    expect(shareChartKind([])).toBe("bars");
    expect(shareChartKind([{ date: "2026-11-01" }])).toBe("bars");
    expect(shareChartKind([{ date: "2026-11-01" }, { date: "2026-11-02" }])).toBe("areas");
  });

  it("colours your app with --series-own, the competitors by position and «Otros» neutral", () => {
    expect(seriesColor(series[0], 0)).toBe("var(--series-own)");
    expect(seriesColor(series[1], 1)).toBe("var(--series-2)");
    expect(seriesColor(series[4], 4)).toBe("var(--series-5)");
    expect(seriesColor({ id: OTHERS_ID, title: "Otros", own: false }, 5)).toBe("var(--muted)");
  });
});

describe("sharedKeywords", () => {
  const app = (id: string): AppSummary => ({ store: "android", id, title: id, developer: "", icon: "", rating: null, url: "" });
  it("lists the keywords where each competitor is in the TOP 5, with your position there", () => {
    const latest = [
      { keywordId: 1, date: "2026-11-01", top5: [app("a"), app("own"), app("b")] },
      { keywordId: 2, date: "2026-11-01", top5: [app("b"), app("a")] },
      { keywordId: 3, date: "2026-11-01", top5: [app("a")] },
    ];
    const out = sharedKeywords(latest, new Map([[1, "correr"], [2, "running"]]), "own");
    expect(out.get("a")).toEqual([
      { keywordId: 1, term: "correr", position: 1, ownPosition: 2 },
      { keywordId: 2, term: "running", position: 2, ownPosition: null },
    ]);
    expect(out.has("own")).toBe(false);
  });
});

describe("hasNewReviews", () => {
  it("puts the dot only when the store shows a review newer than the analysis read", () => {
    const analysis = { to: "2026-11-01T10:00:00.000Z" };
    expect(hasNewReviews(new Date("2026-11-02T08:00:00Z"), analysis)).toBe(true);
    expect(hasNewReviews("2026-11-01T10:00:00.000Z", analysis)).toBe(false);
    expect(hasNewReviews(new Date("2026-10-30T00:00:00Z"), analysis)).toBe(false);
  });

  it("has nothing to compare without an analysis or a check", () => {
    expect(hasNewReviews(new Date(), null)).toBe(false);
    expect(hasNewReviews(null, { to: "2026-11-01" })).toBe(false);
    expect(hasNewReviews(undefined, { to: null })).toBe(false);
  });

  it("marks an analysis that found no reviews as soon as the store shows one", () => {
    expect(hasNewReviews(new Date("2026-11-02"), { to: null })).toBe(true);
  });
});

describe("sourcesToCheck", () => {
  it("reads each source once a day, without repeats and within the cap", () => {
    const sources = [
      { appId: 1, targetStoreId: "own" },
      { appId: 1, targetStoreId: "a" },
      { appId: 1, targetStoreId: "a" },
      { appId: 2, targetStoreId: "own" },
      { appId: 2, targetStoreId: "b" },
    ];
    const checked = [
      { appId: 1, targetStoreId: "own", checkedOn: "2026-11-04" },
      { appId: 2, targetStoreId: "own", checkedOn: "2026-11-03" },
    ];
    // Never checked first (in their order), then the one checked yesterday.
    expect(sourcesToCheck(sources, checked, "2026-11-04")).toEqual([
      { appId: 1, targetStoreId: "a" },
      { appId: 2, targetStoreId: "b" },
      { appId: 2, targetStoreId: "own" },
    ]);
    expect(sourcesToCheck(sources, checked, "2026-11-04", 1)).toHaveLength(1);
  });

  it("rotates over every source when there are more than the cap, oldest check first", () => {
    const sources = ["a", "b", "c", "d", "e"].map((t) => ({ appId: 1, targetStoreId: t }));
    let checked: { appId: number; targetStoreId: string; checkedOn: string }[] = [];
    const days = ["2026-11-01", "2026-11-02", "2026-11-03"];
    const read: string[][] = [];
    for (const day of days) {
      const due = sourcesToCheck(sources, checked, day, 2);
      read.push(due.map((s) => s.targetStoreId));
      checked = [...checked.filter((c) => !due.some((s) => s.targetStoreId === c.targetStoreId)), ...due.map((s) => ({ ...s, checkedOn: day }))];
    }
    // Day 1 and 2 read the never-checked ones; day 3 the last new one, then the one read longest ago.
    expect(read).toEqual([["a", "b"], ["c", "d"], ["e", "a"]]);
  });

  it("orders by the day of the last check, never-checked before any of them", () => {
    const sources = ["recent", "old", "new", "older"].map((t) => ({ appId: 1, targetStoreId: t }));
    const checked = [
      { appId: 1, targetStoreId: "recent", checkedOn: "2026-11-03" },
      { appId: 1, targetStoreId: "old", checkedOn: "2026-10-20" },
      { appId: 1, targetStoreId: "older", checkedOn: "2026-10-01" },
    ];
    expect(sourcesToCheck(sources, checked, "2026-11-04").map((s) => s.targetStoreId)).toEqual(["new", "older", "old", "recent"]);
    expect(sourcesToCheck(sources, checked, "2026-11-04", 0)).toEqual([]);
  });

  it("runs before relevance in the daily job, after own listings", () => {
    const start = Date.UTC(2026, 10, 4, 6);
    const budget = cronBudget(start, start);
    expect(budget.reviewFreshnessDeadline).toBe(start + REVIEW_FRESHNESS_STOP_AT_MS);
    expect(OWN_LISTINGS_STOP_AT_MS).toBeLessThan(REVIEW_FRESHNESS_STOP_AT_MS);
    expect(REVIEW_FRESHNESS_STOP_AT_MS).toBeLessThan(RELEVANCE_STOP_AT_MS);
  });
});

describe("freshnessSignal", () => {
  it("gives each request only the time left before the relevance step", async () => {
    const now = Date.now();
    expect(freshnessSignal(Infinity, now)).toBeUndefined();
    const late = freshnessSignal(now - 1, now)!;
    expect(late.aborted).toBe(true);
    expect((late.reason as DOMException).name).toBe("TimeoutError");
    const soon = freshnessSignal(Date.now() + 20)!;
    expect(soon.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(soon.aborted).toBe(true);
  });

  it("defaults to the relevance deadline of the cron budget", () => {
    const start = Date.UTC(2026, 10, 4, 6);
    const budget = cronBudget(start, start);
    // trackReviewFreshness(deadline) caps its requests at deadline + (relevance − freshness stop).
    expect(budget.reviewFreshnessDeadline + (RELEVANCE_STOP_AT_MS - REVIEW_FRESHNESS_STOP_AT_MS)).toBe(budget.relevanceDeadline);
  });
});

describe("heatmap scale", () => {
  it("buckets 0–100 into five steps of one hue", () => {
    expect([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(heatBucket)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(heatBucket(-5)).toBe(1);
    expect(heatBucket(150)).toBe(5);
    expect(heatBucket(Number.NaN)).toBe(1);
  });

  it("only uses the heat tokens, with light text on the two darkest steps", () => {
    for (const c of Object.values(HEAT_CLASS)) expect(c).toMatch(/^bg-heat-[1-5] text-(ink|on-heat)$/);
    expect(HEAT_CLASS[5]).toContain("text-on-heat");
    expect(HEAT_CLASS[1]).toContain("text-ink");
  });
});

describe("Próximos picos", () => {
  const keywords = [
    { term: "rebajas", peaks: [0], keywordId: 1 },
    { term: "navidad", peaks: [11], keywordId: 2 },
    { term: "verano", peaks: [6, 7], keywordId: 3 },
    { term: "noviembre", peaks: [10], keywordId: 4 },
  ];

  it("lists the nearest peaks within three months, with the weeks to go", () => {
    const cards = upcomingPeaks(nextSeasons(keywords, "2026-11-04"));
    expect(cards.map((c) => c.term)).toEqual(["noviembre", "navidad", "rebajas"]);
    expect(cards[0]).toMatchObject({ running: true, weeks: 0 });
    expect(cards[1]).toMatchObject({ month: 11, days: 27, weeks: 4 });
    expect(upcomingPeaks(nextSeasons(keywords, "2026-11-04"), 1)).toHaveLength(1);
  });

  it("says when the season starts", () => {
    expect(startsInLabel({ running: true, weeks: 0 })).toBe("En temporada ahora");
    expect(startsInLabel({ running: false, weeks: 0 })).toBe("Empieza esta semana");
    expect(startsInLabel({ running: false, weeks: 1 })).toBe("Empieza en 1 semana");
    expect(startsInLabel({ running: false, weeks: 4 })).toBe("Empieza en 4 semanas");
  });

  it("«Preparar» dates its annotation three weeks before the peak, or today when that has passed", () => {
    expect(prepareAnnotation("navidad", 27, "2026-11-04")).toEqual({ date: "2026-11-10", label: "Preparar temporada: navidad" });
    expect(prepareAnnotation("navidad", 10, "2026-11-04").date).toBe("2026-11-04");
    expect(prepareAnnotation("x".repeat(200), 0, "2026-11-04").label).toHaveLength(120);
    expect(prepareFocus("navidad", 11)).toBe("Temporada de «navidad» en diciembre");
  });
});

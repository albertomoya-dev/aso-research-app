import { describe, expect, it } from "vitest";
import {
  alertPriority,
  applyAlertPrefs,
  DEFAULT_ALERT_PREFS,
  describeMove,
  detectRankAlerts,
  groupLeaderAlerts,
  pickBaseline,
  type RankPoint,
  summarizeWeek,
  type WeekRow,
} from "@/lib/alerts";
import { renderSummaryEmail } from "@/lib/email";
import type { AppSummary } from "@/lib/stores/types";

const app = (id: string): AppSummary => ({ store: "ios", id, title: `App ${id}`, developer: "d", icon: "i", rating: null, url: "u" });
const point = (keywordId: number, position: number | null, leader = "x", extra: Partial<RankPoint> = {}): RankPoint => ({
  keywordId,
  term: `kw${keywordId}`,
  position,
  top5: [app(leader)],
  depth: 200,
  relevance: null,
  intent: null,
  ...extra,
});
const none = { watchedStoreIds: new Set<string>() };

describe("detectRankAlerts", () => {
  it("raises one ranking alert per keyword, the most important first", () => {
    const alerts = detectRankAlerts(
      [point(1, 14), point(2, 8), point(3, 20), point(4, 30), point(5, 40), point(6, 120), point(7, 12)],
      [point(1, 9), point(2, 11), point(3, 26), point(4, null), point(5, 41), point(6, 100), point(7, 6), point(8, 3)],
      "own",
      none,
    );
    expect(alerts.map((a) => [a.keywordId, a.kind, a.tone])).toEqual([
      [1, "entered_top10", "up"],
      [2, "left_top10", "down"],
      [3, "moved_down", "down"],
      [4, "lost_ranking", "down"],
      [7, "entered_top10", "up"],
    ]);
    expect(alerts[0]).toMatchObject({ title: "«kw1» entra en el TOP 10", detail: "#14 → #9" });
    expect(alerts[3].detail).toBe("#30 → fuera de los 200 resultados");
  });

  it("reports a new #1, from our point of view when it is us", () => {
    const alerts = detectRankAlerts([point(1, 2, "own"), point(2, 1, "a")], [point(1, 2, "b"), point(2, 1, "own")], "own", none);
    expect(alerts.map((a) => [a.kind, a.tone, a.title])).toEqual([
      ["new_leader", "down", "Nuevo nº 1 en «kw1»: App b"],
      ["new_leader", "up", "Eres el nº 1 en «kw2»"],
    ]);
  });

  it("ignores a new #1 where we are outside the first 30 and no watched competitor is involved", () => {
    expect(detectRankAlerts([point(1, 45, "a")], [point(1, 47, "b")], "own", none)).toEqual([]);
    expect(detectRankAlerts([point(1, null, "a")], [point(1, null, "b")], "own", none)).toEqual([]);
    // Within the first 30 before or now, it counts.
    expect(detectRankAlerts([point(1, 30, "a")], [point(1, 33, "b")], "own", none).map((a) => a.kind)).toEqual(["new_leader"]);
  });

  it("reports a new #1 when the old or new leader is a watched competitor", () => {
    const watched = { watchedStoreIds: new Set(["rival"]) };
    expect(detectRankAlerts([point(1, null, "a")], [point(1, null, "rival")], "own", watched)).toMatchObject([
      { kind: "new_leader", tone: "info", title: "Nuevo nº 1 en «kw1»: App rival" },
    ]);
    expect(detectRankAlerts([point(1, 80, "rival")], [point(1, 80, "b")], "own", watched)).toHaveLength(1);
  });

  it("only says we dropped out when the store returned more results than our old position", () => {
    // Google Play returned 30 results: being out of them after #35 says nothing.
    expect(detectRankAlerts([point(1, 35)], [point(1, null, "x", { depth: 30 })], "own", none)).toEqual([]);
    expect(detectRankAlerts([point(1, 30)], [point(1, null, "x", { depth: 30 })], "own", none)).toEqual([]);
    expect(detectRankAlerts([point(1, 22)], [point(1, null, "x", { depth: 30 })], "own", none)).toMatchObject([
      { kind: "lost_ranking", detail: "#22 → fuera de los 30 resultados" },
    ]);
    // Leaving the TOP 10 needs the same: out of 8 results after #9 is unknown.
    expect(detectRankAlerts([point(1, 9)], [point(1, null, "x", { depth: 8 })], "own", none)).toEqual([]);
  });

  it("keeps only TOP 10 entries and exits, and our own #1, for low-relevance or foreign keywords", () => {
    const low = { relevance: 2 };
    const alerts = detectRankAlerts(
      [point(1, 30, "a", low), point(2, 20, "x", low), point(3, 14, "x", low), point(4, 5, "a", { intent: "foreign" })],
      [point(1, 20, "b", low), point(2, null, "x", low), point(3, 8, "x", low), point(4, 3, "own", { intent: "foreign" })],
      "own",
      { watchedStoreIds: new Set(["a"]) },
    );
    expect(alerts.map((a) => [a.keywordId, a.kind])).toEqual([
      [3, "entered_top10"],
      [4, "new_leader"],
    ]);
    // The threshold comes from the preferences.
    expect(detectRankAlerts([point(1, 30, "x", low)], [point(1, 20, "x", low)], "own", { ...none, minRelevance: 2 })).toHaveLength(1);
  });
});

describe("groupLeaderAlerts", () => {
  it("collapses other apps' new #1 into one alert and keeps ours per keyword", () => {
    const watched = { watchedStoreIds: new Set(["a"]) };
    const found = detectRankAlerts(
      [point(1, 50, "a"), point(2, 50, "a"), point(3, 50, "a"), point(4, 1, "own"), point(5, 9)],
      [point(1, 50, "b"), point(2, 50, "c"), point(3, 50, "d"), point(4, 2, "z"), point(5, 9)],
      "own",
      watched,
    );
    const grouped = groupLeaderAlerts(found);
    expect(grouped.map((a) => [a.keywordId, a.kind, a.tone, a.title])).toEqual([
      [4, "new_leader", "down", "Nuevo nº 1 en «kw4»: App z"],
      [null, "new_leader", "info", "3 keywords cambiaron de nº 1"],
    ]);
    expect(grouped[1].detail).toBe("«kw1»: App a → App b · «kw2»: App a → App c · «kw3»: App a → App d");
  });

  it("stores a single change without a keyword too, so a second run updates the same row", () => {
    const found = detectRankAlerts([point(1, 5, "a")], [point(1, 5, "b")], "own", none);
    expect(groupLeaderAlerts(found)).toMatchObject([{ keywordId: null, title: "Nuevo nº 1 en «kw1»: App b", detail: "«kw1»: App a → App b" }]);
  });
});

describe("alert preferences and order", () => {
  it("drops the kinds the user switched off", () => {
    const alerts = [
      { kind: "new_leader" as const, tone: "info" as const },
      { kind: "moved_up" as const, tone: "up" as const },
    ];
    expect(applyAlertPrefs(alerts, DEFAULT_ALERT_PREFS)).toHaveLength(2);
    expect(applyAlertPrefs(alerts, { kinds: ["moved_up", "moved_down"], minRelevance: 3 })).toEqual([alerts[1]]);
  });

  it("puts our own app first", () => {
    const order = [
      { kind: "competitor_change" as const, tone: "info" as const },
      { kind: "new_leader" as const, tone: "info" as const },
      { kind: "moved_down" as const, tone: "down" as const },
      { kind: "entered_top10" as const, tone: "up" as const },
    ].toSorted((a, b) => alertPriority(a) - alertPriority(b));
    expect(order.map((a) => a.kind)).toEqual(["entered_top10", "moved_down", "new_leader", "competitor_change"]);
  });
});

const row = (keywordId: number, before: number | null, now: number | null, extra: Partial<WeekRow> = {}): WeekRow => ({
  keywordId,
  term: String.fromCharCode(96 + keywordId),
  before,
  now,
  beforeDepth: 200,
  nowDepth: 200,
  hasBefore: true,
  ...extra,
});

describe("summarizeWeek", () => {
  it("counts moves and picks the biggest gainers and losers", () => {
    const week = summarizeWeek([row(1, 20, 5), row(2, 3, 9), row(3, null, 50, { hasBefore: false }), row(4, 7, 7), row(5, null, null)]);
    expect(week).toMatchObject({ tracked: 5, improved: 1, worsened: 1, top10: 3, top10Before: 2, noBaseline: 1 });
    expect(week.gainers.map((g) => [g.term, g.change])).toEqual([["a", 15]]);
    expect(week.losers.map((l) => [l.term, l.change])).toEqual([["b", -6]]);
  });

  it("describes out of 30 → #18 as entering the first 30, not a jump of 183", () => {
    const week = summarizeWeek([row(1, null, 18, { beforeDepth: 30, nowDepth: 30 }), row(2, 5, 10)]);
    expect(week.gainers).toHaveLength(1);
    expect(week.gainers[0]).toMatchObject({ movement: "entered", change: 13 });
    expect(describeMove(week.gainers[0])).toBe("entra en los primeros 30");
    expect(describeMove(week.losers[0])).toBe("baja 5");
  });

  it("describes #12 → out of 30 as leaving, and skips what cannot be compared", () => {
    const week = summarizeWeek([
      row(1, 12, null, { nowDepth: 30 }),
      // #45 a week ago, out of only 30 today: it may not have moved at all.
      row(2, 45, null, { nowDepth: 30 }),
      // Out of 30 before, #40 now: no honest comparison either.
      row(3, null, 40, { beforeDepth: 30 }),
    ]);
    expect(week.losers.map((l) => [l.term, describeMove(l)])).toEqual([["a", "sale de los primeros 30"]]);
    expect(week.gainers).toEqual([]);
    expect(week).toMatchObject({ improved: 0, worsened: 1 });
  });
});

describe("pickBaseline", () => {
  it("uses the latest check up to a week ago", () => {
    expect(pickBaseline(["2026-10-20", "2026-10-22", "2026-10-29"], "2026-10-23")).toBe("2026-10-22");
  });

  it("falls back to the oldest check when the app is newer than a week", () => {
    expect(pickBaseline(["2026-10-28", "2026-10-26", "2026-10-30", "2026-10-26"], "2026-10-23")).toBe("2026-10-26");
  });

  it("has nothing to compare with a single day of data", () => {
    expect(pickBaseline(["2026-10-30", "2026-10-30"], "2026-10-23")).toBeNull();
    expect(pickBaseline([], "2026-10-23")).toBeNull();
  });
});

describe("renderSummaryEmail", () => {
  it("escapes text and links to the app when a URL is known", () => {
    const html = renderSummaryEmail(
      {
        since: "2026-10-19",
        until: "2026-10-26",
        apps: [
          {
            app: { id: 3, title: "Run <b>", icon: "i", store: "ios", country: "es" },
            week: summarizeWeek([row(1, 12, 4, { term: "correr" }), row(2, null, 18, { term: "andar", beforeDepth: 30 })]),
            baselineDate: "2026-10-19",
            share: 12.5,
            shareBefore: 10,
            alerts: [{ title: "Strava ha cambiado su ficha", detail: "Título", tone: "info", date: "2026-10-20" }],
          },
        ],
      },
      "https://rankeo.example",
    );
    expect(html).toContain('href="https://rankeo.example/apps/3"');
    expect(html).toContain("Run &#60;b&#62;");
    expect(html).toContain("Frente al 19 oct");
    expect(html).toContain("▲ correr: #12 → #4");
    expect(html).toContain("▲ andar: &#62; 30 → #18 (entra en los primeros 30)");
    expect(html).toContain("12,5%");
    expect(html).toContain("Strava ha cambiado su ficha (Título)");
  });
});

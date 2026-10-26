import { describe, expect, it } from "vitest";
import { detectRankAlerts, type RankPoint, summarizeWeek } from "@/lib/alerts";
import { renderSummaryEmail } from "@/lib/email";
import type { AppSummary } from "@/lib/stores/types";

const app = (id: string): AppSummary => ({ store: "ios", id, title: `App ${id}`, developer: "d", icon: "i", rating: null, url: "u" });
const point = (keywordId: number, position: number | null, leader = "x"): RankPoint => ({
  keywordId,
  term: `kw${keywordId}`,
  position,
  top5: [app(leader)],
});

describe("detectRankAlerts", () => {
  it("raises one ranking alert per keyword, the most important first", () => {
    const alerts = detectRankAlerts(
      [point(1, 14), point(2, 8), point(3, 20), point(4, 30), point(5, 40), point(6, 120), point(7, 12)],
      [point(1, 9), point(2, 11), point(3, 26), point(4, null), point(5, 41), point(6, 100), point(7, 6), point(8, 3)],
      "own",
    );
    expect(alerts.map((a) => [a.keywordId, a.kind, a.tone])).toEqual([
      [1, "entered_top10", "up"],
      [2, "left_top10", "down"],
      [3, "moved_down", "down"],
      [4, "lost_ranking", "down"],
      [7, "entered_top10", "up"],
    ]);
    expect(alerts[0]).toMatchObject({ title: "«kw1» entra en el TOP 10", detail: "#14 → #9" });
    expect(alerts[3].detail).toBe("#30 → fuera del ranking");
  });

  it("reports a new #1, from our point of view when it is us", () => {
    const alerts = detectRankAlerts([point(1, 2, "own"), point(2, 1, "a")], [point(1, 2, "b"), point(2, 1, "own")], "own");
    expect(alerts.map((a) => [a.kind, a.tone, a.title])).toEqual([
      ["new_leader", "down", "Nuevo nº 1 en «kw1»: App b"],
      ["new_leader", "up", "Eres el nº 1 en «kw2»"],
    ]);
  });
});

describe("summarizeWeek", () => {
  it("counts moves and picks the biggest gainers and losers", () => {
    const week = summarizeWeek([
      { keywordId: 1, term: "a", before: 20, now: 5 },
      { keywordId: 2, term: "b", before: 3, now: 9 },
      { keywordId: 3, term: "c", before: null, now: 50 },
      { keywordId: 4, term: "d", before: 7, now: 7 },
      { keywordId: 5, term: "e", before: null, now: null },
    ]);
    expect(week).toMatchObject({ tracked: 5, improved: 2, worsened: 1, top10: 3, top10Before: 2 });
    expect(week.gainers.map((g) => g.term)).toEqual(["c", "a"]);
    expect(week.losers.map((l) => [l.term, l.change])).toEqual([["b", -6]]);
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
            week: summarizeWeek([{ keywordId: 1, term: "correr", before: 12, now: 4 }]),
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
    expect(html).toContain("▲ correr: #12 → #4");
    expect(html).toContain("12,5%");
    expect(html).toContain("Strava ha cambiado su ficha (Título)");
  });
});

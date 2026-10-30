import { describe, expect, it } from "vitest";
import { dailySeries, positionTicks } from "@/lib/chart-data";
import { averagePosition, computeRank, positionChange, rankStatus, shiftDate } from "@/lib/ranking";
import type { AppSummary } from "@/lib/stores/types";

const app = (id: string): AppSummary => ({ store: "ios", id, title: id, developer: "dev", icon: "", rating: null, url: "" });

describe("computeRank", () => {
  const results = ["a", "b", "c", "d", "e", "f", "mine", "g"].map(app);

  it("returns the 1-based position and the first five results", () => {
    const { position, top5 } = computeRank(results, "mine");
    expect(position).toBe(7);
    expect(top5.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns null, never 0, when the app is not in the results", () => {
    expect(computeRank(results, "other").position).toBeNull();
  });

  it("handles fewer than five results", () => {
    expect(computeRank([app("mine")], "mine")).toEqual({ position: 1, top5: [app("mine")] });
  });
});

describe("positionChange", () => {
  it("is positive when the app moves up", () => {
    expect(positionChange(4, 9)).toBe(5);
    expect(positionChange(9, 4)).toBe(-5);
  });

  it("is null when a day is missing or outside the results", () => {
    expect(positionChange(4, null)).toBeNull();
    expect(positionChange(null, 4)).toBeNull();
    expect(positionChange(4, undefined)).toBeNull();
  });
});

describe("rankStatus", () => {
  it.each([
    [1, "top10"],
    [10, "top10"],
    [11, "within-reach"],
    [30, "within-reach"],
    [31, "far"],
    [null, "out"],
  ] as const)("%s → %s", (position, status) => {
    expect(rankStatus(position)).toBe(status);
  });
});

describe("averagePosition", () => {
  const points = [
    { date: "2026-10-01", position: 10 },
    { date: "2026-10-02", position: null },
    { date: "2026-10-03", position: 20 },
    { date: "2026-10-10", position: 2 },
  ];

  it("averages the days inside the window and skips gaps", () => {
    expect(averagePosition(points, "2026-10-01", "2026-10-05")).toBe(15);
  });

  it("is null with no ranked days", () => {
    expect(averagePosition(points, "2026-10-04", "2026-10-09")).toBeNull();
  });
});

describe("shiftDate", () => {
  it("crosses month and year boundaries", () => {
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("dailySeries", () => {
  it("fills every day and tells 'out of results' from 'not checked'", () => {
    const series = dailySeries(
      [
        { date: "2026-10-01", position: 5 },
        { date: "2026-10-03", position: null },
      ],
      "2026-10-01",
      "2026-10-04",
    );
    expect(series).toEqual([
      { date: "2026-10-01", position: 5, state: "ranked" },
      { date: "2026-10-02", position: null, state: "none" },
      { date: "2026-10-03", position: null, state: "out" },
      { date: "2026-10-04", position: null, state: "none" },
    ]);
  });
});

describe("dailySeries depth", () => {
  it("keeps the depth of each check, since Google Play returns a different number of results per search", () => {
    const series = dailySeries(
      [
        { date: "2026-10-01", position: null, depth: 29 },
        { date: "2026-10-02", position: 4, depth: 31 },
      ],
      "2026-10-01",
      "2026-10-02",
    );
    expect(series.map((p) => [p.state, p.depth])).toEqual([
      ["out", 29],
      ["ranked", 31],
    ]);
  });
});

describe("positionTicks", () => {
  it("starts at #1 and uses round steps", () => {
    expect(positionTicks(30)).toEqual([1, 5, 10, 15, 20, 25, 30]);
    expect(positionTicks(10)).toEqual([1, 2, 4, 6, 8, 10]);
    expect(positionTicks(200)).toEqual([1, 50, 100, 150, 200]);
  });
});

import { describe, expect, it } from "vitest";
import { monthlyProfile, nextPeak, peakMonths, seasonalityStrength } from "@/lib/seasonality";
import type { TrendPoint } from "@/lib/trends";

/** One point a week for a year, with the given value per calendar month. */
function weekly(byMonth: number[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let d = new Date(Date.UTC(2025, 10, 2)); points.length < 52; d = new Date(d.getTime() + 7 * 86_400_000)) {
    points.push({ date: d.toISOString().slice(0, 10), value: byMonth[d.getUTCMonth()] });
  }
  return points;
}

describe("seasonality", () => {
  const summer = weekly([20, 20, 25, 30, 40, 80, 100, 90, 40, 25, 20, 20]);

  it("builds a profile scaled to the strongest month", () => {
    expect(monthlyProfile(summer)).toEqual([20, 20, 25, 30, 40, 80, 100, 90, 40, 25, 20, 20]);
    expect(monthlyProfile(summer.slice(0, 20))).toBeNull();
    expect(monthlyProfile(weekly(new Array(12).fill(0)))).toBeNull();
  });

  it("finds peak months and strength", () => {
    const profile = monthlyProfile(summer)!;
    expect(peakMonths(profile)).toEqual([5, 6, 7]);
    expect(seasonalityStrength(profile)).toBeCloseTo(100 / (510 / 12));
    expect(peakMonths(new Array(12).fill(50))).toEqual([]);
  });

  it("announces the next peak start within the horizon", () => {
    const profile = monthlyProfile(summer)!;
    expect(nextPeak(profile, 3)).toEqual({ month: 5, monthsAhead: 2 });
    expect(nextPeak(profile, 5)).toEqual({ month: 5, monthsAhead: 0 });
    // July is inside the peak that started in June: nothing new is coming.
    expect(nextPeak(profile, 6)).toBeNull();
    expect(nextPeak(profile, 1)).toBeNull();
  });

  it("wraps around the year", () => {
    const christmas = monthlyProfile(weekly([30, 20, 20, 20, 20, 20, 20, 20, 20, 25, 60, 100]))!;
    expect(nextPeak(christmas, 9)).toEqual({ month: 10, monthsAhead: 1 });
  });
});

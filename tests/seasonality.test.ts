import { describe, expect, it } from "vitest";
import {
  analyzeSeasonality,
  canAnnouncePeak,
  completePoints,
  monthlyProfile,
  nextPeak,
  peakAlertDue,
  peakMonth,
  peakMonths,
  seasonalityStrength,
  signalQuality,
  sustainedMonths,
} from "@/lib/seasonality";
import { isSeasonalAlertRelevant, peakKey, warnedPeakMonth } from "@/lib/seasonality-jobs";
import type { TrendPoint } from "@/lib/trends";

/**
 * One point a week with the given value per calendar month. By default from 5 Oct 2025 to
 * 25 Oct 2026: October 2026 is the month in progress, October 2025 still covers October.
 */
function weekly(byMonth: number[], start = Date.UTC(2025, 9, 5), count = 56): TrendPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start + i * 7 * 86_400_000);
    return { date: d.toISOString().slice(0, 10), value: byMonth[d.getUTCMonth()] };
  });
}

/** Deterministic PRNG (mulberry32) so the noisy series are the same on every run. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 52 weeks of normal noise around `mean`, rescaled like Google Trends (max = 100). */
function flatNoisy(seed: number, mean: number, sd: number): TrendPoint[] {
  const rand = mulberry32(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const raw = Array.from({ length: 52 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 10, 2) + i * 7 * 86_400_000).toISOString().slice(0, 10),
    value: Math.max(0, Math.round(mean + sd * normal())),
  }));
  const max = Math.max(...raw.map((p) => p.value));
  return raw.map((p) => ({ ...p, value: Math.round((100 * p.value) / max) }));
}

describe("seasonality", () => {
  const summer = weekly([20, 20, 25, 30, 40, 80, 100, 90, 40, 25, 20, 20]);

  it("builds a profile scaled to the strongest month", () => {
    expect(monthlyProfile(summer)).toEqual([20, 20, 25, 30, 40, 80, 100, 90, 40, 25, 20, 20]);
    expect(monthlyProfile(summer.slice(0, 20))).toBeNull();
    expect(monthlyProfile(weekly(new Array(12).fill(0)))).toBeNull();
  });

  it("rejects a series that is almost all zeros", () => {
    const spike = Array.from({ length: 52 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 10, 2) + i * 7 * 86_400_000).toISOString().slice(0, 10),
      value: i === 20 ? 100 : 0,
    }));
    expect(signalQuality(spike)).toBe(false);
    expect(monthlyProfile(spike)).toBeNull();
    expect(analyzeSeasonality(spike)).toBeNull();
  });

  it("needs interest in at least 6 months", () => {
    // Interest only from August to December: five months cannot show a yearly pattern.
    const fewMonths = weekly([0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50]);
    expect(signalQuality(completePoints(fewMonths))).toBe(false);
  });

  it("leaves out the month in progress", () => {
    // October 2026 is half a month with a broken value; October 2025 still describes October.
    const noisy = summer.map((p) => (p.date.startsWith("2026-10") ? { ...p, value: 100 } : p));
    expect(monthlyProfile(noisy)![9]).toBe(25);
    // Without an older October, that month stays unknown instead of using partial data.
    const lastYearOnly = weekly([20, 20, 25, 30, 40, 80, 100, 90, 40, 25, 20, 20], Date.UTC(2025, 10, 2), 52);
    const profile = monthlyProfile(lastYearOnly)!;
    expect(profile[9]).toBeNull();
    expect(profile[6]).toBe(100);
  });

  it("finds sustained peak months and strength", () => {
    const s = analyzeSeasonality(summer)!;
    expect(s.peaks).toEqual([5, 6, 7]);
    expect(seasonalityStrength(s.profile)).toBeCloseTo(100 / (510 / 12));
    expect(peakMonths(new Array(12).fill(50))).toEqual([]);
  });

  it("ignores a single viral week", () => {
    const viral = weekly(new Array(12).fill(30)).map((p) => (p.date === "2026-03-08" ? { ...p, value: 100 } : p));
    const profile = monthlyProfile(viral)!;
    // March stands out on average, but only one week is above the threshold.
    expect(peakMonths(profile)).toEqual([2]);
    expect(sustainedMonths(viral)[2]).toBe(false);
    expect(analyzeSeasonality(viral)!.peaks).toEqual([]);
  });

  it("still detects a sustained December peak", () => {
    const christmas = weekly([30, 20, 20, 20, 20, 20, 20, 20, 20, 25, 60, 100]);
    expect(analyzeSeasonality(christmas)!.peaks).toEqual([10, 11]);
    expect(peakMonth(christmas, 40)).toBe("diciembre");
  });

  it("finds no peak in a flat but noisy series", () => {
    // Weekly mean 30–40 with sd 20: before the noise check most of these showed a fake peak.
    const flagged = Array.from({ length: 40 }, (_, seed) => flatNoisy(seed + 1, seed % 2 ? 30 : 40, 20)).filter(
      (points) => (analyzeSeasonality(points)?.peaks.length ?? 0) > 0,
    );
    expect(flagged).toEqual([]);
  });

  it("announces no peak when the store popularity is under 10 or unknown", () => {
    const christmas = weekly([30, 20, 20, 20, 20, 20, 20, 20, 20, 25, 60, 100]);
    expect(canAnnouncePeak(10)).toBe(true);
    expect(canAnnouncePeak(9)).toBe(false);
    expect(canAnnouncePeak(null)).toBe(false);
    expect(peakMonth(christmas, 5)).toBeNull();
    expect(peakMonth(christmas, null)).toBeNull();
  });

  it("names a clear peak month and nothing for a flat series", () => {
    const january = Array.from({ length: 52 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 0, 5 + i * 7));
      return { date: d.toISOString().slice(0, 10), value: d.getUTCMonth() === 0 ? 100 : 30 };
    });
    expect(peakMonth(january, 50)).toBe("enero");
    const flat = january.map((p) => ({ ...p, value: 50 }));
    expect(peakMonth(flat, 50)).toBeNull();
  });

  it("announces the next peak start within the horizon", () => {
    const peaks = analyzeSeasonality(summer)!.peaks;
    expect(nextPeak(peaks, 3)).toEqual({ month: 5, monthsAhead: 2 });
    expect(nextPeak(peaks, 5)).toEqual({ month: 5, monthsAhead: 0 });
    // July is inside the peak that started in June: nothing new is coming.
    expect(nextPeak(peaks, 6)).toBeNull();
    expect(nextPeak(peaks, 1)).toBeNull();
  });

  it("wraps around the year", () => {
    expect(nextPeak([10, 11], 9)).toEqual({ month: 10, monthsAhead: 1 });
  });

  it("warns 21 to 27 days before a peak starts", () => {
    expect(peakAlertDue([10, 11], "2026-10-08")).toEqual({ month: 10, start: "2026-11-01", days: 24 });
    expect(peakAlertDue([10, 11], "2026-10-11")?.days).toBe(21);
    expect(peakAlertDue([10, 11], "2026-10-12")).toBeNull();
    expect(peakAlertDue([10, 11], "2026-10-01")).toBeNull();
    // December is inside the peak: only its start (November) is announced.
    expect(peakAlertDue([10, 11], "2026-11-08")).toBeNull();
    expect(peakAlertDue([0], "2026-12-10")).toEqual({ month: 0, start: "2027-01-01", days: 22 });
  });
});

describe("seasonal alert jobs", () => {
  it("keys a past alert by the peak it announced", () => {
    // Every day of the 21–27 day window before 1 November points at November.
    for (const date of ["2026-10-05", "2026-10-08", "2026-10-11"]) {
      expect(warnedPeakMonth(date)).toBe(peakAlertDue([10, 11], date)!.start.slice(0, 7));
    }
    // An alert for a March peak does not hide a May peak of the same keyword.
    const march = peakKey(1, 7, warnedPeakMonth("2026-02-06"));
    const may = peakKey(1, 7, peakAlertDue([2, 4], "2026-04-08")!.start.slice(0, 7));
    expect(march).toBe("1:7:2026-03");
    expect(may).toBe("1:7:2026-05");
  });

  it("honours the app's minimum relevance and the noise rules", () => {
    const row = { term: "regalos navidad", relevance: 3, intent: "own" as const };
    expect(isSeasonalAlertRelevant(row, "es", 3)).toBe(true);
    expect(isSeasonalAlertRelevant(row, "es", 4)).toBe(false);
    expect(isSeasonalAlertRelevant({ ...row, relevance: 2 }, "es", 2)).toBe(true);
    expect(isSeasonalAlertRelevant({ ...row, relevance: null }, "es", 5)).toBe(true);
    expect(isSeasonalAlertRelevant({ ...row, intent: "foreign" }, "es", 1)).toBe(false);
    expect(isSeasonalAlertRelevant({ ...row, term: "para" }, "es", 1)).toBe(false);
  });
});

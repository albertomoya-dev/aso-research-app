import { describe, expect, it } from "vitest";
import type { AnnotationDetail } from "@/lib/annotations";
import type { AggregateImpact } from "@/lib/impact";
import { experimentColumns, groupByMonth, impactLine, isDetected, monthLabel, timelineKind } from "@/lib/timeline";

const listing = (...fields: string[]): AnnotationDetail => ({ kind: "listing", changes: fields.map((field) => ({ field, label: field })) });

describe("timelineKind", () => {
  it("manual and publish annotations keep their source", () => {
    expect(timelineKind({ source: "manual", detail: null })).toBe("manual");
    expect(timelineKind({ source: "publish", detail: { kind: "publish", changes: [] } })).toBe("publish");
    expect(isDetected("manual")).toBe(false);
    expect(isDetected("icon")).toBe(true);
  });
  it("names an automatic one after what changed", () => {
    expect(timelineKind({ source: "auto", detail: listing("version") })).toBe("version");
    expect(timelineKind({ source: "auto", detail: listing("icon") })).toBe("icon");
    expect(timelineKind({ source: "auto", detail: listing("icon", "version") })).toBe("icon");
    expect(timelineKind({ source: "auto", detail: listing("screenshots") })).toBe("screenshots");
    expect(timelineKind({ source: "auto", detail: listing("title", "icon") })).toBe("listing");
    expect(timelineKind({ source: "auto", detail: listing("shortDescription") })).toBe("listing");
    expect(timelineKind({ source: "auto", detail: null })).toBe("listing");
  });
});

describe("groupByMonth", () => {
  it("groups newest first and keeps the order of ties", () => {
    const items = [
      { id: 1, date: "2026-10-03" },
      { id: 2, date: "2026-11-04" },
      { id: 3, date: "2026-10-20" },
      { id: 4, date: "2026-11-04" },
      { id: 5, date: "2025-11-30" },
    ];
    const groups = groupByMonth(items, (i) => i.date);
    expect(groups.map((g) => g.key)).toEqual(["2026-11", "2026-10", "2025-11"]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[2, 4], [3, 1], [5]]);
    expect(groups[0].label).toBe("noviembre de 2026");
  });
  it("returns nothing for no entries", () => {
    expect(groupByMonth([], () => "")).toEqual([]);
  });
  it("labels a month in Spanish", () => {
    expect(monthLabel("2026-01-31")).toBe("enero de 2026");
  });
});

describe("experimentColumns", () => {
  it("puts every experiment in its column, in order", () => {
    const cols = experimentColumns([
      { id: 1, status: "done" as const },
      { id: 2, status: "planned" as const },
      { id: 3, status: "done" as const },
    ]);
    expect(cols.planned.map((e) => e.id)).toEqual([2]);
    expect(cols.running).toEqual([]);
    expect(cols.done.map((e) => e.id)).toEqual([1, 3]);
  });
});

describe("impactLine", () => {
  const agg = (over: Partial<AggregateImpact>): AggregateImpact => ({
    affected: 12,
    before: 23.2,
    after: 18.4,
    change: 4.8,
    verdict: "up",
    entered: 0,
    left: 0,
    complete: true,
    ...over,
  });
  it("reads like the redesign: «12 keywords afectadas · posición media 23 → 18» and ▲5", () => {
    expect(impactLine(agg({}), "affected")).toEqual({ text: "12 keywords afectadas · posición media 23 → 18", delta: 5, extras: [] });
  });
  it("says «medidas» without a word diff, and keeps a decimal for small moves", () => {
    const line = impactLine(agg({ affected: 1, before: 9.4, after: 9.2, change: 0.2, verdict: "flat" }), "all");
    expect(line).toEqual({ text: "1 keyword medida · posición media 9,4 → 9,2", delta: 0, extras: [] });
  });
  it("counts entries and exits apart, and has no text without pairs", () => {
    const line = impactLine(agg({ affected: 0, before: null, after: null, change: null, verdict: "entered", entered: 2, left: 1 }), "affected");
    expect(line).toEqual({ text: null, delta: null, extras: ["2 entran en resultados", "1 sale de resultados"] });
  });
  it("a drop is negative", () => {
    expect(impactLine(agg({ before: 10, after: 14, change: -4, verdict: "down" }), "affected").delta).toBe(-4);
  });
});

import { shiftDate } from "./ranking";

export type ChartPoint = {
  date: string;
  /** null leaves a gap in the line. */
  position: number | null;
  /** "out": checked but outside the results. "none": not checked that day. */
  state: "ranked" | "out" | "none";
};

/** One point per day from `from` to `to`, so gaps and time stay to scale. */
export function dailySeries(points: { date: string; position: number | null }[], from: string, to: string): ChartPoint[] {
  const byDate = new Map(points.map((p) => [p.date, p.position]));
  const series: ChartPoint[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const position = byDate.get(date);
    series.push({
      date,
      position: position ?? null,
      state: position != null ? "ranked" : byDate.has(date) ? "out" : "none",
    });
  }
  return series;
}

/** Round ticks from #1 down to `worst`: 1, 5, 10… or 1, 10, 20… */
export function positionTicks(worst: number): number[] {
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => worst / s <= 6) ?? 100;
  const ticks = [1];
  for (let t = step; t <= worst; t += step) if (t > 1) ticks.push(t);
  return ticks;
}

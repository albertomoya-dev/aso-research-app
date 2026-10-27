"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Series = { id: string; title: string; own: boolean };
type Point = Record<string, number | string>;

const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

export function ShareChart({ series, points }: { series: Series[]; points: Point[] }) {
  const max = Math.max(10, ...points.flatMap((p) => series.map((s) => Number(p[s.id]) || 0)));
  const step = max > 50 ? 20 : 10;
  const top = Math.min(100, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-ink-soft" aria-label="Leyenda">
        {series.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[i] }} />
            <span className={s.own ? "font-semibold text-ink" : ""}>{s.title}</span>
          </li>
        ))}
      </ul>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => day.format(date(d))}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--line-strong)" }}
              minTickGap={32}
            />
            <YAxis
              domain={[0, top]}
              ticks={ticks}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)" }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-line-strong bg-surface-muted px-3 py-2 text-sm">
                    <div className="mb-1 text-xs text-muted">{day.format(date(String(p.date)))}</div>
                    {series
                      .map((s, i) => ({ s, i, v: Number(p[s.id]) || 0 }))
                      .sort((a, b) => b.v - a.v)
                      .map(({ s, i, v }) => (
                        <div key={s.id} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                            <span className={`max-w-[180px] truncate ${s.own ? "font-semibold" : ""}`}>{s.title}</span>
                          </span>
                          <span className="font-mono">{v.toLocaleString("es-ES")}%</span>
                        </div>
                      ))}
                  </div>
                );
              }}
            />
            {series.map((s, i) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.title}
                stroke={SERIES_COLORS[i]}
                strokeWidth={s.own ? 2.5 : 2}
                dot={points.length === 1 ? { r: 4, fill: SERIES_COLORS[i], stroke: "var(--surface)", strokeWidth: 2 } : false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

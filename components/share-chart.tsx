"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { chartSeries, OTHERS_ID, seriesColor, type SharePoint, type ShareSeries, shareChartKind } from "@/lib/competitor-view";

// Visibility share of Competidores (phase 31): stacked areas of your app (--series-own, at the bottom), the
// four strongest competitors and «Otros», which add up to 100 %. With a single day of data, horizontal bars.

const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

export function ShareChart({ series: input, points: raw }: { series: ShareSeries[]; points: SharePoint[] }) {
  const { series, points } = chartSeries(input, raw);
  const colors = series.map((s, i) => seriesColor(s, i));
  const kind = shareChartKind(points);
  const last = points.at(-1);
  const own = series.find((s) => s.own);
  const summary = last && own ? `Tu cuota de visibilidad el ${day.format(date(String(last.date)))}: ${pct(Number(last[own.id]) || 0)}.` : "Sin datos.";

  if (kind === "bars") {
    const rows = series.map((s, i) => ({ s, color: colors[i], v: last ? Number(last[s.id]) || 0 : 0 })).filter((r) => r.v > 0 || r.s.own);
    return (
      <figure className="flex flex-col gap-2" aria-label="Cuota de visibilidad por app">
        <ul className="flex flex-col gap-2">
          {rows.map(({ s, color, v }) => (
            <li key={s.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-table">
              <span className={cn("truncate", s.own ? "font-semibold text-ink" : "text-ink-soft")}>{s.own ? `${s.title} (tu app)` : s.title}</span>
              <span className="h-3 rounded-full bg-surface-muted" aria-hidden="true">
                <span className="block h-3 rounded-full" style={{ width: `${Math.min(100, v)}%`, background: color }} />
              </span>
              <span className="text-right tabular-nums">{pct(v)}</span>
            </li>
          ))}
        </ul>
        <figcaption className="text-label text-muted">
          {last ? `Solo hay datos del ${day.format(date(String(last.date)))}: el gráfico de evolución aparece con el segundo día.` : "Sin datos."}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="sr-only">{summary}</figcaption>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-ink-soft" aria-label="Leyenda">
        {series.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: colors[i] }} />
            <span className={s.own ? "font-semibold text-ink" : ""}>{s.own ? `${s.title} (tu app)` : s.title}</span>
          </li>
        ))}
      </ul>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
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
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)" }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as SharePoint | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-control border border-line bg-surface px-3 py-2 text-sm shadow-float">
                    <div className="mb-1 text-xs text-muted">{day.format(date(String(p.date)))}</div>
                    {series
                      .map((s, i) => ({ s, i, v: Number(p[s.id]) || 0 }))
                      .sort((a, b) => (a.s.id === OTHERS_ID ? 1 : b.s.id === OTHERS_ID ? -1 : b.v - a.v))
                      .map(({ s, i, v }) => (
                        <div key={s.id} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: colors[i] }} />
                            <span className={cn("max-w-[180px] truncate", s.own && "font-semibold")}>{s.title}</span>
                          </span>
                          <span className="tabular-nums">{pct(v)}</span>
                        </div>
                      ))}
                  </div>
                );
              }}
            />
            {series.map((s, i) => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.title}
                stackId="share"
                stroke="var(--surface)"
                strokeWidth={1}
                fill={colors[i]}
                fillOpacity={s.id === OTHERS_ID ? 0.25 : s.own ? 0.9 : 0.7}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { positionTicks, type ChartPoint } from "@/lib/chart-data";

const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
const fmt = (iso: string, f = day) => f.format(new Date(`${iso}T00:00:00Z`));

type Marker = { date: string; index: number };

const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);

export function RankChart({ data, markers, depth }: { data: ChartPoint[]; markers: Marker[]; depth: number }) {
  // Days without a check are left out so the line joins across them; days outside the
  // results stay as null and break the line. A numeric time axis keeps the spacing true.
  const points = data.filter((d) => d.state !== "none").map((d) => ({ ...d, time: toTime(d.date) }));
  const known = points.filter((d) => d.position != null).map((d) => d.position!);
  // Position 1 at the top; leave headroom below the worst position seen.
  const worst = Math.min(depth, Math.max(10, Math.ceil((Math.max(...known, 1) * 1.15) / 5) * 5));
  const ticks = positionTicks(worst);
  const domain = [toTime(data[0].date), toTime(data.at(-1)!.date)];
  // A day with no ranked neighbour would be invisible as a line, so it gets a dot.
  const isolated = new Set(
    points.filter((p, i) => p.position != null && points[i - 1]?.position == null && points[i + 1]?.position == null).map((p) => p.time),
  );

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 24, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={domain}
            tickFormatter={(t: number) => fmt(toIso(t))}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--line-strong)" }}
            minTickGap={32}
          />
          <YAxis
            reversed
            domain={[1, worst]}
            ticks={ticks}
            allowDecimals={false}
            tickFormatter={(v: number) => `#${v}`}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          {markers.map((m) => (
            <ReferenceLine
              key={`${m.date}-${m.index}`}
              x={toTime(m.date)}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={{ value: String(m.index), position: "top", fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}
            />
          ))}
          <Tooltip content={<RankTooltip data={points} />} cursor={{ stroke: "var(--line-strong)" }} />
          <Line
            type="linear"
            dataKey="position"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: { time: number }; index?: number }) =>
              props.payload && isolated.has(props.payload.time) ? (
                <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipProps = { active?: boolean; label?: string | number; data: (ChartPoint & { time: number })[] };

function RankTooltip({ active, label, data }: TooltipProps) {
  if (!active || typeof label !== "number") return null;
  const i = data.findIndex((d) => d.time === label);
  const point = data[i];
  if (!point) return null;
  const previous = data
    .slice(0, i)
    .reverse()
    .find((d) => d.position != null);
  const change = point.position != null && previous?.position != null ? previous.position - point.position : null;

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-md">
      <div className="text-xs text-muted">{fmt(point.date, fullDay)}</div>
      <div className="mt-0.5 font-mono text-base font-semibold">
        {point.position != null ? `#${point.position}` : "Fuera de los resultados"}
      </div>
      {change != null && change !== 0 && (
        <div className={`font-mono text-xs ${change > 0 ? "text-up" : "text-down"}`}>
          {change > 0 ? "▲" : "▼"} {Math.abs(change)} desde el último dato
        </div>
      )}
    </div>
  );
}

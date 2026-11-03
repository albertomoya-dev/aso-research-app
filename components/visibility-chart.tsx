"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// The Resumen's visibility chart: your share of the TOP 5 per day (--series-own) with the changes of
// Cambios as vertical markers; hovering a day shows the changes since the previous point and their
// impact over 14 days.

export type VisibilityMarker = { id: number; date: string; title: string; impact: string };

const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fmt = (time: number, f = day) => f.format(new Date(time));
const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

export function VisibilityChart({ points, markers, from, to, label }: { points: { date: string; share: number }[]; markers: VisibilityMarker[]; from: string; to: string; label: string }) {
  const data = points.map((p) => ({ time: toTime(p.date), share: p.share }));
  const max = Math.max(5, ...data.map((d) => d.share));
  const step = max > 50 ? 20 : max > 20 ? 10 : 5;
  const top = Math.min(100, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const marks = markers.map((m) => ({ ...m, time: toTime(m.date) }));

  return (
    <div className="h-64 w-full" data-testid="visibility-chart">
      <p className="sr-only">{label}</p>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="visibility-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-own)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--series-own)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={[toTime(from), toTime(to)]}
            tickFormatter={(t: number) => fmt(t)}
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
          {marks.map((m) => (
            <ReferenceLine
              key={m.id}
              x={m.time}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={<MarkerLabel title={`${fmt(m.time)} · ${m.title}`} />}
            />
          ))}
          <Tooltip content={<VisibilityTooltip data={data} markers={marks} />} cursor={{ stroke: "var(--line-strong)" }} />
          <Area
            type="monotone"
            dataKey="share"
            stroke="var(--series-own)"
            strokeWidth={2}
            fill="url(#visibility-fill)"
            dot={data.length === 1 ? { r: 4, fill: "var(--series-own)", stroke: "var(--surface)", strokeWidth: 2 } : false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A small flag at the top of the marker line; its name is the change, for pointers and the e2e test. */
function MarkerLabel({ viewBox, title }: { viewBox?: { x?: number; y?: number }; title: string }) {
  const x = viewBox?.x ?? 0;
  const y = (viewBox?.y ?? 0) - 10;
  return (
    <g data-testid="annotation-marker">
      <title>{title}</title>
      <circle cx={x} cy={y} r={6} fill="var(--surface)" stroke="var(--ink-soft)" strokeWidth={1.5} />
      <circle cx={x} cy={y} r={2} fill="var(--ink-soft)" />
    </g>
  );
}

type Mark = VisibilityMarker & { time: number };

function VisibilityTooltip({ active, label, data, markers }: { active?: boolean; label?: string | number; data: { time: number; share: number }[]; markers: Mark[] }) {
  if (!active || typeof label !== "number") return null;
  const i = data.findIndex((d) => d.time === label);
  const point = data[i];
  if (!point) return null;
  // The changes since the previous point (days without a check have no point of their own).
  const prev = i > 0 ? data[i - 1].time : -Infinity;
  const here = markers.filter((m) => m.time > prev && m.time <= point.time);
  return (
    <div className="max-w-72 rounded-control border border-line bg-surface px-3 py-2 text-[13px] shadow-float">
      <div className="text-label text-muted">{fmt(point.time, fullDay)}</div>
      <div className="font-mono text-base font-semibold text-ink">{pct(point.share)}</div>
      {here.map((m) => (
        <div key={m.id} className="mt-1.5 border-t border-line pt-1.5">
          <div className="font-medium text-ink">{m.title}</div>
          <div className="text-ink-soft">{m.impact}</div>
        </div>
      ))}
    </div>
  );
}

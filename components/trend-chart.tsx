"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/trends";

const month = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" });
const week = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function TrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => month.format(date(d))}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--line-strong)" }}
            minTickGap={28}
          />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-md">
                  <div className="text-xs text-muted">Semana del {week.format(date(p.date))}</div>
                  <div className="font-mono text-base font-semibold">{p.value}</div>
                </div>
              );
            }}
          />
          <Line type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

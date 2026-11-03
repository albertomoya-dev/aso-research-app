import { cn } from "@/lib/cn";

export type SparklineProps = {
  /** Oldest first. null leaves a gap (a day without data). */
  values: (number | null)[];
  /** Rankings: a lower number is better, so it is drawn higher. */
  invert?: boolean;
  width?: number;
  height?: number;
  /** Text for screen readers: "Cuota de 12 % a 18 % en 30 días". */
  label: string;
  className?: string;
};

/** Small trend line for KPI cards and table rows, in the colour of your app (--series-own). */
export function Sparkline({ values, invert = false, width = 96, height = 28, label, className }: SparklineProps) {
  const known = values.filter((v): v is number => v != null);
  if (known.length === 0) return <span className="text-label text-muted">Sin histórico</span>;
  const pad = 3;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const x = (i: number) => pad + (values.length === 1 ? (width - 2 * pad) / 2 : (i * (width - 2 * pad)) / (values.length - 1));
  const y = (v: number) => {
    const t = (v - min) / span;
    return pad + (invert ? t : 1 - t) * (height - 2 * pad);
  };
  const segments: string[][] = [[]];
  values.forEach((v, i) => {
    if (v == null) segments.push([]);
    else segments.at(-1)!.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={cn("overflow-visible", className)}>
      {segments
        .filter((s) => s.length > 1)
        .map((s, i) => (
          <polyline key={i} points={s.join(" ")} fill="none" stroke="var(--series-own)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      {segments
        .filter((s) => s.length === 1)
        .map((s, i) => {
          const [cx, cy] = s[0].split(",");
          return <circle key={`d${i}`} cx={cx} cy={cy} r={1.75} fill="var(--series-own)" />;
        })}
    </svg>
  );
}

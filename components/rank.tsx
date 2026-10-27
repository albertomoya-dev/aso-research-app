import type { HistoryPoint } from "@/lib/queries";

/** "#4", or "> 200" when the app is outside the fetched results. */
export function Position({ position, depth, checked = true }: { position: number | null; depth: number | null; checked?: boolean }) {
  if (!checked) return <span className="text-muted">Sin datos</span>;
  if (position == null) {
    const shown = depth ?? 200;
    return (
      <span
        className="cursor-help text-muted underline decoration-dotted underline-offset-4"
        title={`No aparece entre los ${shown} resultados que devuelve la tienda para esta búsqueda`}
      >
        &gt; {shown}
      </span>
    );
  }
  return <span>#{position}</span>;
}

/** Arrow, sign and color, so the direction never depends on color alone. */
export function PositionChange({ change, className = "" }: { change: number | null; className?: string }) {
  if (change == null || change === 0) {
    return (
      <span className={`font-mono text-muted ${className}`} aria-label="Sin cambio">
        –
      </span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={`font-mono font-medium ${up ? "text-up" : "text-down"} ${className}`}
      aria-label={`${up ? "Sube" : "Baja"} ${Math.abs(change)} ${Math.abs(change) === 1 ? "posición" : "posiciones"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(change)}
    </span>
  );
}

/** 30-day position line. Position 1 is at the top; days outside the results leave a gap. */
export function Sparkline({ points, width = 110, height = 32 }: { points: HistoryPoint[]; width?: number; height?: number }) {
  const known = points.filter((p) => p.position != null).map((p) => p.position!);
  if (known.length === 0) return <span className="text-xs text-muted">Sin histórico</span>;

  const pad = 4;
  const max = Math.max(...known, 10);
  const x = (i: number) => pad + (points.length === 1 ? (width - 2 * pad) / 2 : (i * (width - 2 * pad)) / (points.length - 1));
  const y = (pos: number) => pad + ((pos - 1) / (max - 1)) * (height - 2 * pad);

  const segments: string[][] = [[]];
  points.forEach((p, i) => {
    if (p.position == null) segments.push([]);
    else segments.at(-1)!.push(`${x(i).toFixed(1)},${y(p.position).toFixed(1)}`);
  });
  const first = known[0];
  const last = known.at(-1)!;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Posición de #${first} a #${last} en ${points.length} días`}>
      {segments
        .filter((s) => s.length > 1)
        .map((s, i) => (
          <polyline key={i} points={s.join(" ")} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      {segments
        .filter((s) => s.length === 1)
        .map((s, i) => {
          const [cx, cy] = s[0].split(",");
          return <circle key={`d${i}`} cx={cx} cy={cy} r={2} fill="var(--brand)" />;
        })}
    </svg>
  );
}

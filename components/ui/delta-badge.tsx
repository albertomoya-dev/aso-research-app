import { cn } from "@/lib/cn";

export type DeltaBadgeProps = {
  /** Positive = better. For rankings pass `previous - current` (moving from #9 to #6 is +3). */
  delta?: number | null;
  /** Entered or left the ranking: shown as a word instead of a number. */
  status?: "entered" | "left";
  /** Appended to the number: "%", " pp"… */
  unit?: string;
  /** What the number counts, for screen readers: "posiciones", "puntos"… */
  noun?: string;
  className?: string;
};

/**
 * ▲3 / ▼2 / = / Entra / Sale. The direction is always written with a symbol or a word, never with
 * colour alone (DESIGN.md).
 */
export function DeltaBadge({ delta, status, unit = "", noun = "posiciones", className }: DeltaBadgeProps) {
  const base = "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-mono text-label font-medium whitespace-nowrap";
  if (status === "entered") {
    return <span className={cn(base, "bg-android-bg text-android-fg", className)}>Entra</span>;
  }
  if (status === "left") {
    return <span className={cn(base, "bg-danger-soft text-danger", className)}>Sale</span>;
  }
  if (delta == null || delta === 0) {
    return (
      <span className={cn(base, "bg-surface-muted text-muted", className)} aria-label="Sin cambio">
        =
      </span>
    );
  }
  const up = delta > 0;
  const size = Math.abs(delta);
  return (
    <span className={cn(base, up ? "text-up" : "text-down", className)} aria-label={`${up ? "Sube" : "Baja"} ${size}${unit} ${noun}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {size}
      {unit}
    </span>
  );
}

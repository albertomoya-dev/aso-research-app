import { cn } from "@/lib/cn";
import { DeltaBadge, type DeltaBadgeProps } from "./delta-badge";
import { Sparkline, type SparklineProps } from "./sparkline";

export type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  /** Change against the previous period. */
  delta?: DeltaBadgeProps;
  /** One line under the number: "frente a la semana pasada". */
  hint?: React.ReactNode;
  sparkline?: SparklineProps;
  /** A HelpTip next to the label. */
  help?: React.ReactNode;
  className?: string;
};

/** Label, big number, its change and an optional trend line. Use 3 or 4 in a row at the top of a screen. */
export function KpiCard({ label, value, delta, hint, sparkline, help, className }: KpiCardProps) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-1.5 rounded-card border border-line bg-surface p-4", className)}>
      <div className="flex items-center gap-1 text-label font-medium text-ink-soft">
        <h3 className="truncate">{label}</h3>
        {help}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-kpi font-semibold tracking-[-0.02em] text-ink">{value}</span>
          {delta && <DeltaBadge {...delta} />}
        </div>
        {sparkline && <Sparkline {...sparkline} />}
      </div>
      {hint && <p className="text-label text-muted">{hint}</p>}
    </section>
  );
}

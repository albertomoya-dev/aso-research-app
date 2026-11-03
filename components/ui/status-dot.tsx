import { cn } from "@/lib/cn";

export type Status = "good" | "warn" | "bad" | "unknown";

const STATUS: Record<Status, { label: string; dot: string }> = {
  good: { label: "Bien", dot: "bg-up" },
  warn: { label: "Mejorable", dot: "bg-warn-fg" },
  bad: { label: "Necesita atención", dot: "bg-danger" },
  unknown: { label: "Sin datos", dot: "bg-line-strong" },
};

/** The ASO health colours, always with their text next to them (the colour alone says nothing). */
export function StatusDot({ status, label, className }: { status: Status; label?: React.ReactNode; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-ink-soft", className)}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", s.dot)} />
      {label ?? s.label}
    </span>
  );
}

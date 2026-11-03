import { cn } from "@/lib/cn";

// Loading placeholders with the shape of the real content (DESIGN.md: never a lone spinner).

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" style={style} className={cn("animate-pulse rounded-control bg-surface-muted", className)} />;
}

/** Lines of text; the last one is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

/** A KpiCard: label, big number, trend line. */
export function SkeletonKpi({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4", className)}>
      <Skeleton className="h-3 w-24" />
      <div className="flex items-end justify-between">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-7 w-24" />
      </div>
    </div>
  );
}

/** A table: header and rows of the real height (44 px). */
export function SkeletonTable({ rows = 6, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-card border border-line bg-surface", className)}>
      <div className="flex h-9 items-center gap-4 border-b border-line bg-surface-muted px-4">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className={cn("h-2.5 bg-line", i === 0 ? "w-32" : "w-14")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-11 items-center gap-4 border-b border-line px-4 last:border-0">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className={cn("h-3", i === 0 ? "w-40" : "w-12")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A chart card. */
export function SkeletonChart({ height = 220, className }: { height?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-card border border-line bg-surface p-4", className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

import { cn } from "@/lib/cn";

export type RankBadgeProps = {
  /** Position in the results, or null when the app is outside them. */
  position: number | null;
  /** How many results the store returned (30 on Google Play, up to 200 on the App Store). */
  depth?: number;
  /** Close to the TOP 10 and worth working on: drawn with a brand border. */
  reachable?: boolean;
  className?: string;
};

/** "#14", "> 30" in grey when outside the results, and a brand border when it is within reach. */
export function RankBadge({ position, depth = 30, reachable = false, className }: RankBadgeProps) {
  const outside = position == null;
  return (
    <span
      className={cn(
        "inline-flex min-w-11 items-center justify-center gap-1 rounded-full border px-2 py-px font-mono text-[13px] font-medium whitespace-nowrap",
        outside ? "border-transparent bg-surface-muted text-muted" : "border-line bg-surface text-ink",
        reachable && "border-brand text-brand-strong",
        className,
      )}
    >
      {outside ? (
        <span aria-label={`Fuera de los ${depth} primeros resultados`}>&gt;{depth}</span>
      ) : (
        <span aria-label={`Posición ${position}`}>#{position}</span>
      )}
      {reachable && <span className="sr-only">, al alcance</span>}
    </span>
  );
}

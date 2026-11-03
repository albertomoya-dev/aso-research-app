import Link from "next/link";
import { cn } from "@/lib/cn";
import { marketPath, type MarketRef } from "@/lib/market-path";

const SOURCES = [
  { id: "descubrir", label: "Autocompletado" },
  { id: "ideas", label: "Ideas con IA" },
  { id: "top10", label: "TOP 10" },
] as const;

/**
 * The three sources of Keywords › Encontrar, until phase 29 merges them into one screen. Plain links
 * (each source is still its own page), styled as a segmented control.
 */
export function FindTabs({ market, active }: { market: MarketRef; active: (typeof SOURCES)[number]["id"] }) {
  return (
    <nav aria-label="Fuentes de keywords" className="inline-flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-control bg-surface-muted p-0.5">
      {SOURCES.map((s) => (
        <Link
          key={s.id}
          href={marketPath(market, `/${s.id}`)}
          aria-current={s.id === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-[6px] px-3 text-table font-medium whitespace-nowrap md:min-h-7",
            s.id === active ? "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-soft hover:text-ink",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

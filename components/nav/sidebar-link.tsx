"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * One entry of a sidebar. In the sidebars (`collapsible`) the label hides on tablets (640–1024 px),
 * where the bar shows icons only; it stays for screen readers and as the tooltip.
 */
export function SidebarLink({
  href,
  active,
  icon,
  label,
  badge,
  collapsible = false,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  collapsible?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsible ? label : undefined}
      onClick={onNavigate}
      className={cn(
        "relative flex min-h-11 shrink-0 items-center gap-2.5 rounded-control px-2.5 text-table whitespace-nowrap md:min-h-8",
        collapsible && "sm:max-lg:justify-center sm:max-lg:px-0",
        active ? "bg-surface-muted font-medium text-ink" : "text-ink-soft hover:bg-surface-muted hover:text-ink",
      )}
    >
      <span className={active ? "text-ink" : "text-muted"}>{icon}</span>
      <span className={cn("min-w-0 truncate", collapsible && "sm:max-lg:sr-only")}>{label}</span>
      {badge && <span className={cn("ml-auto", collapsible && "sm:max-lg:absolute sm:max-lg:top-0.5 sm:max-lg:right-0.5")}>{badge}</span>}
    </Link>
  );
}

/** A count next to an entry («38»). `tone="brand"` for what is unread. */
export function NavCount({ value, label, tone = "neutral" }: { value: number; label: string; tone?: "neutral" | "brand" }) {
  if (value <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] leading-5 font-semibold",
        tone === "brand" ? "bg-brand text-on-brand" : "bg-surface-muted text-ink-soft",
      )}
    >
      <span className="sr-only">{label}: </span>
      {value > 99 ? "99+" : value}
    </span>
  );
}

"use client";

import { CircleHelp } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export type HelpTipProps = {
  /** What it explains, for the button's name: "Ayuda sobre «Cuota de visibilidad»". */
  label: string;
  children: React.ReactNode;
  /** Opens above (default) or below the icon. */
  side?: "top" | "bottom";
  className?: string;
};

/**
 * The «?» next to a title or column header. Opens on hover and keyboard focus, toggles with a tap on
 * touch screens, closes with Escape or on blur, and is always read through aria-describedby
 * (the pattern of components/out-of-results.tsx).
 */
export function HelpTip({ label, children, side = "top", className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span data-help-tip className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={`Ayuda sobre «${label}»`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="peer inline-flex size-6 cursor-help items-center justify-center rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
      >
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "absolute left-1/2 z-40 w-64 -translate-x-1/2 rounded-control bg-ink px-2.5 py-1.5 text-left text-xs font-normal tracking-normal text-surface normal-case shadow-float peer-hover:block peer-focus-visible:block",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          open ? "block" : "hidden",
        )}
      >
        {children}
      </span>
    </span>
  );
}

"use client";

import { useId, useState } from "react";

/**
 * "> 30" with its meaning: shown on hover and keyboard focus, toggled with a tap on touch
 * screens, and always read by screen readers through aria-describedby.
 */
export function OutOfResults({ depth }: { depth: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="peer cursor-help rounded-sm text-muted underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand/50"
      >
        &gt; {depth}
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute bottom-full left-0 z-20 mb-1.5 w-56 rounded-md border border-line-strong bg-surface-muted px-2.5 py-1.5 font-sans text-xs font-normal text-ink peer-hover:block peer-focus-visible:block ${
          open ? "block" : "hidden"
        }`}
      >
        Fuera de los {depth} resultados que devuelve la tienda para esta búsqueda
      </span>
    </span>
  );
}

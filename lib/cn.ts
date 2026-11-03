import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Our type-scale utilities (text-label, text-kpi…) are font sizes, not colours: without this,
// tailwind-merge would drop `text-ink` when it meets `text-label`, or the other way round.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["label", "table", "body", "card-title", "page-title", "kpi", "kpi-lg"] }],
      shadow: [{ shadow: ["float"] }],
      rounded: [{ rounded: ["card", "control"] }],
    },
  },
});

/** Joins class names and lets later Tailwind utilities override earlier ones (shadcn's `cn`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

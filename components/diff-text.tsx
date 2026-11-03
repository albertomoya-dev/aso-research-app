import { cn } from "@/lib/cn";
import { wordDiff } from "@/lib/word-diff";

/**
 * Two texts as one, word by word: removed words crossed out in red, added ones in green. <del> and <ins>
 * carry the meaning for screen readers, and the strike-through and underline make it more than a colour.
 */
export function DiffText({
  before,
  after,
  className,
  scrollLabel,
}: {
  before: string;
  after: string;
  className?: string;
  /** When the box scrolls (a long description), its name: it then takes keyboard focus so it can be scrolled without a mouse. */
  scrollLabel?: string;
}) {
  const parts = wordDiff(before, after);
  if (parts.length === 0) return <p className={cn("text-muted", className)}>(vacío)</p>;
  const scroll = scrollLabel ? { tabIndex: 0, role: "region", "aria-label": scrollLabel } : {};
  return (
    <p {...scroll} className={cn("break-words whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-brand", className)}>
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "removed" ? (
          <del key={i} className="rounded-[3px] bg-danger-soft text-danger decoration-danger">
            {p.text}
          </del>
        ) : (
          <ins key={i} className="rounded-[3px] bg-up/15 text-ink decoration-up underline-offset-2">
            {p.text}
          </ins>
        ),
      )}
    </p>
  );
}

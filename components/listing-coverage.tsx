"use client";

import type { Coverage, FieldKey, FieldSpec } from "@/lib/metadata-check";
import { cn } from "@/lib/cn";

type Group = { id: string; title: string; items: Coverage[] };

/**
 * Keywords grouped by where they are: one group per indexed field holding the exact phrase (the
 * strongest one), «Solo palabras sueltas» when every word is there but not together, and «Falta».
 */
export function coverageGroups(coverage: Coverage[], indexed: FieldSpec[]): Group[] {
  const fields: Group[] = indexed.map((f) => ({ id: f.key, title: `En ${f.label.toLowerCase()}`, items: coverage.filter((c) => c.exactIn === f.key) }));
  return [
    ...fields,
    { id: "partial", title: "Solo palabras sueltas", items: coverage.filter((c) => !c.exactIn && c.covered) },
    { id: "missing", title: "Falta", items: coverage.filter((c) => !c.covered) },
  ].filter((g) => g.items.length > 0);
}

type Props = {
  coverage: Coverage[];
  indexed: FieldSpec[];
  /** The keyword highlighted in the editor, if any. */
  focus: string | null;
  onFocus: (term: string | null, field: FieldKey | null) => void;
};

/** The «Cobertura» tab: pressing a keyword highlights it in the editor and brings the field into view. */
export function CoverageList({ coverage, indexed, focus, onFocus }: Props) {
  const groups = coverageGroups(coverage, indexed);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.id} role="group" aria-labelledby={`coverage-${g.id}`}>
          <h3 id={`coverage-${g.id}`} className="text-label font-medium tracking-wide text-muted uppercase">
            {g.title} <span className="font-mono">({g.items.length})</span>
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {g.items.map((c) => {
              const active = focus === c.term;
              return (
                <li key={c.term}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onFocus(active ? null : c.term, c.exactIn ?? c.inFields[0] ?? null)}
                    title={c.missing.length > 0 ? `Falta: ${c.missing.join(", ")}` : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-table focus-visible:outline-2 focus-visible:outline-brand md:min-h-7",
                      active ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-ink hover:bg-surface-muted",
                      g.id === "missing" && !active && "text-ink-soft",
                    )}
                  >
                    {c.term}
                    {c.descriptionCount != null && c.descriptionCount > 0 && <span className="font-mono text-label">{c.descriptionCount}×</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { importantLosses, isRegression, type ListingProposal } from "@/lib/listing-optimizer";
import { charCount, checkMetadata, FIELDS, type FieldKey, keywordDiff, type MetadataDraft, type ScoredKeyword, weightedCoverage } from "@/lib/metadata-check";
import type { PolicyContext } from "@/lib/policy-check";
import type { Store } from "@/lib/stores/types";
import { DiffText } from "./diff-text";
import { IssueList, KeywordDiffView } from "./listing-issues";
import { Button } from "./ui/button";

type Props = {
  store: Store;
  /** What is in the editor now: the diff and the score compare against it, not against the text sent. */
  draft: MetadataDraft;
  proposal: ListingProposal;
  model?: string;
  /** Every tracked keyword (coverage count) and the relevant ones with their opportunity (weighted score). */
  terms: string[];
  scoring: ScoredKeyword[];
  policy: PolicyContext;
  /** Fields of this proposal already accepted or discarded. */
  done: FieldKey[];
  onAccept: (keys: FieldKey[]) => void;
  onDiscard: (keys: FieldKey[]) => void;
};

/** Fields of the proposal that still differ from the editor and have not been handled. */
export function pendingFields(store: Store, draft: MetadataDraft, proposal: ListingProposal, done: FieldKey[]): FieldKey[] {
  return FIELDS[store].map((f) => f.key).filter((k) => proposal.fields[k] != null && proposal.fields[k] !== draft[k] && !done.includes(k));
}

/**
 * The AI proposal above the editor, as a word diff per field against the current text, with
 * «Aceptar campo» on each one and «Aceptar todo» / «Descartar» for the rest. The quality lock is
 * recomputed live (same pure functions as the server) on what accepting the pending fields would give.
 */
export function ListingProposalPanel({ store, draft, proposal, model, terms, scoring, policy, done, onAccept, onDiscard }: Props) {
  const pending = useMemo(() => pendingFields(store, draft, proposal, done), [store, draft, proposal, done]);
  const specs = FIELDS[store];
  const labels = Object.fromEntries(specs.map((f) => [f.key, f.label])) as Record<FieldKey, string>;
  const proposedDraft = useMemo(
    () => ({ ...draft, ...Object.fromEntries(pending.map((k) => [k, proposal.fields[k]])) }) as MetadataDraft,
    [draft, proposal, pending],
  );
  const current = useMemo(() => weightedCoverage(store, draft, scoring), [store, draft, scoring]);
  const proposedWeighted = useMemo(() => weightedCoverage(store, proposedDraft, scoring), [store, proposedDraft, scoring]);
  const proposed = useMemo(() => checkMetadata(store, proposedDraft, terms, policy), [store, proposedDraft, terms, policy]);
  const coveredNow = useMemo(() => checkMetadata(store, draft, terms, policy).coverage.filter((c) => c.covered).length, [store, draft, terms, policy]);

  if (pending.length === 0 && proposal.notes.length === 0 && !proposal.warnings?.length) return null;

  const diff = keywordDiff(current, proposedWeighted);
  const lostImportant = importantLosses(diff);
  const scoreDropped = proposedWeighted.score < current.score;
  // Same rule as the server (lower score or an important keyword lost); its verdict on the whole proposal also counts.
  const regressed = Boolean(proposal.regression) || isRegression(current.score, proposedWeighted.score, diff);
  const drop: [number, number] | null = scoreDropped
    ? [current.score, proposedWeighted.score]
    : proposal.scoreBefore != null && proposal.scoreAfter != null && proposal.scoreAfter < proposal.scoreBefore
      ? [proposal.scoreBefore, proposal.scoreAfter]
      : null;
  const lostShown = lostImportant.length > 0 ? lostImportant : proposal.diff ? importantLosses(proposal.diff) : [];

  return (
    <section aria-label="Propuesta de la IA" className="flex flex-col gap-4 rounded-card border border-brand/40 bg-surface px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-card-title font-semibold">
          <Sparkles size={16} aria-hidden="true" className="text-brand" />
          Propuesta de la IA
        </h2>
        {scoring.length > 0 && (
          <p className="text-table text-ink-soft">
            Cobertura ponderada {current.score} →{" "}
            <span className={`font-mono font-semibold ${scoreDropped ? "text-down" : proposedWeighted.score > current.score ? "text-up" : "text-ink"}`}>
              {proposedWeighted.score}
            </span>{" "}
            de 100 · cubiertas {coveredNow} → {proposed.coverage.filter((c) => c.covered).length} de {terms.length}
          </p>
        )}
      </div>

      {regressed && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          Esta propuesta cubre peor tus keywords que el texto actual{drop ? ` (${drop[0]} → ${drop[1]})` : ""}.
          {lostShown.length > 0 ? ` Deja de cubrir keywords importantes: ${lostShown.slice(0, 5).map((l) => l.term).join(", ")}.` : ""}
          {proposal.attempts === 2 ? " La IA lo intentó dos veces y esta es la mejor de las dos." : ""} Acepta solo los campos que te convenzan.
        </p>
      )}
      {proposal.warnings?.map((w) => (
        <p key={w} role="note" className="rounded-control bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {w}
        </p>
      ))}

      {pending.map((key) => {
        const spec = specs.find((f) => f.key === key)!;
        const text = proposal.fields[key] ?? "";
        const length = charCount(text);
        const why = proposal.changes.find((c) => c.field === key)?.why;
        return (
          <div key={key} data-field={key} className="flex flex-col gap-1.5 border-t border-line pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-table font-medium text-ink-soft">{spec.label}</h3>
              <span className={`font-mono text-label ${length > spec.limit ? "font-semibold text-danger" : "text-muted"}`}>
                {length}/{spec.limit}
                {length > spec.limit && " · se pasa del límite"}
              </span>
            </div>
            <DiffText
              before={draft[key]}
              after={text}
              scrollLabel={spec.multiline ? `Cambios propuestos en ${spec.label.toLowerCase()}` : undefined}
              className={`text-ink ${spec.multiline ? "max-h-72 overflow-y-auto text-sm leading-relaxed" : "text-body"}`}
            />
            {why && <p className="text-label text-muted">{why}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => onAccept([key])} aria-label={`Aceptar campo: ${spec.label}`}>
                Aceptar campo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDiscard([key])} aria-label={`Descartar campo: ${spec.label}`}>
                Descartar
              </Button>
            </div>
          </div>
        );
      })}

      <KeywordDiffView diff={diff} labels={labels} />

      {proposal.targetKeywords.length > 0 && (
        <div>
          <h3 className="text-label font-medium tracking-wide text-muted uppercase">Construida alrededor de</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {proposal.targetKeywords.map((k) => (
              <li key={k} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-label text-ink-soft">
                {k}
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposal.notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-soft">
          {proposal.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {proposed.issues.length > 0 && pending.length > 0 && (
        <div>
          <h3 className="text-label font-medium tracking-wide text-muted uppercase">Avisos si lo aceptas todo</h3>
          <IssueList issues={proposed.issues} compact />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {pending.length > 0 && (
          <>
            <Button variant="secondary" onClick={() => onAccept(pending)}>
              Aceptar todo ({pending.length})
            </Button>
            <Button variant="ghost" onClick={() => onDiscard(pending)}>
              Descartar
            </Button>
          </>
        )}
        <span className="text-label text-muted">
          Generado por IA{model ? ` (${model})` : ""}. Se aplica al editor; guarda el borrador para conservarlo.
        </span>
      </div>
    </section>
  );
}

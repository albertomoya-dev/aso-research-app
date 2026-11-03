"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type CandidateItem, dismissCandidates, followCandidates, measureCandidates } from "@/app/candidate-actions";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { type Candidate, CANDIDATE_SOURCE_LABEL, candidatePopularity, candidatesCsv, MAX_MEASURE } from "@/lib/candidates";
import { downloadCsv } from "@/lib/download";
import { normalizeKeyword } from "@/lib/keywords";
import { LOW_RELEVANCE, preselect } from "@/lib/relevance";
import { RelevanceDots } from "./relevance-dots";
import { EstimateButton, RelevanceHint, useRelevanceEstimate } from "./relevance-estimate";
import { relevanceNote } from "./relevance-note";

type Props = {
  appId: number;
  candidates: Candidate[];
  /** Store language, for filler words. */
  lang: string;
  /** Shows «Estimar relevancia con IA» when there is an Anthropic key. */
  aiEnabled: boolean;
  /** Greys the seed out at the start of each term («correr» + **por la montaña**). */
  seed?: string;
  /** Shows the source of each row (the pending tray mixes them). */
  showSource?: boolean;
  /** Name of the exported CSV, without extension. */
  fileName: string;
  /** Accessible name of the list. */
  label: string;
};

const toItem = (c: Candidate): CandidateItem => ({
  term: c.term,
  source: c.source,
  suggestionId: c.suggestionId,
  relevance: c.relevance,
  reason: c.reason.slice(0, 500),
});

/**
 * The one candidate list of Encontrar: the same columns, checkbox, «Seguir N», «Descartar», «Medir
 * popularidad» (at most MAX_MEASURE) and «Exportar CSV» whatever the source. Followed and dismissed rows
 * leave the list at once; the server revalidates the page and the sidebar counter.
 */
export function CandidateList({ appId, candidates, lang, aiEnabled, seed = "", showSource = false, fileName, label }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [busy, startTransition] = useTransition();
  const [action, setAction] = useState<"follow" | "dismiss" | "measure" | null>(null);
  const estimate = useRelevanceEstimate(appId);

  const shown = candidates.filter((c) => !gone.has(c.term));
  const ratingOf = (c: Candidate) => c.relevance ?? estimate.ratingOf(c.term);
  const picked = shown.filter((c) => selected.has(c.term));
  // «Seleccionar todas» leaves out filler words and those rated 2 or less; they can still be ticked one by one.
  const picks = shown.filter((c) => preselect(c.term, ratingOf(c) ?? undefined, lang)).map((c) => c.term);
  const allSelected = picks.length > 0 && picks.every((t) => selected.has(t));
  const unrated = shown.filter((c) => c.relevance == null).map((c) => c.term);

  const toggle = (term: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  const drop = (terms: string[]) => {
    setGone((prev) => new Set([...prev, ...terms]));
    setSelected((prev) => new Set([...prev].filter((t) => !terms.includes(t))));
  };
  const run = (kind: "follow" | "dismiss" | "measure", fn: () => Promise<void>) => {
    setAction(kind);
    startTransition(async () => {
      await fn();
      setAction(null);
    });
  };

  const follow = () =>
    run("follow", async () => {
      const result = await followCandidates(appId, picked.map(toItem));
      if (result.error) return void toast.error(result.error);
      drop(picked.map((c) => c.term));
      toast.success(`${result.added === 1 ? "1 añadida" : `${result.added} añadidas`} a tus keywords${result.trackingFailed ? " · su posición se consultará en la próxima actualización" : ""}${relevanceNote(result.relevance)}`);
    });
  const dismiss = (rows: Candidate[]) =>
    run("dismiss", async () => {
      const result = await dismissCandidates(appId, rows.map(toItem));
      if (result.error) return void toast.error(result.error);
      drop(rows.map((c) => c.term));
      toast(result.message);
    });
  const measure = () =>
    run("measure", async () => {
      const result = await measureCandidates(appId, picked.slice(0, MAX_MEASURE).map(toItem));
      setMeasured((prev) => ({ ...prev, ...result.measured }));
      if (result.error) toast.error(result.error);
      else toast.success(`Popularidad medida de ${Object.keys(result.measured).length}`);
    });
  const runEstimate = () =>
    estimate.run(unrated, (rated) =>
      setSelected((prev) => new Set([...prev].filter((t) => !((rated[normalizeKeyword(t)] ?? Infinity) <= LOW_RELEVANCE)))),
    );

  if (shown.length === 0) return null;
  const n = picked.length;
  return (
    <section aria-label={label} className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <label className="flex min-h-11 items-center gap-2.5 text-[13px] text-ink-soft md:min-h-8">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={picks.length === 0}
            onChange={() => setSelected(allSelected ? new Set() : new Set(picks))}
            className="size-5 accent-[var(--brand)] md:size-4"
          />
          {n > 0 ? `${n} de ${shown.length}` : `${shown.length} candidatas`}
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {aiEnabled && unrated.length > 0 && <EstimateButton count={unrated.length} pending={estimate.pending} onClick={runEstimate} />}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadCsv(fileName, candidatesCsv(n > 0 ? picked : shown))}
          >
            Exportar CSV
          </Button>
          {n > 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={measure} disabled={busy || n > MAX_MEASURE} aria-busy={action === "measure"} title={`Mide en la tienda hasta ${MAX_MEASURE} a la vez`}>
                {action === "measure" ? "Midiendo…" : n > MAX_MEASURE ? `Medir (máx. ${MAX_MEASURE})` : "Medir popularidad"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => dismiss(picked)} disabled={busy} aria-busy={action === "dismiss"}>
                {action === "dismiss" ? "Descartando…" : `Descartar ${n}`}
              </Button>
            </>
          )}
          <Button variant="primary" size="sm" onClick={follow} disabled={busy || n === 0} aria-busy={action === "follow"}>
            {action === "follow" ? "Añadiendo…" : n === 0 ? "Seguir" : `Seguir ${n}`}
          </Button>
        </div>
      </div>
      {estimate.error && (
        <p role="alert" className="border-b border-line px-4 py-2 text-[13px] text-danger">
          {estimate.error}
        </p>
      )}
      <div className="hidden grid-cols-[2.5rem_minmax(0,2fr)_7rem_9rem_minmax(0,3fr)] items-center gap-3 border-b border-line bg-surface-muted px-4 py-2 text-label font-medium text-ink-soft md:grid">
        <span className="sr-only">Elegir</span>
        <span>Keyword</span>
        <span>Relevancia</span>
        <span className="inline-flex items-center gap-1">
          Popularidad
          <HelpTip label="Popularidad" side="bottom">
            «Estimada»: sale del autocompletado ya leído (letras escritas y puesto en la lista), sin pedir nada nuevo a la tienda. «Medir
            popularidad» la mide de verdad, letra a letra, hasta {MAX_MEASURE} a la vez.
          </HelpTip>
        </span>
        <span>Por qué</span>
      </div>
      <ul>
        {shown.map((c) => {
          const rating = ratingOf(c);
          const pop = c.term in measured ? { value: measured[c.term], estimated: false } : candidatePopularity(c);
          const id = `cand-${c.source}-${c.term}`;
          return (
            <li
              key={`${c.source}:${c.term}`}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 last:border-0 sm:px-4 md:grid-cols-[2.5rem_minmax(0,2fr)_7rem_9rem_minmax(0,3fr)] md:py-1.5"
            >
              <input
                id={id}
                type="checkbox"
                checked={selected.has(c.term)}
                onChange={() => toggle(c.term)}
                className="size-5 accent-[var(--brand)] md:size-4"
              />
              <label htmlFor={id} className="min-w-0 cursor-pointer text-table">
                {seed && c.term.startsWith(normalizeKeyword(seed)) ? (
                  <>
                    <span className="text-muted">{c.term.slice(0, normalizeKeyword(seed).length)}</span>
                    <span className="font-medium">{c.term.slice(normalizeKeyword(seed).length)}</span>
                  </>
                ) : (
                  <span className="font-medium">{c.term}</span>
                )}
                {showSource && <span className="ml-2 text-label text-muted">{CANDIDATE_SOURCE_LABEL[c.source]}</span>}
              </label>
              <span className="col-start-2 flex items-center gap-2 text-label text-muted md:col-start-auto">
                {rating != null ? <RelevanceDots value={rating} /> : <RelevanceHint term={c.term} rating={undefined} lang={lang} />}
                {rating == null && <span className="md:hidden">Relevancia sin estimar</span>}
              </span>
              <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
                {pop.value == null ? (
                  <span className="text-label text-muted">–</span>
                ) : (
                  <>
                    <span className="h-1.5 w-12 rounded-full bg-surface-muted" aria-hidden="true">
                      <span className="block h-1.5 rounded-full bg-brand" style={{ width: `${pop.value}%` }} />
                    </span>
                    <span className="font-mono text-[13px] tabular-nums">{pop.value}</span>
                    {pop.estimated && <span className="text-label text-muted">estimada</span>}
                  </>
                )}
              </span>
              <span className="col-start-2 flex min-w-0 items-center justify-between gap-2 md:col-start-auto">
                <span className="min-w-0 text-label text-ink-soft">{c.reason}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

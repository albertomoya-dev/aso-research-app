"use client";

import { useActionState, useMemo, useState } from "react";
import { addKeywords, type AddKeywordsState } from "@/app/actions";
import { relevanceNote } from "./relevance-note";
import { normalizeKeyword } from "@/lib/keywords";
import { LOW_RELEVANCE, preselect } from "@/lib/relevance";
import { toCsv, type TopTerm } from "@/lib/top-keywords";
import { EstimateButton, RelevanceHint, useRelevanceEstimate } from "./relevance-estimate";
import { buttonPrimary, buttonSecondary } from "./ui";

type Props = {
  appId: number;
  terms: TopTerm[];
  appCount: number;
  titles: Record<string, string>;
  followed: string[];
  /** Relevance of the keywords the app already follows, by term. */
  followedRelevance: Record<string, number>;
  fileName: string;
  /** Store language, for filler words. */
  lang: string;
  /** Shows «Estimar relevancia con IA» when there is an Anthropic key. */
  aiEnabled: boolean;
};

const SIZES = [
  { id: 0, label: "Todas" },
  { id: 1, label: "1 palabra" },
  { id: 2, label: "2 palabras" },
  { id: 3, label: "3 palabras" },
];

function download(name: string, csv: string) {
  // The BOM makes Excel read the accents as UTF-8.
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\p{L}\p{N}-]+/gu, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TopKeywordsTable({ appId, terms, appCount, titles, followed, followedRelevance, fileName, lang, aiEnabled }: Props) {
  const [state, action, pending] = useActionState<AddKeywordsState, FormData>(addKeywords, null);
  const [size, setSize] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const followedSet = useMemo(() => new Set(followed), [followed]);
  const isFollowed = (t: TopTerm) => followedSet.has(normalizeKeyword(t.term));
  const estimate = useRelevanceEstimate(appId);
  const ratingOf = (term: string) => followedRelevance[normalizeKeyword(term)] ?? estimate.ratingOf(term);

  // The App Store does not publish the subtitle, so the column would always be empty.
  const hasShort = terms.some((t) => t.inShort > 0);
  const shown = terms.filter((t) => size === 0 || t.words === size);
  const selectable = shown.filter((t) => !isFollowed(t)).map((t) => t.term);
  // «Seleccionar todas» leaves out filler words and those rated 2 or less; they can still be ticked one by one.
  const picks = selectable.filter((t) => preselect(t, ratingOf(t), lang));
  const allSelected = picks.length > 0 && picks.every((t) => selected.has(t));
  const runEstimate = () =>
    estimate.run(selectable, (rated) =>
      setSelected((prev) => new Set([...prev].filter((t) => !((rated[normalizeKeyword(t)] ?? Infinity) <= LOW_RELEVANCE)))),
    );
  const toggle = (term: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  const exportCsv = () => {
    const rows = selected.size > 0 ? terms.filter((t) => selected.has(t.term)) : shown;
    download(fileName, toCsv(rows, appCount, titles));
  };

  return (
    <form action={action}>
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="source" value="top10" />
      {[...selected].map((term) => (
        <input key={term} type="hidden" name="keywords" value={term} />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tamaño de la frase">
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={size === s.id}
              onClick={() => setSize(s.id)}
              className={`min-h-9 rounded-full border px-3 text-[13px] font-medium ${
                size === s.id ? "border-brand bg-brand-soft text-ink" : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {aiEnabled && <EstimateButton count={selectable.length} pending={estimate.pending} onClick={runEstimate} />}
          <button type="button" className={buttonSecondary} onClick={exportCsv}>
            {selected.size > 0 ? `Exportar ${selected.size} a CSV` : `Exportar ${shown.length} a CSV`}
          </button>
          <button type="submit" disabled={pending || selected.size === 0} className={buttonPrimary}>
            {pending ? "Añadiendo…" : selected.size === 0 ? "Seguir keywords" : selected.size === 1 ? "Seguir 1 keyword" : `Seguir ${selected.size} keywords`}
          </button>
        </div>
      </div>
      <p aria-live="polite" className="px-5 text-[13px]">
        {estimate.error && <span className="mt-3 block text-danger">{estimate.error}</span>}
        {state?.error && <span className="mt-3 block text-danger">{state.error}</span>}
        {state && !state.error && (
          <span className="mt-3 block text-ink-soft">
            {state.added === 1 ? "1 añadida" : `${state.added} añadidas`} a tus keywords con su posición de hoy
            {state.trackingFailed && " · su posición se consultará en la próxima actualización"}
            {relevanceNote(state.relevance)}
          </span>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="w-12 px-5 py-2.5">
                <input
                  type="checkbox"
                  aria-label={allSelected ? "Quitar selección" : "Seleccionar todas"}
                  checked={allSelected}
                  disabled={picks.length === 0}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const t of allSelected ? selectable : picks) {
                        if (allSelected) next.delete(t);
                        else next.add(t);
                      }
                      return next;
                    })
                  }
                  className="size-5 accent-[var(--brand)]"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Keyword</th>
              <th className="px-3 py-2.5 font-medium" title="Apps del TOP que la usan en algún campo de la ficha">
                Apps
              </th>
              <th className="px-3 py-2.5 font-medium">En el título</th>
              {hasShort && <th className="px-3 py-2.5 font-medium">En desc. corta</th>}
              <th className="px-3 py-2.5 font-medium" title="Veces que aparece sumando todas las fichas">
                Apariciones
              </th>
              <th className="px-3 py-2.5 pr-5 font-medium" title="Título 3, descripción corta 2, descripción 1, por app; las frases suman más">
                Puntuación
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const done = isFollowed(t);
              return (
                <tr key={t.term} className="border-b border-line last:border-0">
                  <td className="px-5 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${t.term}`}
                      checked={done || selected.has(t.term)}
                      disabled={done}
                      onChange={() => toggle(t.term)}
                      className="size-5 accent-[var(--brand)]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{t.term}</span>
                    <RelevanceHint term={t.term} rating={ratingOf(t.term)} lang={lang} />
                    {done && <span className="ml-2 text-xs text-muted">ya la sigues</span>}
                  </td>
                  <td className="px-3 py-2" title={t.appIds.map((id) => titles[id] ?? id).join("\n")}>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                        <span className="block h-full bg-brand" style={{ width: `${(t.apps / appCount) * 100}%` }} />
                      </span>
                      <span className="font-mono text-[13px]">
                        {t.apps}/{appCount}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[13px]">{t.inTitle || "–"}</td>
                  {hasShort && <td className="px-3 py-2 font-mono text-[13px]">{t.inShort || "–"}</td>}
                  <td className="px-3 py-2 font-mono text-[13px]">{t.occurrences}</td>
                  <td className="px-3 py-2 pr-5 font-mono text-[13px]">{t.score.toLocaleString("es-ES")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { type ApplyState, applyChangelog, type ChangelogState, proposeChangelog } from "@/app/product-actions";
import { type ChangelogProposal, FEATURE_STATUS_LABEL, MAX_CHANGELOG_CHARS } from "@/lib/product-facts";
import { buttonSecondary, inputClass } from "./ui";

export function ChangelogImport({ appId }: { appId: number }) {
  const [ai, proposeAction, proposing] = useActionState<ChangelogState, FormData>(proposeChangelog, null);
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <form action={proposeAction} className="flex flex-col gap-2">
        <input type="hidden" name="appId" value={appId} />
        <label htmlFor="changelog" className="text-[13px] font-medium text-ink-soft">
          Pega el CHANGELOG o las notas de versión
        </label>
        <textarea
          id="changelog"
          name="changelog"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHANGELOG_CHARS}
          placeholder={"## 3.0.0 (sin publicar)\n- Escanear el código de barras de la caja\n- Quitada la protección contra doble toma\n\n## 2.4.0 — 2026-09-12\n- …"}
          className={`${inputClass} py-2 font-mono text-[13px]`}
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="submit" disabled={proposing || !text.trim()} aria-busy={proposing} className={buttonSecondary}>
            {proposing ? "Leyendo…" : "Proponer funciones"}
          </button>
          <span aria-live="polite" className="text-[13px]">
            {ai?.error && <span className="text-danger">{ai.error}</span>}
            {proposing && <span className="text-muted">Puede tardar hasta un minuto.</span>}
          </span>
        </div>
      </form>
      {ai?.proposal && <ProposalReview key={JSON.stringify(ai.proposal)} appId={appId} proposal={ai.proposal} model={ai.model} />}
    </div>
  );
}

/** Checklist of what Claude found. Only the ticked items are sent to the server. */
function ProposalReview({ appId, proposal, model }: { appId: number; proposal: ChangelogProposal; model?: string }) {
  const [state, applyAction, applying] = useActionState<ApplyState, FormData>(applyChangelog, null);
  const [features, setFeatures] = useState(() => new Set(proposal.features.map((_, i) => i)));
  const [releases, setReleases] = useState(() => new Set(proposal.releases.map((_, i) => i)));
  const toggle = (set: Set<number>, update: (s: Set<number>) => void, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    update(next);
  };
  const payload = JSON.stringify({
    features: proposal.features.filter((_, i) => features.has(i)),
    releases: proposal.releases.filter((_, i) => releases.has(i)),
  });
  const total = features.size + releases.size;

  if (state && !state.error) {
    return (
      <p aria-live="polite" className="rounded-lg bg-surface-muted px-4 py-3 text-sm text-ink-soft">
        Guardado: {state.features === 1 ? "1 función" : `${state.features} funciones`} y{" "}
        {state.releases === 1 ? "1 versión" : `${state.releases} versiones`}. Revísalas en las listas de esta página.
      </p>
    );
  }

  return (
    <form action={applyAction} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-muted px-4 py-4">
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="payload" value={payload} />
      <div>
        <h3 className="text-[15px] font-semibold">Propuesta de la IA</h3>
        <p className="mt-1 text-[13px] text-muted">
          Desmarca lo que no sea correcto. Nada se guarda hasta que pulses «Guardar seleccionadas»; después podrás editar cada función.
        </p>
      </div>
      {proposal.features.length > 0 && (
        <fieldset>
          <legend className="text-xs font-medium tracking-wide text-muted uppercase">Funciones</legend>
          <ul className="mt-1.5 flex flex-col">
            {proposal.features.map((f, i) => (
              <li key={`${f.existingId ?? "new"}-${f.name}`} className="border-b border-line last:border-0">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={features.has(i)}
                    onChange={() => toggle(features, setFeatures, i)}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{f.name}</span>
                    <span className="ml-2 rounded-md bg-surface px-1.5 py-0.5 text-xs text-ink-soft">{FEATURE_STATUS_LABEL[f.status]}</span>
                    {f.sinceVersion && <span className="ml-2 font-mono text-xs text-muted">v{f.sinceVersion}</span>}
                    <span className="ml-2 text-xs text-link">{f.existingId ? "actualiza una existente" : "nueva"}</span>
                    {f.summary && <span className="block text-ink-soft">{f.summary}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {proposal.releases.length > 0 && (
        <fieldset>
          <legend className="text-xs font-medium tracking-wide text-muted uppercase">Versiones</legend>
          <ul className="mt-1.5 flex flex-col">
            {proposal.releases.map((r, i) => (
              <li key={r.version} className="border-b border-line last:border-0">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={releases.has(i)}
                    onChange={() => toggle(releases, setReleases, i)}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="min-w-0">
                    <span className="font-mono font-medium">{r.version}</span>
                    {r.date && <span className="ml-2 text-xs text-muted">{r.date}</span>}
                    {r.notes && <span className="block text-ink-soft">{r.notes}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {proposal.notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-soft">
          {proposal.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" disabled={applying || total === 0} className={buttonSecondary}>
          {applying ? "Guardando…" : `Guardar seleccionadas (${total})`}
        </button>
        <span aria-live="polite" className="text-[13px]">
          {state?.error && <span className="text-danger">{state.error}</span>}
        </span>
      </div>
      <p className="text-xs text-muted">Generado por IA{model ? ` (${model})` : ""}. Comprueba el estado de cada función: decide qué puede anunciar la ficha.</p>
    </form>
  );
}

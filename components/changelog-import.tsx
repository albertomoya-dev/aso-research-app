"use client";

import { FileText } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { type ApplyState, applyChangelog, type ChangelogState, proposeChangelog } from "@/app/product-actions";
import { clearOperation, useLongAction } from "@/lib/long-operations";
import { type ChangelogProposal, FEATURE_STATUS_LABEL, MAX_CHANGELOG_CHARS } from "@/lib/product-facts";
import { OperationProgress } from "./operation-progress";
import { inputClass } from "./ui";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

const STEPS = ["Leyendo el CHANGELOG…", "Separando funciones y versiones…", "Comparando con tus funciones…"];

/**
 * «Importar desde CHANGELOG» of Ajustes › Producto, in a dialog: paste, Claude proposes, you tick what
 * to keep. The proposal survives closing the dialog or leaving the page (lib/long-operations.ts).
 */
export function ChangelogImportDialog({ appId, publishedVersion }: { appId: number; publishedVersion?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FileText size={16} aria-hidden="true" />
          Importar desde CHANGELOG
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar desde CHANGELOG</DialogTitle>
          <DialogDescription>
            Claude propone las funciones con su estado{publishedVersion ? `, con la ${publishedVersion} como versión publicada` : ""}. Tú decides qué se guarda.
          </DialogDescription>
        </DialogHeader>
        <ChangelogImport appId={appId} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function ChangelogImport({ appId, onSaved }: { appId: number; onSaved?: () => void }) {
  const key = `changelog:${appId}`;
  const [ai, proposeAction, proposing, op] = useLongAction<ChangelogState>(key, proposeChangelog, {
    label: "Leyendo el CHANGELOG",
    doneLabel: "Propuesta de funciones lista",
    steps: STEPS,
    stepMs: 10_000,
  });
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
          <Button type="submit" variant={ai?.proposal ? "secondary" : "primary"} disabled={proposing || !text.trim()} aria-busy={proposing}>
            {proposing ? "Leyendo…" : "Proponer funciones"}
          </Button>
          <span aria-live="polite" className="text-[13px]">
            {!proposing && ai?.error && <span className="text-danger">{ai.error}</span>}
          </span>
        </div>
        <OperationProgress op={op} />
      </form>
      {ai?.proposal && !proposing && (
        <ProposalReview
          key={JSON.stringify(ai.proposal)}
          appId={appId}
          proposal={ai.proposal}
          model={ai.model}
          onSaved={(saved) => {
            clearOperation(key);
            setText("");
            toast(saved);
            onSaved?.();
          }}
        />
      )}
    </div>
  );
}

/** Checklist of what Claude found. Only the ticked items are sent to the server. */
function ProposalReview({
  appId,
  proposal,
  model,
  onSaved,
}: {
  appId: number;
  proposal: ChangelogProposal;
  model?: string;
  onSaved: (message: string) => void;
}) {
  const [state, applyAction, applying] = useActionState<ApplyState, FormData>(async (prev, formData) => {
    const next = await applyChangelog(prev, formData);
    if (next && !next.error) {
      onSaved(
        `Guardado: ${next.features === 1 ? "1 función" : `${next.features} funciones`} y ${next.releases === 1 ? "1 versión" : `${next.releases} versiones`}`,
      );
    }
    return next;
  }, null);
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

  return (
    <form action={applyAction} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-muted px-4 py-4">
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="payload" value={payload} />
      <div>
        <h3 className="text-[15px] font-semibold">Propuesta de la IA</h3>
        <p className="mt-1 text-[13px] text-muted">Desmarca lo que no sea correcto. Nada se guarda hasta que pulses «Guardar seleccionadas».</p>
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
        <Button type="submit" variant="primary" disabled={applying || total === 0}>
          {applying ? "Guardando…" : `Guardar seleccionadas (${total})`}
        </Button>
        <span aria-live="polite" className="text-[13px]">
          {state?.error && <span className="text-danger">{state.error}</span>}
        </span>
      </div>
      <p className="text-xs text-muted">Generado por IA{model ? ` (${model})` : ""}. Comprueba el estado de cada función: decide qué puede anunciar la ficha.</p>
    </form>
  );
}

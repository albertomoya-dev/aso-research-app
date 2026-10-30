"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { discardDraft, type DraftState, optimizeListing, type OptimizeState, saveDraft } from "@/app/ai-actions";
import type { ListingProposal } from "@/lib/listing-optimizer";
import { appendToKeywordField, charCount, checkMetadata, type FieldKey, FIELDS, type MetadataDraft } from "@/lib/metadata-check";
import type { Store } from "@/lib/stores/types";
import { buttonPrimary, buttonSecondary, Card, inputClass } from "./ui";

type Props = {
  appId: number;
  store: Store;
  initial: MetadataDraft;
  published: MetadataDraft;
  hasDraft: boolean;
  keywords: string[];
  aiEnabled: boolean;
  /** State of the product sheet: whether it is empty and how many features are coming in the next version. */
  product: { empty: boolean; nextCount: number };
};

export function MetadataEditor({ appId, store, initial, published, hasDraft, keywords, aiEnabled, product }: Props) {
  const [draft, setDraft] = useState(initial);
  const [state, action, pending] = useActionState<DraftState, FormData>(saveDraft, null);
  const [ai, optimizeAction, optimizing] = useActionState<OptimizeState, FormData>(optimizeListing, null);
  const [focus, setFocus] = useState("");
  // Fields of the current proposal already applied or discarded.
  const [handled, setHandled] = useState<{ proposal?: ListingProposal; keys: FieldKey[] }>({ keys: [] });
  const report = useMemo(() => checkMetadata(store, draft, keywords), [store, draft, keywords]);
  const set = (key: FieldKey, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const proposal = ai?.proposal;
  const done = handled.proposal === proposal ? handled.keys : [];
  const markDone = (keys: FieldKey[]) => setHandled({ proposal, keys: [...done, ...keys] });
  const pendingKeys = proposal
    ? FIELDS[store].map((f) => f.key).filter((k) => proposal.fields[k] != null && proposal.fields[k] !== draft[k] && !done.includes(k))
    : [];
  const apply = (keys: FieldKey[]) => {
    if (!proposal) return;
    setDraft((d) => ({ ...d, ...Object.fromEntries(keys.map((k) => [k, proposal.fields[k] ?? d[k]])) }));
    markDone(keys);
  };
  const proposed = proposal
    ? checkMetadata(store, { ...draft, ...Object.fromEntries(pendingKeys.map((k) => [k, proposal.fields[k]])) }, keywords)
    : null;
  const labels = Object.fromEntries(FIELDS[store].map((f) => [f.key, f.label])) as Record<FieldKey, string>;
  const covered = report.coverage.filter((c) => c.covered).length;
  const extra = appendToKeywordField(draft.keywordField, report.missingWords);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="px-5 py-5">
        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="appId" value={appId} />
          {aiEnabled && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-muted px-4 py-3">
              <label htmlFor="ai-focus" className="text-[13px] font-medium text-ink-soft">
                Optimizar con IA
              </label>
              <p className="text-xs text-muted">
                Reescribe la ficha con tus keywords (prioriza las de más oportunidad y las que ya rozan el top) respetando los límites de la tienda.
                Verás la propuesta campo a campo antes de aplicarla.
              </p>
              {product.empty ? (
                <p className="rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
                  Tu ficha de producto está vacía: la IA solo conoce la ficha publicada, que puede estar desfasada.{" "}
                  <Link href={`/apps/${appId}/producto`} className="font-medium underline">
                    Completar la ficha de producto
                  </Link>
                </p>
              ) : (
                <fieldset className="flex flex-col gap-1 text-[13px] text-ink-soft">
                  <legend className="sr-only">Para qué versión es la ficha</legend>
                  <div className="flex flex-wrap gap-x-5">
                    <label className="flex min-h-11 items-center gap-2 md:min-h-8">
                      <input type="radio" name="factsMode" value="published" defaultChecked={product.nextCount === 0} className="size-4 accent-[var(--brand)]" />
                      Ficha para la versión publicada
                    </label>
                    <label className="flex min-h-11 items-center gap-2 md:min-h-8">
                      <input type="radio" name="factsMode" value="next" defaultChecked={product.nextCount > 0} className="size-4 accent-[var(--brand)]" />
                      Ficha para la próxima versión
                    </label>
                  </div>
                  <span className="text-xs text-muted">
                    La IA usa tu{" "}
                    <Link href={`/apps/${appId}/producto`} className="text-link hover:underline">
                      ficha de producto
                    </Link>
                    : solo funciones publicadas, o también las {product.nextCount > 0 ? `${product.nextCount} ` : ""}de la próxima versión. Nunca las
                    planeadas ni las retiradas.
                  </span>
                </fieldset>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  id="ai-focus"
                  name="focus"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  maxLength={200}
                  placeholder="Opcional: en qué centrarse, p. ej. «entrenar para un maratón»"
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <button type="submit" formAction={optimizeAction} disabled={optimizing} aria-busy={optimizing} className={buttonSecondary}>
                  {optimizing ? "Optimizando…" : "Optimizar con IA"}
                </button>
              </div>
              <span aria-live="polite" className="text-[13px]">
                {ai?.error && <span className="text-danger">{ai.error}</span>}
                {optimizing && <span className="text-muted">Puede tardar hasta un minuto.</span>}
              </span>
            </div>
          )}
          {/* Fields of the other store are kept so switching stores never loses text. */}
          {(Object.keys(draft) as FieldKey[])
            .filter((k) => !FIELDS[store].some((f) => f.key === k))
            .map((k) => (
              <input key={k} type="hidden" name={k} value={draft[k]} />
            ))}
          {report.fields.map((f) => {
            const id = `field-${f.key}`;
            const changed = draft[f.key] !== published[f.key];
            const props = {
              id,
              name: f.key,
              value: draft[f.key],
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(f.key, e.target.value),
              "aria-describedby": `${id}-count`,
              "aria-invalid": f.over || undefined,
              className: `${inputClass} w-full ${f.over ? "border-danger" : ""}`,
            };
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">
                    {f.label}
                    {changed && <span className="ml-2 text-xs font-normal text-link">modificado</span>}
                  </label>
                  <span id={`${id}-count`} className={`font-mono text-xs ${f.over ? "font-semibold text-danger" : "text-muted"}`}>
                    {f.length}/{f.limit}
                  </span>
                </div>
                {f.multiline ? <textarea rows={10} {...props} className={`${props.className} py-2.5`} /> : <input {...props} />}
                {f.hint && <p className="text-xs text-muted">{f.hint}</p>}
                {proposal && pendingKeys.includes(f.key) && (
                  <ProposalBox
                    text={proposal.fields[f.key] ?? ""}
                    limit={f.limit}
                    why={proposal.changes.find((c) => c.field === f.key)?.why}
                    onApply={() => apply([f.key])}
                    onDiscard={() => markDone([f.key])}
                  />
                )}
                {f.key === "keywordField" && report.missingWords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => set("keywordField", extra)}
                    className="self-start text-[13px] font-medium text-link hover:underline"
                  >
                    Añadir las palabras que faltan ({report.missingWords.length}) → {charCount(extra)}/100
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="submit" disabled={pending} className={buttonPrimary}>
              {pending ? "Guardando…" : "Guardar borrador"}
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setDraft(published)}>
              Volver a la ficha publicada
            </button>
            {hasDraft && (
              <button type="submit" formAction={discardDraft} className={`${buttonSecondary} text-danger`}>
                Borrar borrador
              </button>
            )}
            <span aria-live="polite" className="text-[13px] text-muted">
              {state?.error && <span className="text-danger">{state.error}</span>}
              {state?.savedAt && "Borrador guardado"}
            </span>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-6">
        {proposal && proposed && (pendingKeys.length > 0 || proposal.notes.length > 0) && (
          <Card aria-label="Propuesta de la IA" className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Propuesta de la IA</h2>
            <p className="mt-1 text-[13px] text-muted">
              Cobertura de keywords: {covered} → <span className="font-semibold text-ink">{proposed.coverage.filter((c) => c.covered).length}</span> de{" "}
              {keywords.length}. Revisa el texto antes de publicarlo.
            </p>
            {proposal.targetKeywords.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Construida alrededor de</h3>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {proposal.targetKeywords.map((k) => (
                    <li key={k} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-ink-soft">
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {proposal.over.length > 0 && (
              <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
                Se pasa del límite: {proposal.over.map((k) => labels[k]?.toLowerCase()).join(", ")}. Recórtalo tras aplicarlo.
              </p>
            )}
            {proposal.notes.length > 0 && (
              <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-soft">
                {proposal.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {pendingKeys.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={buttonSecondary} onClick={() => apply(pendingKeys)}>
                  Aplicar todo ({pendingKeys.length})
                </button>
                <button type="button" className={`${buttonSecondary} text-muted`} onClick={() => markDone(pendingKeys)}>
                  Descartar
                </button>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">Generado por IA{ai?.model ? ` (${ai.model})` : ""}. Se aplica al editor; guarda el borrador para conservarlo.</p>
          </Card>
        )}
        <Card aria-label="Avisos" className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Avisos</h2>
          {report.issues.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Todo dentro de los límites.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {report.issues.map((issue) => (
                <li
                  key={issue.text}
                  className={`rounded-lg px-3 py-2 ${issue.level === "error" ? "bg-danger-soft text-danger" : "bg-warn-bg text-warn-fg"}`}
                >
                  {issue.text}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-label="Cobertura de keywords" className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold">Cobertura de keywords</h2>
            <p className="mt-1 text-[13px] text-muted">
              {keywords.length === 0
                ? "Aún no sigues ninguna keyword."
                : `${covered} de ${keywords.length} tienen todas sus palabras en ${store === "ios" ? "nombre, subtítulo o campo de keywords" : "título o descripciones"}.`}
            </p>
          </div>
          <ul className="max-h-[480px] overflow-y-auto">
            {report.coverage.map((c) => (
              <li key={c.term} className="flex items-start justify-between gap-3 border-b border-line px-5 py-2.5 text-sm last:border-0">
                <span>
                  <span className={c.covered ? "" : "text-ink-soft"}>{c.term}</span>
                  {c.missing.length > 0 && <span className="block text-xs text-muted">Falta: {c.missing.join(", ")}</span>}
                </span>
                <span className="shrink-0 text-right text-xs">
                  {c.exactIn ? (
                    <span className="font-semibold text-up">En {labels[c.exactIn]?.toLowerCase()}</span>
                  ) : c.covered ? (
                    <span className="text-ink-soft">Palabras sueltas</span>
                  ) : (
                    <span className="text-down">No cubierta</span>
                  )}
                  {c.descriptionCount != null && c.descriptionCount > 0 && (
                    <span className="block text-muted">{c.descriptionCount}× en descripción</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function ProposalBox({ text, limit, why, onApply, onDiscard }: { text: string; limit: number; why?: string; onApply: () => void; onDiscard: () => void }) {
  const length = charCount(text);
  return (
    <div className="rounded-lg border border-line bg-brand-soft px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-link">Propuesta de la IA</span>
        <span className={`font-mono text-xs ${length > limit ? "font-semibold text-danger" : "text-muted"}`}>
          {length}/{limit}
        </span>
      </div>
      <p className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm text-ink">{text || "(vacío)"}</p>
      {why && <p className="mt-1.5 text-xs text-muted">{why}</p>}
      <div className="mt-2 flex gap-4">
        <button type="button" onClick={onApply} className="min-h-8 text-[13px] font-medium text-link hover:underline">
          Aplicar
        </button>
        <button type="button" onClick={onDiscard} className="min-h-8 text-[13px] text-muted hover:underline">
          Descartar
        </button>
      </div>
    </div>
  );
}

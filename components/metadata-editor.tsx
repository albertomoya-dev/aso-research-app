"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { discardDraft, type DraftState, localizeListingAction, optimizeListing, type OptimizeState, saveDraft } from "@/app/ai-actions";
import type { DraftAge, DraftTarget } from "@/lib/listing-drafts";
import type { ListingProposal } from "@/lib/listing-optimizer";
import {
  appendToKeywordField,
  charCount,
  checkMetadata,
  type DiffItem,
  FIELD_WEIGHTS,
  type FieldKey,
  FIELDS,
  type Issue,
  type KeywordDiff,
  keywordDiff,
  type MetadataDraft,
  weightedCoverage,
} from "@/lib/metadata-check";
import type { Store } from "@/lib/stores/types";
import { BrandList } from "./brand-list";
import { buttonPrimary, buttonSecondary, Card, inputClass } from "./ui";

type Props = {
  appId: number;
  store: Store;
  initial: MetadataDraft;
  /** Published listing to compare with; null for a language the store listing is not in. */
  published: MetadataDraft | null;
  hasDraft: boolean;
  /** Which listing this is: a locale's main listing (country "") or a Google Play custom listing. */
  target: DraftTarget;
  /** Spanish names: "inglés (Estados Unidos)" for the target, and the main listing's locale. */
  targetName: string;
  mainName: string;
  isMain: boolean;
  /** Same language as the main listing: the optimizer and the tracked keywords apply. */
  sameLanguage: boolean;
  /** «Borrador del … · la ficha publicada cambió el …» (H11.6). */
  age: DraftAge | null;
  /** Shown in the coverage card instead of the list when the keywords do not apply to this language. */
  keywordNote?: string;
  /** Tracked keywords; `relevant` ones (not noise, relevance 3+ or unrated) count in the weighted score, like in the optimizer. */
  keywords: { term: string; opportunity: number | null; relevant: boolean }[];
  /** Store language and category, for the policy checks. */
  policy: { lang: string; category: string | null };
  /** Competitor brands found by the detector, and the words the user marked as «no es una marca». */
  brands: string[];
  brandExceptions: string[];
  aiEnabled: boolean;
  /** State of the product sheet: whether it is empty and how many features are coming in the next version. */
  product: { empty: boolean; nextCount: number };
};

export function MetadataEditor({
  appId,
  store,
  initial,
  published,
  hasDraft,
  target,
  targetName,
  mainName,
  isMain,
  sameLanguage,
  age,
  keywordNote,
  keywords,
  policy,
  brands,
  brandExceptions,
  aiEnabled,
  product,
}: Props) {
  const [draft, setDraft] = useState(initial);
  const [state, action, pending] = useActionState<DraftState, FormData>(saveDraft, null);
  // One proposal at a time: «Optimizar con IA» or «Adaptar a …», told apart by the submit button's intent.
  const [ai, aiAction, optimizing] = useActionState<OptimizeState, FormData>(
    (prev, formData) => (formData.get("intent") === "localize" ? localizeListingAction(prev, formData) : optimizeListing(prev, formData)),
    null,
  );
  const [focus, setFocus] = useState("");
  // Fields of the current proposal already applied or discarded.
  const [handled, setHandled] = useState<{ proposal?: ListingProposal; keys: FieldKey[] }>({ keys: [] });
  const terms = useMemo(() => keywords.map((k) => k.term), [keywords]);
  const scoring = useMemo(() => keywords.filter((k) => k.relevant), [keywords]);
  const policyContext = useMemo(() => ({ ...policy, brands }), [policy, brands]);
  const report = useMemo(() => checkMetadata(store, draft, terms, policyContext), [store, draft, terms, policyContext]);
  const weighted = useMemo(() => weightedCoverage(store, draft, scoring), [store, draft, scoring]);
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
  const proposedDraft: MetadataDraft | null = proposal ? { ...draft, ...Object.fromEntries(pendingKeys.map((k) => [k, proposal.fields[k]])) } : null;
  const proposed = proposedDraft ? checkMetadata(store, proposedDraft, terms, policyContext) : null;
  // Same pure function as the server's quality lock, against what is in the editor right now.
  const proposedWeighted = proposedDraft ? weightedCoverage(store, proposedDraft, scoring) : null;
  const diff = proposedWeighted ? keywordDiff(weighted, proposedWeighted) : null;
  const regressed = proposedWeighted != null && proposedWeighted.score < weighted.score;
  const labels = Object.fromEntries(FIELDS[store].map((f) => [f.key, f.label])) as Record<FieldKey, string>;
  const covered = report.coverage.filter((c) => c.covered).length;
  const extra = appendToKeywordField(draft.keywordField, report.missingWords);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="px-5 py-5">
        <form action={action} className="flex flex-col gap-5">
          <input type="hidden" name="appId" value={appId} />
          <input type="hidden" name="locale" value={target.locale} />
          <input type="hidden" name="country" value={target.country} />
          {age && (
            <p role={age.stale ? "status" : undefined} className={`rounded-lg px-3 py-2 text-[13px] ${age.stale ? "bg-warn-bg text-warn-fg" : "bg-surface-muted text-muted"}`}>
              {age.text}
            </p>
          )}
          {aiEnabled && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-muted px-4 py-3">
              <label htmlFor="ai-focus" className="text-[13px] font-medium text-ink-soft">
                {isMain ? "Optimizar con IA" : `Escribir la ficha en ${targetName} con IA`}
              </label>
              {isMain ? (
                <p className="text-xs text-muted">
                  Reescribe la ficha con tus keywords (prioriza las de más oportunidad y las que ya rozan el top) respetando los límites de la tienda.
                  Verás la propuesta campo a campo antes de aplicarla.
                </p>
              ) : (
                <p className="text-xs text-muted">
                  «Adaptar» parte de la ficha principal ({mainName}) y usa lo que se busca en el país de destino: el autocompletado de la tienda y los
                  títulos de las apps que salen arriba. No es una traducción literal. Verás la propuesta campo a campo; no se guarda nada hasta que
                  pulses «Guardar borrador».
                  {sameLanguage ? " «Optimizar» reescribe este texto con tus keywords, como en la ficha principal." : ""}
                </p>
              )}
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
                {!isMain && (
                  <button
                    type="submit"
                    name="intent"
                    value="localize"
                    formAction={aiAction}
                    disabled={optimizing}
                    aria-busy={optimizing}
                    className={buttonSecondary}
                  >
                    {optimizing ? "Escribiendo…" : `Adaptar a ${target.locale}`}
                  </button>
                )}
                {sameLanguage && (
                  <button
                    type="submit"
                    name="intent"
                    value="optimize"
                    formAction={aiAction}
                    disabled={optimizing}
                    aria-busy={optimizing}
                    className={buttonSecondary}
                  >
                    {optimizing ? "Optimizando…" : "Optimizar con IA"}
                  </button>
                )}
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
            const changed = published != null && draft[f.key] !== published[f.key];
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
            {published && (
              <button type="button" className={buttonSecondary} onClick={() => setDraft(published)}>
                {isMain ? "Volver a la ficha publicada" : "Volver al texto de partida"}
              </button>
            )}
            {hasDraft && (
              <button type="submit" formAction={discardDraft} className={`${buttonSecondary} text-danger`}>
                Borrar borrador
              </button>
            )}
            <span aria-live="polite" className="text-[13px] text-muted">
              {state?.error && <span className="text-danger">{state.error}</span>}
              {state?.savedAt && !state.warning && "Borrador guardado"}
            </span>
          </div>
          {state?.warning && (
            <p role="status" className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
              Borrador guardado, pero cubre peor tus keywords relevantes que {state.warning.against === "draft" ? "el borrador anterior" : "la ficha publicada"}:
              cobertura ponderada {state.warning.before} → {state.warning.after} de 100
              {state.warning.lost.length > 0 && <>. Deja de cubrir: {state.warning.lost.join(", ")}</>}. Puedes seguir así si es lo que quieres.
            </p>
          )}
        </form>
      </Card>

      <div className="flex flex-col gap-6">
        {proposal && proposed && (pendingKeys.length > 0 || proposal.notes.length > 0) && (
          <Card aria-label="Propuesta de la IA" className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Propuesta de la IA</h2>
            {proposedWeighted && scoring.length > 0 && (
              <p className="mt-1 text-[13px] text-muted">
                Cobertura ponderada: {weighted.score} →{" "}
                <span className={`font-mono font-semibold ${regressed ? "text-down" : proposedWeighted.score > weighted.score ? "text-up" : "text-ink"}`}>
                  {proposedWeighted.score}
                </span>{" "}
                de 100 · keywords cubiertas: {covered} → {proposed.coverage.filter((c) => c.covered).length} de {keywords.length}. Revisa el texto antes de
                publicarlo.
              </p>
            )}
            {regressed && proposedWeighted && (
              <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                Esta propuesta cubre peor tus keywords que el texto actual ({weighted.score} → {proposedWeighted.score}).
                {proposal.attempts === 2 ? " La IA lo intentó dos veces y esta es la mejor de las dos." : ""} Aplica solo los campos que te convenzan.
              </p>
            )}
            {diff && <KeywordDiffView diff={diff} labels={labels} />}
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
            {proposed && proposed.issues.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Avisos de la propuesta</h3>
                <IssueList issues={proposed.issues} />
              </div>
            )}
            {pendingKeys.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={regressed ? buttonSecondary : buttonPrimary} onClick={() => apply(pendingKeys)}>
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
          <p className="mt-1 text-xs text-muted">Límites de la tienda y normas de Google Play y App Store. Cada aviso enlaza a la norma oficial.</p>
          {report.issues.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Todo dentro de los límites y sin problemas de normas detectados.</p>
          ) : (
            <IssueList issues={report.issues} />
          )}
        </Card>

        <BrandList appId={appId} brands={brands} exceptions={brandExceptions} />

        <Card aria-label="Cobertura de keywords" className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold">Cobertura de keywords</h2>
            <p className="mt-1 text-[13px] text-muted">
              {keywordNote
                ? keywordNote
                : keywords.length === 0
                ? "Aún no sigues ninguna keyword."
                : `${covered} de ${keywords.length} tienen todas sus palabras en ${store === "ios" ? "nombre, subtítulo o campo de keywords" : "título o descripciones"}.`}
            </p>
            {scoring.length > 0 && (
              <p className="mt-1 text-[13px] text-muted">
                Cobertura ponderada: <span className="font-mono font-semibold text-ink">{weighted.score}</span> de 100. Cuenta las {scoring.length} keywords
                relevantes por su oportunidad y por el campo: {weightsText(store, labels)}; si solo están las palabras sueltas, cuenta{" "}
                {store === "ios" ? "el 80 %" : "la mitad"}.
              </p>
            )}
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

function weightsText(store: Store, labels: Record<FieldKey, string>): string {
  return Object.entries(FIELD_WEIGHTS[store])
    .map(([k, w]) => `${labels[k as FieldKey]?.toLowerCase()} ×${String(w).replace(".", ",")}`)
    .join(", ");
}

const ISSUE_STYLE: Record<Issue["level"], string> = {
  error: "bg-danger-soft text-danger",
  warn: "bg-warn-bg text-warn-fg",
  info: "bg-surface-muted text-ink-soft",
};
const ISSUE_LABEL: Record<Issue["level"], string> = { error: "Error", warn: "Aviso", info: "Info" };

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-2 text-sm">
      {issues.map((issue) => (
        <li key={`${issue.ruleId ?? ""}${issue.text}`} className={`rounded-lg px-3 py-2 ${ISSUE_STYLE[issue.level]}`}>
          <span className="sr-only">{ISSUE_LABEL[issue.level]}: </span>
          {issue.text}
          {issue.link && (
            <>
              {" "}
              <a href={issue.link} target="_blank" rel="noreferrer" className="whitespace-nowrap font-medium underline">
                Ver norma
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

const DIFF_PREVIEW = 5;

function KeywordDiffView({ diff, labels }: { diff: KeywordDiff; labels: Record<FieldKey, string> }) {
  const field = (k: FieldKey | null) => (k ? labels[k]?.toLowerCase() : "palabras sueltas");
  const groups: { key: keyof KeywordDiff; title: string; tone: string; detail: (d: DiffItem) => string }[] = [
    { key: "lost", title: "Pierde", tone: "text-down", detail: (d) => `estaba en ${field(d.from)}` },
    { key: "gained", title: "Gana", tone: "text-up", detail: (d) => `en ${field(d.to)}` },
    { key: "moved", title: "Cambia de campo", tone: "text-ink-soft", detail: (d) => `${field(d.from)} → ${field(d.to)}` },
  ];
  if (groups.every((g) => diff[g.key].length === 0)) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {groups.map((g) =>
        diff[g.key].length > 0 ? <DiffGroup key={g.key} title={g.title} tone={g.tone} detail={g.detail} items={diff[g.key]} /> : null,
      )}
    </div>
  );
}

function DiffGroup({ title, tone, items, detail }: { title: string; tone: string; items: DiffItem[]; detail: (d: DiffItem) => string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, DIFF_PREVIEW);
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
        {title} ({items.length})
      </h3>
      <ul className="mt-1 flex flex-col text-sm">
        {shown.map((d) => (
          <li key={d.term} className="flex items-baseline justify-between gap-3 py-0.5">
            <span className={tone}>{d.term}</span>
            <span className="shrink-0 text-xs text-muted">
              {detail(d)} · <span className="font-mono">{Math.round(d.value)}</span>
            </span>
          </li>
        ))}
      </ul>
      {items.length > DIFF_PREVIEW && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-h-11 text-[13px] text-link hover:underline md:min-h-8">
          {open ? "Ver menos" : `Ver ${items.length - DIFF_PREVIEW} más`}
        </button>
      )}
    </div>
  );
}

"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { discardDraft, type DraftState, localizeListingAction, optimizeListing, type OptimizeState, saveDraft } from "@/app/ai-actions";
import type { ScreenshotSpec } from "@/lib/assets/screenshots";
import { cn } from "@/lib/cn";
import { hasOperation, useLongAction } from "@/lib/long-operations";
import { formatNumber } from "@/lib/format";
import type { DraftAge, DraftTarget, LocaleOption } from "@/lib/listing-drafts";
import { type ListingProposal } from "@/lib/listing-optimizer";
import {
  appendToKeywordField,
  charCount,
  checkMetadata,
  FIELD_WEIGHTS,
  type FieldKey,
  FIELDS,
  type FieldSpec,
  type MetadataDraft,
  type MetadataReport,
  phraseRanges,
  tokens,
  weightedCoverage,
} from "@/lib/metadata-check";
import type { Store } from "@/lib/stores/types";
import { wordSpans } from "@/lib/text";
import { DiffText } from "./diff-text";
import { HighlightTextarea, type TextMark } from "./highlight-textarea";
import { CoverageList } from "./listing-coverage";
import { IssueList } from "./listing-issues";
import { editorUrl, ListingLocalePicker } from "./listing-locale-picker";
import { ListingProposalPanel, pendingFields } from "./listing-proposal";
import { OperationProgress } from "./operation-progress";
import { StorePreview } from "./store-preview";
import { inputClass } from "./ui";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { HelpTip } from "./ui/help-tip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type Props = {
  appId: number;
  /** The product sheet (`/a/[app]/ajustes/producto`). */
  productHref: string;
  store: Store;
  initial: MetadataDraft;
  /** Text with no saved draft (`baseDraftFor`): what the editor shows again after «Borrar borrador». Never another language. */
  base: MetadataDraft;
  /** «Aún no hay ficha en inglés…» for a listing in another language with no draft (`missingListingNotice`). */
  missingNotice: string | null;
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
  /** Shown in «Cobertura» instead of the list when the keywords do not apply to this language. */
  keywordNote?: string;
  /** Tracked keywords; `relevant` ones (not noise, relevance 3+ or unrated) count in the weighted score, like in the optimizer. */
  keywords: { term: string; opportunity: number | null; relevant: boolean }[];
  /** Store language, category and declared brand, for the policy checks. */
  policy: { lang: string; category: string | null; ownBrand?: string };
  /** Competitor brands found by the detector, for the checks: a brand in the text shows up as a warning. */
  brands: string[];
  /** Ajustes › Marcas, where the list and the «no es una marca» exceptions live. */
  brandsHref: string;
  aiEnabled: boolean;
  /**
   * State of the product sheet: whether it is empty, how many features are coming in the next version and,
   * when no brand is declared but the title looks like «Marca: palabras», that first part (`brandOf`).
   */
  product: { empty: boolean; nextCount: number; brandHint?: string | null };
  /** The language picker: this market's editor URL, its main locale and the options (`localeOptions`). */
  locales: { editorHref: string; mainLocale: string; options: LocaleOption[] };
  /** Store preview: what the editor does not hold (icon, developer, rating) and the screenshots. */
  preview: { icon: string; developer: string; rating: number | null; screenshots: string[]; design: ScreenshotSpec | null };
  /** «Publicada» for the main listing: the published listing as read from the store (server-rendered). */
  publishedView?: React.ReactNode;
  /** «Notas de la versión» tab (server-rendered `ReleaseNotesCard`). */
  releaseNotes: React.ReactNode;
  /** Opened from «Adaptar a…» on another listing (`?adaptar=1`): start adapting once, then drop the flag from the URL. */
  autoAdapt?: boolean;
  /** `?focus=` (Tendencias › «Preparar temporada»): pre-fills what the AI should focus on. */
  initialFocus?: string | null;
};

type View = "draft" | "published" | "compare";

export function MetadataEditor({
  appId,
  productHref,
  store,
  initial,
  base,
  missingNotice,
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
  brandsHref,
  aiEnabled,
  product,
  locales,
  preview,
  publishedView,
  releaseNotes,
  autoAdapt,
  initialFocus,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState(initial);
  const [view, setView] = useState<View>("draft");
  const [panel, setPanel] = useState("preview");
  const [addOpen, setAddOpen] = useState(false);
  const [focusTerm, setFocusTerm] = useState<string | null>(null);
  const [state, action, pending] = useActionState<DraftState, FormData>(saveDraft, null);
  // One proposal at a time: «Optimizar con IA» or «Adaptar a …», told apart by the submit's intent.
  // It outlives the page (lib/long-operations.ts): leave while the AI writes, and the proposal waits here.
  const aiKey = `listing:${appId}:${target.locale}|${target.country}`;
  const [ai, aiAction, optimizing, aiOp] = useLongAction<OptimizeState>(
    aiKey,
    (prev, formData) => (formData.get("intent") === "localize" ? localizeListingAction(prev, formData) : optimizeListing(prev, formData)),
    (formData) =>
      formData.get("intent") === "localize"
        ? {
            label: `Adaptando la ficha a ${targetName}`,
            doneLabel: `Propuesta para ${targetName} lista`,
            steps: [`Leyendo la ficha principal (${mainName})…`, `Buscando lo que se busca en ${targetName}…`, "Escribiendo la ficha…", "Revisando límites y normas…"],
          }
        : {
            label: "Optimizando la ficha con IA",
            doneLabel: "Propuesta de la ficha lista",
            steps: ["Leyendo tu ficha y tus keywords…", "Escribiendo la propuesta…", "Revisando límites y normas…"],
          },
  );
  const [focus, setFocus] = useState(initialFocus ?? "");
  // Fields of the current proposal already accepted or discarded.
  const [handled, setHandled] = useState<{ proposal?: ListingProposal; keys: FieldKey[] }>({ keys: [] });
  const terms = useMemo(() => keywords.map((k) => k.term), [keywords]);
  const scoring = useMemo(() => keywords.filter((k) => k.relevant), [keywords]);
  const policyContext = useMemo(() => ({ ...policy, brands }), [policy, brands]);
  const report = useMemo(() => checkMetadata(store, draft, terms, policyContext), [store, draft, terms, policyContext]);
  const weighted = useMemo(() => weightedCoverage(store, draft, scoring), [store, draft, scoring]);
  const marks = useMemo(() => fieldMarks(store, draft, report, focusTerm), [store, draft, report, focusTerm]);
  const set = (key: FieldKey, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  // The page re-renders after the delete, but this state would keep the old text: go back to the base,
  // which is never text in another language (H22).
  const discard = async (formData: FormData) => {
    await discardDraft(formData);
    setDraft(base);
  };

  const proposal = ai?.proposal;
  const done = handled.proposal === proposal ? handled.keys : [];
  const markDone = (keys: FieldKey[]) => setHandled({ proposal, keys: [...done, ...keys] });
  const accept = (keys: FieldKey[]) => {
    if (!proposal) return;
    setDraft((d) => ({ ...d, ...Object.fromEntries(keys.map((k) => [k, proposal.fields[k] ?? d[k]])) }));
    markDone(keys);
  };
  const pendingCount = proposal ? pendingFields(store, draft, proposal, done).length : 0;

  const canOptimize = aiEnabled && sameLanguage;
  const canLocalize = aiEnabled && !isMain && !sameLanguage;
  const localize = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set("intent", "localize");
    setView("draft");
    aiAction(data);
  };
  // «Adaptar a…» from another listing lands here with ?adaptar=1: run it once and clean the URL, so a reload does not pay again.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoAdapt || autoRan.current) return;
    autoRan.current = true;
    const q = new URLSearchParams(window.location.search);
    q.delete("adaptar");
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
    // Back here from «Ver resultado» or an old tab: an adaptation for this listing is already kept (running
    // or waiting to be used), so show it instead of paying for another.
    if (canLocalize && !hasOperation(aiKey)) localize();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const adaptTargets = locales.options.filter((o) => o.kind !== "other" && o.locale.split("-")[0] !== locales.mainLocale.split("-")[0]);

  const specs = FIELDS[store];
  const labels = Object.fromEntries(specs.map((f) => [f.key, f.label])) as Record<FieldKey, string>;
  const indexed = specs.filter((f) => f.indexed);
  const covered = report.coverage.filter((c) => c.covered).length;
  const extra = appendToKeywordField(draft.keywordField, report.missingWords);
  const errors = report.issues.filter((i) => i.level === "error").length;
  const showFocus = (term: string | null, field: FieldKey | null) => {
    setFocusTerm(term);
    if (!term) return;
    setView("draft");
    const target = field ?? indexed.find((f) => phraseRanges(draft[f.key], term).length > 0)?.key ?? indexed[0]?.key;
    if (target) requestAnimationFrame(() => document.getElementById(`field-${target}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  return (
    // The grid holds the three zones. The form and the view tabs are `display: contents`, so their children
    // (top bar, messages, editor) are grid items too, while the right panel stays outside the form: the
    // release notes generator inside it has a form of its own.
    <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <form ref={formRef} action={action} className="contents">
      <input type="hidden" name="appId" value={appId} />
      <input type="hidden" name="locale" value={target.locale} />
      <input type="hidden" name="country" value={target.country} />
      {/* Fields of the other store are kept so switching stores never loses text. */}
      {(Object.keys(draft) as FieldKey[])
        .filter((k) => !specs.some((f) => f.key === k))
        .map((k) => (
          <input key={k} type="hidden" name={k} value={draft[k]} />
        ))}

      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="contents">
        {/* Top bar: language, view and actions. */}
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-3 py-3 sm:px-4 lg:col-span-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ListingLocalePicker
              editorHref={locales.editorHref}
              store={store}
              mainLocale={locales.mainLocale}
              options={locales.options}
              current={target}
              addOpen={addOpen}
              onAddOpenChange={setAddOpen}
            />
            <TabsList aria-label="Vista de la ficha">
              <TabsTrigger value="published">Publicada</TabsTrigger>
              <TabsTrigger value="draft">Borrador</TabsTrigger>
              <TabsTrigger value="compare">Comparar</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canOptimize && (
              <Button type="submit" name="intent" value="optimize" formAction={aiAction} variant="primary" disabled={optimizing} aria-busy={optimizing} onClick={() => setView("draft")}>
                <Sparkles size={16} aria-hidden="true" />
                {optimizing ? "Optimizando…" : "Optimizar con IA"}
              </Button>
            )}
            {aiEnabled && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={canOptimize ? "secondary" : "primary"} disabled={optimizing}>
                    {optimizing && !canOptimize ? "Escribiendo…" : "Adaptar a…"}
                    <ChevronDown size={16} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>Escribir la ficha en otro idioma a partir de la principal ({mainName})</DropdownMenuLabel>
                  {canLocalize && <DropdownMenuItem onSelect={localize}>Esta ficha: {targetName}</DropdownMenuItem>}
                  {adaptTargets
                    .filter((o) => o.locale !== target.locale || o.country !== target.country)
                    .map((o) => (
                      <DropdownMenuItem
                        key={`${o.locale}|${o.country}`}
                        onSelect={() => router.push(editorUrl(locales.editorHref, locales.mainLocale, o, { adaptar: "1" }))}
                      >
                        {o.label} ({o.locale})
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setTimeout(() => setAddOpen(true), 0)}>Otro idioma…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button type="submit" variant={aiEnabled ? "secondary" : "primary"} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-2 text-table empty:hidden lg:col-span-2">
          {!optimizing && ai?.error && <p className="rounded-control bg-danger-soft px-3 py-2 text-danger">{ai.error}</p>}
          <OperationProgress op={aiOp} />
          {state?.error && <p className="rounded-control bg-danger-soft px-3 py-2 text-danger">{state.error}</p>}
          {state?.savedAt && !state.warning && <p className="text-muted">Borrador guardado.</p>}
          {state?.warning && (
            <p className="rounded-control bg-warn-bg px-3 py-2 text-warn-fg">
              Borrador guardado, pero cubre peor tus keywords relevantes que {state.warning.against === "draft" ? "el borrador anterior" : "la ficha publicada"}:
              cobertura ponderada {state.warning.before} → {state.warning.after} de 100
              {state.warning.lost.length > 0 && <>. Deja de cubrir: {state.warning.lost.join(", ")}</>}. Puedes seguir así si es lo que quieres.
            </p>
          )}
          {pendingCount > 0 && view !== "draft" && <p className="text-ink-soft">Hay una propuesta de la IA pendiente en la vista Borrador.</p>}
        </div>

          {/* Editor (60 %). */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* Forced mount: the fields must stay in the form while «Publicada» or «Comparar» is shown. */}
            <TabsContent value="draft" forceMount className="mt-0 flex flex-col gap-4 data-[state=inactive]:hidden">
              {missingNotice && <p className="rounded-control bg-surface-muted px-3 py-2 text-table text-ink-soft">{missingNotice}</p>}
              {age && <p className={cn("rounded-control px-3 py-2 text-table", age.stale ? "bg-warn-bg text-warn-fg" : "bg-surface-muted text-ink-soft")}>{age.text}</p>}
              {aiEnabled && (canOptimize || canLocalize) && (
                <AiOptions productHref={productHref} product={product} focus={focus} onFocusChange={setFocus} isMain={isMain} mainName={mainName} />
              )}
              {!aiEnabled && initialFocus && (
                <p role="note" data-testid="focus-note" className="rounded-control bg-surface-muted px-3 py-2 text-table text-ink-soft">
                  Enfoque para la IA: «{initialFocus}». Lo usará «Optimizar con IA» cuando añadas la clave de Anthropic.
                </p>
              )}
              {proposal && (
                <ListingProposalPanel
                  store={store}
                  draft={draft}
                  proposal={proposal}
                  model={ai?.model}
                  terms={terms}
                  scoring={scoring}
                  policy={policyContext}
                  done={done}
                  onAccept={accept}
                  onDiscard={markDone}
                />
              )}
              <section aria-label="Texto de la ficha" className="flex flex-col gap-5 rounded-card border border-line bg-surface px-4 py-5 sm:px-5">
                {report.fields.map((f) => (
                  <FieldEditor
                    key={f.key}
                    field={f}
                    value={draft[f.key]}
                    onChange={(v) => set(f.key, v)}
                    marks={marks[f.key] ?? []}
                    changed={published != null && draft[f.key] !== published[f.key]}
                    issues={report.issues.filter((i) => i.field === f.key)}
                    after={
                      f.key === "keywordField" && report.missingWords.length > 0 ? (
                        <button type="button" onClick={() => set("keywordField", extra)} className="self-start text-table font-medium text-link underline">
                          Añadir las palabras que faltan ({report.missingWords.length}) → {charCount(extra)}/100
                        </button>
                      ) : null
                    }
                  />
                ))}
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  {published && (
                    <Button variant="ghost" onClick={() => setDraft(published)}>
                      {isMain ? "Volver a la ficha publicada" : "Volver al texto de partida"}
                    </Button>
                  )}
                  {hasDraft && (
                    <Button type="submit" variant="ghost" formAction={discard} className="text-danger">
                      Borrar borrador
                    </Button>
                  )}
                  <span className="text-label text-muted">Los cambios se guardan como borrador; publicar es aparte.</span>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="published" className="mt-0">
              <section aria-label="Ficha publicada" className="rounded-card border border-line bg-surface px-4 py-5 sm:px-5">
                {isMain && publishedView ? (
                  publishedView
                ) : published ? (
                  <ReadOnlyFields specs={specs} draft={published} note={`Texto de la ficha principal (${mainName}): esta ficha usa el mismo idioma.`} />
                ) : (
                  <p className="text-sm text-ink-soft">Rankeo no lee fichas publicadas en {targetName}: solo la principal de cada mercado.</p>
                )}
              </section>
            </TabsContent>

            <TabsContent value="compare" className="mt-0">
              <section aria-label="Publicada frente a borrador" className="flex flex-col gap-4 rounded-card border border-line bg-surface px-4 py-5 sm:px-5">
                {published ? (
                  <>
                    <p className="text-table text-ink-soft">
                      Lo <del className="rounded-[3px] bg-danger-soft text-danger">tachado</del> está en la ficha {isMain ? "publicada" : "de partida"} y no en
                      el editor; lo <ins className="rounded-[3px] bg-up/15 text-ink decoration-up">subrayado</ins> es nuevo.
                    </p>
                    {specs.map((f) => (
                      <div key={f.key} className="flex flex-col gap-1 border-t border-line pt-3">
                        <h3 className="text-table font-medium text-ink-soft">{f.label}</h3>
                        {published[f.key] === draft[f.key] ? (
                          <p className="text-table text-muted">Sin cambios.</p>
                        ) : (
                          <DiffText before={published[f.key]} after={draft[f.key]} className={f.multiline ? "text-sm leading-relaxed" : "text-body"} />
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-ink-soft">No hay ficha publicada en {targetName} con la que comparar.</p>
                )}
              </section>
            </TabsContent>
          </div>
      </Tabs>
    </form>

          {/* Right panel (40 %). */}
          <section aria-label="Panel de la ficha" className="min-w-0 rounded-card border border-line bg-surface px-4 py-4 sm:px-5 lg:sticky lg:top-4">
            <Tabs value={panel} onValueChange={setPanel}>
              <TabsList aria-label="Panel de la ficha" className="flex-wrap">
                <TabsTrigger value="preview">Vista previa</TabsTrigger>
                <TabsTrigger value="coverage">Cobertura</TabsTrigger>
                <TabsTrigger value="policy">
                  Normas
                  {report.issues.length > 0 && (
                    <span className={cn("rounded-full px-1.5 font-mono text-label", errors > 0 ? "bg-danger-soft text-danger" : "bg-warn-bg text-warn-fg")}>
                      {report.issues.length}
                      <span className="sr-only"> avisos</span>
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="notes">
                  Notas<span className="sr-only"> de la versión</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="mt-4">
                <StorePreview
                  store={store}
                  icon={preview.icon}
                  developer={preview.developer}
                  rating={preview.rating}
                  title={draft.title}
                  tagline={store === "ios" ? draft.subtitle : draft.shortDescription}
                  screenshots={preview.screenshots}
                  design={preview.design}
                />
              </TabsContent>
              <TabsContent value="coverage" className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1 text-table text-ink-soft">
                  <p>
                    {keywordNote
                      ? keywordNote
                      : keywords.length === 0
                        ? "Aún no sigues ninguna keyword."
                        : `${covered} de ${keywords.length} keywords tienen todas sus palabras en ${store === "ios" ? "nombre, subtítulo o campo de keywords" : "título o descripciones"}. Pulsa una para verla en el texto.`}
                  </p>
                  {scoring.length > 0 && (
                    <p className="flex items-center gap-1">
                      Cobertura ponderada: <span className="font-mono font-semibold text-ink">{formatNumber(weighted.score)}</span> de 100
                      <HelpTip label="Cobertura ponderada">
                        Cuenta las {scoring.length} keywords relevantes por su oportunidad y por el campo: {weightsText(store, labels)}. Si solo están las
                        palabras sueltas, cuenta {store === "ios" ? "el 80 %" : "la mitad"}.
                      </HelpTip>
                    </p>
                  )}
                </div>
                {!keywordNote && report.coverage.length > 0 && <CoverageList coverage={report.coverage} indexed={indexed} focus={focusTerm} onFocus={showFocus} />}
              </TabsContent>
              <TabsContent value="policy" className="mt-4 flex flex-col gap-3">
                {report.issues.length === 0 ? (
                  <p className="text-sm text-ink-soft">Todo dentro de los límites y sin problemas de normas detectados.</p>
                ) : (
                  <IssueList issues={report.issues} />
                )}
                <p className="text-label text-muted">Límites de la tienda y normas de Google Play y App Store; cada aviso enlaza a la norma.</p>
                <p className="text-table text-ink-soft">
                  {brands.length === 1 ? "1 marca de la competencia detectada" : `${brands.length} marcas de la competencia detectadas`}: la IA no las usa y, si
                  aparecen en tu texto, salen aquí.{" "}
                  <Link href={brandsHref} className="font-medium text-link underline">
                    Revisar en Ajustes › Marcas
                  </Link>
                </p>
              </TabsContent>
              {/* Forced mount: a generated text survives switching tabs. */}
              <TabsContent value="notes" forceMount className="mt-4 data-[state=inactive]:hidden">
                {releaseNotes}
              </TabsContent>
            </Tabs>
          </section>
    </div>
  );
}

/** The AI options under the top bar: what to focus on and which version the listing is for. */
function AiOptions({
  productHref,
  product,
  focus,
  onFocusChange,
  isMain,
  mainName,
}: {
  productHref: string;
  product: Props["product"];
  focus: string;
  onFocusChange: (v: string) => void;
  isMain: boolean;
  mainName: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ai-focus" className="text-table font-medium text-ink-soft">
          Para la IA
        </label>
        <HelpTip label="Para la IA">
          {isMain
            ? "«Optimizar con IA» reescribe la ficha con tus keywords (prioriza las de más oportunidad y las que rozan el top) dentro de los límites de la tienda. La propuesta sale como cambios sobre tu texto y la aceptas campo a campo."
            : `«Adaptar» parte de la ficha principal (${mainName}) y usa lo que se busca en el país de destino. No es una traducción literal. No se guarda nada hasta que pulses «Guardar».`}
        </HelpTip>
        <input
          id="ai-focus"
          name="focus"
          value={focus}
          onChange={(e) => onFocusChange(e.target.value)}
          maxLength={200}
          placeholder="Opcional: en qué centrarse, p. ej. «entrenar para un maratón»"
          className={`${inputClass} min-w-0 flex-1 basis-60`}
        />
        {!product.empty && (
          <>
            <label htmlFor="ai-facts" className="sr-only">
              Para qué versión es la ficha
            </label>
            <select id="ai-facts" name="factsMode" defaultValue={product.nextCount > 0 ? "next" : "published"} className={`${inputClass} min-w-0`}>
              <option value="published">Versión publicada</option>
              <option value="next">Próxima versión{product.nextCount > 0 ? ` (${product.nextCount} funciones)` : ""}</option>
            </select>
          </>
        )}
      </div>
      {product.empty && (
        <p className="rounded-control bg-warn-bg px-3 py-2 text-table text-warn-fg">
          Tu ficha de producto está vacía: la IA solo conoce la ficha publicada, que puede estar desfasada.{" "}
          <Link href={productHref} className="font-medium underline">
            Completar la ficha de producto
          </Link>
        </p>
      )}
      {product.brandHint && (
        <p className="rounded-control bg-warn-bg px-3 py-2 text-table text-warn-fg">
          ¿Tu título empieza por una marca («{product.brandHint}»)?{" "}
          <Link href={productHref} className="font-medium underline">
            Declárala en Producto
          </Link>{" "}
          para que la IA la conserve.
        </p>
      )}
    </div>
  );
}

const FIELD_TEXT: Partial<Record<FieldKey, string>> = {
  title: "text-page-title font-medium",
  description: "min-h-80 text-sm leading-relaxed",
};

function FieldEditor({
  field,
  value,
  onChange,
  marks,
  changed,
  issues,
  after,
}: {
  field: MetadataReport["fields"][number];
  value: string;
  onChange: (v: string) => void;
  marks: TextMark[];
  changed: boolean;
  issues: MetadataReport["issues"];
  after?: React.ReactNode;
}) {
  const id = `field-${field.key}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-table font-medium text-ink-soft">
          {field.label}
          {changed && <span className="ml-2 text-label font-normal text-link">modificado</span>}
        </label>
        <CharMeter id={`${id}-count`} length={field.length} limit={field.limit} />
      </div>
      <HighlightTextarea
        id={id}
        name={field.key}
        value={value}
        onChange={onChange}
        marks={marks}
        singleLine={!field.multiline}
        aria-describedby={`${id}-count${issues.length ? ` ${id}-issues` : ""}`}
        aria-invalid={field.over || undefined}
        textClassName={FIELD_TEXT[field.key] ?? "text-body"}
      />
      {field.hint && <p className="text-label text-muted">{field.hint}</p>}
      {issues.length > 0 && (
        <div id={`${id}-issues`}>
          <IssueList issues={issues} compact />
        </div>
      )}
      {after}
    </div>
  );
}

/** «23/30» with a bar: amber from 90 % of the limit, red over it. */
function CharMeter({ id, length, limit }: { id: string; length: number; limit: number }) {
  const ratio = length / limit;
  const tone = ratio > 1 ? "danger" : ratio >= 0.9 ? "warn" : "ok";
  return (
    <span id={id} className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="h-1 w-16 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={cn("block h-full rounded-full", tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-brand")}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </span>
      <span className={cn("font-mono text-label", tone === "danger" ? "font-semibold text-danger" : tone === "warn" ? "text-warn-fg" : "text-muted")}>
        {length}/{limit}
        <span className="sr-only"> caracteres{tone === "danger" ? ", se pasa del límite" : ""}</span>
      </span>
    </span>
  );
}

function ReadOnlyFields({ specs, draft, note }: { specs: FieldSpec[]; draft: MetadataDraft; note: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-table text-muted">{note}</p>
      {specs.map((f) => (
        <div key={f.key} className="flex flex-col gap-1 border-t border-line pt-3">
          <h3 className="text-table font-medium text-ink-soft">{f.label}</h3>
          <p className="text-sm break-words whitespace-pre-wrap text-ink">{draft[f.key] || <span className="text-muted">Vacío</span>}</p>
        </div>
      ))}
    </div>
  );
}

function weightsText(store: Store, labels: Record<FieldKey, string>): string {
  return Object.entries(FIELD_WEIGHTS[store])
    .map(([k, w]) => `${labels[k as FieldKey]?.toLowerCase()} ×${String(w).replace(".", ",")}`)
    .join(", ");
}

/**
 * Marks of each field: covered keywords (exact phrase in that field), policy issues on their exact
 * words, and the keyword picked in «Cobertura» (the phrase, or each of its words when they are scattered).
 */
export function fieldMarks(store: Store, draft: MetadataDraft, report: MetadataReport, focusTerm: string | null): Partial<Record<FieldKey, TextMark[]>> {
  const out: Partial<Record<FieldKey, TextMark[]>> = {};
  for (const f of FIELDS[store]) {
    const text = draft[f.key];
    const spans = wordSpans(text);
    const list: TextMark[] = [];
    for (const c of report.coverage) {
      if (c.inFields.includes(f.key)) for (const range of phraseRanges(text, c.term, spans)) list.push({ range, kind: "keyword" });
    }
    for (const issue of report.issues) {
      if (issue.field === f.key) for (const range of issue.ranges ?? []) list.push({ range, kind: "issue" });
    }
    if (focusTerm) {
      const exact = phraseRanges(text, focusTerm, spans);
      const ranges = exact.length > 0 ? exact : tokens(focusTerm).flatMap((w) => phraseRanges(text, w, spans));
      for (const range of ranges) list.push({ range, kind: "focus" });
    }
    out[f.key] = list;
  }
  return out;
}

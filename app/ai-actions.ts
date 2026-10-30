"use server";

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AiError, localizeListing, rateRelevance, rewriteListing, suggestKeywords, writeReleaseNotes } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { followKeywords } from "@/lib/follow";
import { detectBrands, getBrandExceptions } from "@/lib/brand-queries";
import {
  applyProposal,
  assessProposal,
  type Attempt,
  brandOf,
  cleanProposal,
  finalizeProposal,
  type ListingProposal,
  pickBest,
  proposalFeedback,
  qualityFeedback,
} from "@/lib/listing-optimizer";
import { deleteListingDraft, getListingDraft, saveListingDraft } from "@/lib/listing-draft-queries";
import {
  type DraftTarget,
  isMainTarget,
  localeLanguage,
  mainLocale,
  marketCountryFor,
  resolveTarget,
  sharesMainLanguage,
  storeLangFor,
} from "@/lib/listing-drafts";
import { researchMarket } from "@/lib/locale-market";
import { cleanLocalizedProposal } from "@/lib/localize";
import { draftFromMeta, type MetadataDraft, weightedCoverage } from "@/lib/metadata-check";
import { policyCheck } from "@/lib/policy-check";
import { FACTS_MODES, factsForPrompt } from "@/lib/product-facts";
import { getProductFacts, productFactsPrompt } from "@/lib/product-queries";
import { getKeywordRows } from "@/lib/queries";
import { chunk, cleanRatings, isRelevantKeyword } from "@/lib/relevance";
import { cleanReleaseNotes, hasReleaseMaterial, MAX_PASTED_CHANGELOG, type ReleaseNotes } from "@/lib/release-notes";
import { rateAppKeywords, rateNewKeywords, relevanceContextFor, type RelevanceStatus } from "@/lib/relevance-jobs";
import { shiftDate, today } from "@/lib/ranking";
import { getAdapter } from "@/lib/stores";
import { competitorBrands, filterSuggestions, PROMPT_VERSION, seedWords, topCompetitors } from "@/lib/suggestions";
import { fold } from "@/lib/text";

const idSchema = z.coerce.number().int().positive();

/** Real signals for the prompt: tracked and rejected keywords, store autocomplete and the apps ranking for our keywords. */
async function gatherContext(app: typeof schema.apps.$inferSelect) {
  const db = getDb();
  // Keyword research looks ahead, so features of the next version count too.
  const [tracked, previous, snapshots, facts, exceptions] = await Promise.all([
    db
      .select({ term: schema.keywords.term })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, app.id)),
    db
      .select({ term: schema.aiSuggestions.term, status: schema.aiSuggestions.status })
      .from(schema.aiSuggestions)
      .where(eq(schema.aiSuggestions.appId, app.id)),
    db
      .select({ top5: schema.rankSnapshots.top5 })
      .from(schema.rankSnapshots)
      .where(and(eq(schema.rankSnapshots.appId, app.id), gte(schema.rankSnapshots.date, shiftDate(today(), -7))))
      .orderBy(desc(schema.rankSnapshots.date))
      .limit(200),
    productFactsPrompt(app.id, "next"),
    getBrandExceptions(app.id),
  ]);

  // The 25 apps that show up most in the TOP 5 of our keywords this week.
  const competitors = topCompetitors(snapshots, app.storeId, 25).map((c) => ({ title: c.title, developer: c.developer }));

  const { lang } = getCountry(app.country);
  const adapter = getAdapter(app.store);
  const seeds = seedWords(app.meta.title, app.meta.category);
  const lists = await Promise.allSettled(seeds.map((seed) => adapter.suggest(seed, { country: app.country, lang })));
  const autocomplete = [...new Set(lists.flatMap((r) => (r.status === "fulfilled" ? r.value : [])))].slice(0, 60);

  // Generic words (our title, tracked keywords, product sheet) never count as another app's brand.
  const brands = competitorBrands(competitors, app.meta.developer, {
    ownTitle: app.meta.title,
    trackedTerms: tracked.map((t) => t.term),
    productTerms: facts ?? "",
    exceptions,
    lang,
  });

  return {
    context: {
      // Pending ideas count as "already proposed" so a new run brings different ones.
      existing: [...tracked.map((t) => t.term), ...previous.filter((p) => p.status !== "dismissed").map((p) => p.term)],
      rejected: previous.filter((p) => p.status === "dismissed").map((p) => p.term),
      autocomplete,
      competitors,
      facts,
    },
    brands,
  };
}

export type GenerateState = { created?: number; dropped?: number; error?: string } | null;

export async function generateSuggestions(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const appId = idSchema.parse(formData.get("appId"));
  const focus = z.string().trim().max(200).catch("").parse(formData.get("focus") ?? "");
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };

  const { context, brands } = await gatherContext(app);
  const country = getCountry(app.country);
  let result;
  try {
    result = await suggestKeywords({
      store: app.store,
      countryName: country.name,
      lang: country.lang,
      meta: app.meta,
      focus: focus || undefined,
      ...context,
    });
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }

  const { kept, dropped } = filterSuggestions(result.output, [...context.existing, ...context.rejected], brands);
  const inserted =
    kept.length === 0
      ? []
      : await db
          .insert(schema.aiSuggestions)
          .values(
            kept.map((s) => ({
              appId,
              term: s.keyword,
              language: s.language,
              intent: s.intent,
              relevance: s.relevance,
              estimatedCompetition: s.estimatedCompetition,
              reason: s.reason,
              model: result.model,
              promptVersion: PROMPT_VERSION,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: schema.aiSuggestions.id });

  revalidatePath(`/apps/${appId}/ideas`);
  return { created: inserted.length, dropped: dropped.length + kept.length - inserted.length };
}

export type AcceptState = { added?: number; trackingFailed?: boolean; relevance?: RelevanceStatus; error?: string } | null;

export async function acceptSuggestions(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const appId = idSchema.parse(formData.get("appId"));
  const ids = z.array(idSchema).max(200).parse(formData.getAll("suggestionId"));
  if (ids.length === 0) return { error: "Marca al menos una idea." };
  const db = getDb();
  const picked = await db
    .select()
    .from(schema.aiSuggestions)
    .where(and(eq(schema.aiSuggestions.appId, appId), inArray(schema.aiSuggestions.id, ids)));
  const { added, keywordIds, trackingFailed } = await followKeywords(
    appId,
    picked.map((s) => ({ term: s.term, relevance: s.relevance })),
    "ai",
  );
  // The idea already has a relevance; this adds the intent, now that the search results are known.
  const relevance = await rateNewKeywords(appId, keywordIds);
  await db
    .update(schema.aiSuggestions)
    .set({ status: "accepted" })
    .where(inArray(schema.aiSuggestions.id, picked.map((s) => s.id)));
  revalidatePath(`/apps/${appId}`, "layout");
  return { added, trackingFailed, relevance };
}

export async function dismissSuggestions(formData: FormData) {
  const appId = idSchema.parse(formData.get("appId"));
  // One id from a row's button, or every pending one for "Descartar todas".
  const ids = z.array(idSchema).max(200).parse(formData.getAll(formData.has("dismissId") ? "dismissId" : "suggestionId"));
  if (ids.length === 0) return;
  await getDb()
    .update(schema.aiSuggestions)
    .set({ status: "dismissed" })
    .where(and(eq(schema.aiSuggestions.appId, appId), inArray(schema.aiSuggestions.id, ids)));
  revalidatePath(`/apps/${appId}/ideas`);
}

const draftSchema = z.object({
  title: z.string().max(200),
  subtitle: z.string().max(200),
  keywordField: z.string().max(500),
  shortDescription: z.string().max(500),
  description: z.string().max(8000),
});

/** Non-blocking: the draft is saved, but covers the relevant keywords worse than the text it replaces. */
export type CoverageWarning = { before: number; after: number; against: "draft" | "published"; lost: string[] };
export type DraftState = { savedAt?: string; warning?: CoverageWarning; error?: string } | null;

/** Which draft the form is for: hidden «locale» and «country» fields, validated like the page's URL. */
function targetFrom(formData: FormData, app: { country: string; store: "ios" | "android" }): DraftTarget {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };
  return resolveTarget(app.country, app.store, { locale: str("locale"), country: str("country") });
}

export async function saveDraft(_prev: DraftState, formData: FormData): Promise<DraftState> {
  const appId = idSchema.parse(formData.get("appId"));
  const fields = Object.fromEntries(Object.keys(draftSchema.shape).map((k) => [k, formData.get(k) ?? ""]));
  const parsed = draftSchema.safeParse(fields);
  if (!parsed.success) return { error: "Algún campo es demasiado largo para guardarlo." };
  const draft: MetadataDraft = parsed.data;
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  const target = targetFrom(formData, app);
  const previousRow = await getListingDraft(appId, target.locale, target.country);
  // apps.draft is no longer written: drafts live in listing_drafts, one per locale (and country).
  const savedAt = await saveListingDraft(appId, target, draft);
  revalidatePath(`/apps/${appId}/metadata`);

  // Same weighted coverage as the editor and the optimizer, against the previous draft or the published listing.
  // Only for listings in the language of the tracked keywords: in another language they say nothing.
  let warning: CoverageWarning | undefined;
  if (sharesMainLanguage(app.country, target)) {
    try {
      const { lang } = getCountry(app.country);
      const rows = (await getKeywordRows(app)).filter((r) => isRelevantKeyword(r, lang));
      const previous = previousRow?.draft ?? draftFromMeta(app.meta);
      const before = weightedCoverage(app.store, previous, rows);
      const after = weightedCoverage(app.store, draft, rows);
      if (after.score < before.score) {
        const lost = after.items
          .filter((a, i) => a.credit === 0 && before.items[i].credit > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
          .map((a) => a.term);
        warning = { before: before.score, after: after.score, against: previousRow ? "draft" : "published", lost };
      }
    } catch (err) {
      // The draft is already saved; the warning is a bonus.
      console.error("saveDraft: coverage check failed", err);
    }
  }
  return { savedAt: savedAt.toISOString(), warning };
}

export async function discardDraft(formData: FormData) {
  const appId = idSchema.parse(formData.get("appId"));
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return;
  await deleteListingDraft(appId, targetFrom(formData, app));
  revalidatePath(`/apps/${appId}/metadata`);
}

export type OptimizeState = { proposal?: ListingProposal; model?: string; error?: string } | null;

/** Rewrites the editor's current text around the tracked keywords. Nothing is saved: the user reviews and applies it. */
export async function optimizeListing(_prev: OptimizeState, formData: FormData): Promise<OptimizeState> {
  const appId = idSchema.parse(formData.get("appId"));
  const focus = z.string().trim().max(200).catch("").parse(formData.get("focus") ?? "");
  // Which version the listing is for: only shipped features, or also those of the next release.
  const mode = z.enum(FACTS_MODES).catch("next").parse(formData.get("factsMode"));
  const fields = Object.fromEntries(Object.keys(draftSchema.shape).map((k) => [k, formData.get(k) ?? ""]));
  const parsed = draftSchema.safeParse(fields);
  if (!parsed.success) return { error: "Algún campo es demasiado largo para enviarlo a la IA." };
  const current: MetadataDraft = parsed.data;

  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  const [rows, facts] = await Promise.all([getKeywordRows(app), productFactsPrompt(app.id, mode)]);
  const country = getCountry(app.country);
  const brand = brandOf(current.title || app.meta.title);
  const { brands } = await detectBrands(app, rows, facts);
  // Only keywords worth building on: no filler, no foreign intent, relevance 3+ (or unrated).
  const relevant = rows.filter((r) => isRelevantKeyword(r, country.lang));
  const input = {
    store: app.store,
    countryName: country.name,
    lang: country.lang,
    developer: app.meta.developer,
    category: app.meta.category,
    current,
    keywords: relevant,
    avoidBrands: brands,
    facts,
    version: app.meta.version,
    releaseNotes: app.meta.releaseNotes,
    focus: focus || undefined,
  };
  const tracked = rows.map((r) => r.term);
  const policy = { lang: country.lang, category: app.meta.category, keywords: tracked, brands, ownBrand: brand };
  const attempt = (output: Parameters<typeof cleanProposal>[1]): Attempt => {
    const proposal = cleanProposal(app.store, output, tracked);
    return { proposal, assessment: assessProposal(app.store, current, proposal, relevant, policy) };
  };

  try {
    const first = await rewriteListing(input);
    const attempts = [attempt(first.output)];
    let model = first.model;
    // Quality lock: one more try when a field is over its limit, the brand was dropped, the coverage
    // got worse, an important keyword was lost or a store policy is broken. Then keep the best one.
    const feedback = [...proposalFeedback(app.store, attempts[0].proposal, brand), ...qualityFeedback(attempts[0].assessment)];
    if (feedback.length > 0) {
      try {
        const second = await rewriteListing(input, feedback);
        attempts.push(attempt(second.output));
        model = second.model;
      } catch (err) {
        // The first answer is still worth showing.
        if (!(err instanceof AiError)) throw err;
      }
    }
    return { proposal: finalizeProposal(pickBest(attempts), attempts.length), model };
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }
}

const brandExceptionSchema = z.object({
  appId: idSchema,
  word: z.string().trim().min(1).max(100),
  exception: z.enum(["1", "0"]),
});

/** «No es una marca» (exception=1) or «Es una marca» (exception=0) for a word the brand detector found. */
export async function setBrandException(formData: FormData): Promise<void> {
  const parsed = brandExceptionSchema.safeParse({
    appId: formData.get("appId"),
    word: formData.get("word"),
    exception: formData.get("exception"),
  });
  if (!parsed.success) return;
  const { appId, exception } = parsed.data;
  const word = fold(parsed.data.word).replace(/\s+/g, " ");
  const db = getDb();
  if (exception === "1") {
    await db.insert(schema.brandExceptions).values({ appId, word }).onConflictDoNothing();
  } else {
    await db.delete(schema.brandExceptions).where(and(eq(schema.brandExceptions.appId, appId), eq(schema.brandExceptions.word, word)));
  }
  revalidatePath(`/apps/${appId}/metadata`);
}

export type RelevanceState = { rated?: number; asked?: number; error?: string } | null;

/** «Recalcular relevancia»: rates with Claude every keyword of the app the user has not rated by hand. */
export async function recalculateRelevance(_prev: RelevanceState, formData: FormData): Promise<RelevanceState> {
  const appId = idSchema.parse(formData.get("appId"));
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  try {
    const report = await rateAppKeywords(app);
    revalidatePath(`/apps/${appId}`, "layout");
    if (report.error && report.rated === 0) return { error: report.error };
    return report;
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }
}

const relevanceSchema = z.object({
  appId: idSchema,
  keywordId: idSchema,
  relevance: z.number().int().min(1).max(5),
});

/**
 * The user's own relevance for a keyword. From then on the AI never changes it. Rating it 3 or more
 * also clears a «foreign intent» mark: the user knows best.
 */
export async function setKeywordRelevance(appId: number, keywordId: number, relevance: number): Promise<{ error?: string }> {
  const parsed = relevanceSchema.safeParse({ appId, keywordId, relevance });
  if (!parsed.success) return { error: "La relevancia va de 1 a 5." };
  await getDb()
    .update(schema.appKeywords)
    .set({
      relevance: parsed.data.relevance,
      relevanceSource: "user",
      relevanceCheckedAt: new Date(),
      ...(parsed.data.relevance >= 3 ? { intent: "own" as const } : {}),
    })
    .where(and(eq(schema.appKeywords.appId, parsed.data.appId), eq(schema.appKeywords.keywordId, parsed.data.keywordId)));
  revalidatePath(`/apps/${parsed.data.appId}`, "layout");
  return {};
}

export type EstimateResult = { ratings: Record<string, number>; error?: string };

/**
 * Relevance of candidate keywords (TOP 10, Descubrir) before following them. Nothing is stored:
 * the list only uses it to show the estimate and untick those rated 2 or less. At most 200 terms.
 */
export async function estimateRelevance(appId: number, terms: string[]): Promise<EstimateResult> {
  const parsed = z
    .object({ appId: idSchema, terms: z.array(z.string().trim().min(1).max(100)).min(1).max(200) })
    .safeParse({ appId, terms });
  if (!parsed.success) return { ratings: {}, error: "No hay keywords que estimar." };
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, parsed.data.appId) });
  if (!app) return { ratings: {}, error: "App no encontrada." };
  try {
    const context = await relevanceContextFor(app);
    const batches = chunk(parsed.data.terms);
    const outputs = await Promise.all(batches.map((batch) => rateRelevance(context, batch.map((term) => ({ term, top: [] })))));
    const ratings: Record<string, number> = {};
    outputs.forEach(({ output }, i) => {
      // A search for another kind of app is not worth following, whatever the score.
      for (const r of cleanRatings(output, batches[i])) ratings[r.term] = r.intent === "foreign" ? Math.min(r.relevance, 2) : r.relevance;
    });
    return { ratings };
  } catch (err) {
    if (err instanceof AiError) return { ratings: {}, error: err.message };
    throw err;
  }
}

/**
 * «Adaptar a <idioma>»: Claude writes the listing for the editor's locale from the main listing (its
 * saved draft, or the published one), using that market's autocomplete and top app titles. Nothing is
 * saved: the editor shows it as a proposal, field by field, like the optimizer's.
 */
export async function localizeListingAction(_prev: OptimizeState, formData: FormData): Promise<OptimizeState> {
  const appId = idSchema.parse(formData.get("appId"));
  const focus = z.string().trim().max(200).catch("").parse(formData.get("focus") ?? "");
  const mode = z.enum(FACTS_MODES).catch("next").parse(formData.get("factsMode"));
  const fields = Object.fromEntries(Object.keys(draftSchema.shape).map((k) => [k, formData.get(k) ?? ""]));
  const parsed = draftSchema.safeParse(fields);
  if (!parsed.success) return { error: "Algún campo es demasiado largo para enviarlo a la IA." };
  const current: MetadataDraft = parsed.data;

  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  const target = targetFrom(formData, app);
  if (isMainTarget(app.country, target)) return { error: "Esta es la ficha principal: elige otro idioma o país para adaptarla." };

  const sourceLocale = mainLocale(app.country);
  const country = getCountry(app.country);
  const [mainRow, rows, facts] = await Promise.all([
    getListingDraft(appId, sourceLocale, ""),
    getKeywordRows(app),
    productFactsPrompt(app.id, mode),
  ]);
  const source = mainRow?.draft ?? draftFromMeta(app.meta);
  const brand = brandOf(source.title || app.meta.title);
  const { brands } = await detectBrands(app, rows, facts);
  const marketCode = marketCountryFor(target);
  const market = marketCode
    ? await researchMarket(
        app,
        { country: marketCode, lang: storeLangFor(target.locale) },
        { title: source.title || app.meta.title, category: app.meta.category },
      )
    : null;
  const input = {
    store: app.store,
    sourceLocale,
    targetLocale: target.locale,
    marketCountryName: marketCode ? getCountry(marketCode).name : null,
    brand,
    source,
    sourceKeywords: rows.filter((r) => isRelevantKeyword(r, country.lang)).map((r) => ({ term: r.term, opportunity: r.opportunity })),
    autocomplete: market?.autocomplete ?? [],
    topTitles: market?.topTitles ?? [],
    existing: market?.existing ?? null,
    category: market?.category ?? app.meta.category,
    facts,
    avoidBrands: brands,
    focus: focus || undefined,
  };
  const policy = { lang: localeLanguage(target.locale), category: app.meta.category, brands, ownBrand: brand };
  // Rule breaks of a proposal: over the limit, brand dropped, store policy errors (lib/policy-check.ts).
  const problems = (proposal: ListingProposal) => [
    ...proposalFeedback(app.store, proposal, brand),
    ...policyCheck(app.store, applyProposal(current, proposal), policy)
      .filter((i) => i.level === "error")
      .map((e) => `Store policy error${e.ruleId ? ` (${e.ruleId})` : ""}: ${e.text}`),
  ];

  try {
    const first = await localizeListing(input);
    let proposal = cleanLocalizedProposal(app.store, first.output);
    let model = first.model;
    let attempts = 1;
    const feedback = problems(proposal);
    if (feedback.length > 0) {
      try {
        const second = await localizeListing(input, feedback);
        const retry = cleanLocalizedProposal(app.store, second.output);
        attempts = 2;
        if (problems(retry).length <= feedback.length) {
          proposal = retry;
          model = second.model;
        }
      } catch (err) {
        if (!(err instanceof AiError)) throw err;
      }
    }
    const notes = [...proposal.notes];
    if (!market || market.autocomplete.length === 0) {
      notes.push("No hubo autocompletado de la tienda para ese país: la adaptación usa solo el criterio de la IA. Revisa las keywords.");
    }
    return { proposal: { ...proposal, notes: notes.slice(0, 5), attempts }, model };
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }
}

export type ReleaseNotesState = { result?: ReleaseNotes; model?: string; error?: string } | null;

/** «Notas de la versión»: Claude writes the «What's new» text of the next version for the editor's locale. Nothing is saved. */
export async function generateReleaseNotes(_prev: ReleaseNotesState, formData: FormData): Promise<ReleaseNotesState> {
  const appId = idSchema.parse(formData.get("appId"));
  const version = z.string().trim().max(30).catch("").parse(formData.get("version") ?? "");
  const changelog = z.string().trim().max(MAX_PASTED_CHANGELOG).safeParse(formData.get("changelog") ?? "");
  if (!changelog.success) {
    return { error: `El CHANGELOG pegado pasa de ${MAX_PASTED_CHANGELOG.toLocaleString("es-ES")} caracteres: pega solo la parte de esta versión.` };
  }

  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  const target = targetFrom(formData, app);
  const [product, rows, mainRow] = await Promise.all([
    getProductFacts(app.id),
    getKeywordRows(app),
    getListingDraft(appId, mainLocale(app.country), ""),
  ]);
  const features = product.features
    .filter((f) => f.status === "next_release" && f.advertise)
    .map((f) => ({ name: f.name, summary: f.summary }));
  const latest = product.releases[0];
  const latestRelease = latest ? { version: latest.version, notes: latest.notes } : null;
  if (!hasReleaseMaterial({ features, latestRelease, changelog: changelog.data })) {
    return { error: "No hay novedades de las que escribir: añade funciones «Próxima versión» en la ficha de producto o pega el CHANGELOG." };
  }
  const facts = factsForPrompt(product.facts, product.features, "next");
  const { lang } = getCountry(app.country);
  // Tracked keywords are in the main language: only suggested for listings in that language.
  const keywords = sharesMainLanguage(app.country, target)
    ? rows
        .filter((r) => isRelevantKeyword(r, lang))
        .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1))
        .slice(0, 10)
        .map((r) => r.term)
    : [];
  const { brands } = await detectBrands(app, rows, facts);
  const input = {
    store: app.store,
    locale: target.locale,
    brand: brandOf(mainRow?.draft.title || app.meta.title),
    version: version || null,
    features,
    latestRelease,
    changelog: changelog.data || null,
    facts,
    keywords,
  };
  const ctx = { lang: localeLanguage(target.locale), category: app.meta.category, brands };
  // What to send back for one more try: the text was cut to fit, or a store rule is broken.
  const errors = (r: ReleaseNotes) => [
    ...(r.trimmed ? [`The text had more than ${r.limit} characters and was cut; write it shorter.`] : []),
    ...r.issues.filter((i) => i.level !== "info").map((i) => `${i.ruleId ?? "length"}: ${i.text}`),
  ];

  try {
    const first = await writeReleaseNotes(input);
    let result = cleanReleaseNotes(app.store, first.output, ctx);
    let model = first.model;
    const feedback = errors(result);
    if (feedback.length > 0) {
      try {
        const second = await writeReleaseNotes(input, feedback);
        const retry = cleanReleaseNotes(app.store, second.output, ctx);
        if (errors(retry).length <= feedback.length) {
          result = retry;
          model = second.model;
        }
      } catch (err) {
        if (!(err instanceof AiError)) throw err;
      }
    }
    return { result, model };
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }
}

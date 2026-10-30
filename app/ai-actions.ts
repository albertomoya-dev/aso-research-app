"use server";

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AiError, rateRelevance, rewriteListing, suggestKeywords } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { followKeywords } from "@/lib/follow";
import { brandOf, cleanProposal, type ListingProposal, proposalFeedback } from "@/lib/listing-optimizer";
import type { MetadataDraft } from "@/lib/metadata-check";
import { FACTS_MODES } from "@/lib/product-facts";
import { productFactsPrompt } from "@/lib/product-queries";
import { getKeywordRows } from "@/lib/queries";
import { chunk, cleanRatings } from "@/lib/relevance";
import { rateAppKeywords, rateNewKeywords, relevanceContextFor, type RelevanceStatus } from "@/lib/relevance-jobs";
import { shiftDate, today } from "@/lib/ranking";
import { getAdapter } from "@/lib/stores";
import type { AppSummary } from "@/lib/stores/types";
import { competitorBrands, filterSuggestions, PROMPT_VERSION, seedWords } from "@/lib/suggestions";

const idSchema = z.coerce.number().int().positive();

/** Real signals for the prompt: tracked and rejected keywords, store autocomplete and the apps ranking for our keywords. */
async function gatherContext(app: typeof schema.apps.$inferSelect) {
  const db = getDb();
  // Keyword research looks ahead, so features of the next version count too.
  const [tracked, previous, snapshots, facts] = await Promise.all([
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
  ]);

  const competitors = new Map<string, AppSummary>();
  for (const s of snapshots) for (const a of s.top5) if (a.id !== app.storeId) competitors.set(a.id, a);

  const { lang } = getCountry(app.country);
  const adapter = getAdapter(app.store);
  const seeds = seedWords(app.meta.title, app.meta.category);
  const lists = await Promise.allSettled(seeds.map((seed) => adapter.suggest(seed, { country: app.country, lang })));
  const autocomplete = [...new Set(lists.flatMap((r) => (r.status === "fulfilled" ? r.value : [])))].slice(0, 60);

  return {
    // Pending ideas count as "already proposed" so a new run brings different ones.
    existing: [...tracked.map((t) => t.term), ...previous.filter((p) => p.status !== "dismissed").map((p) => p.term)],
    rejected: previous.filter((p) => p.status === "dismissed").map((p) => p.term),
    autocomplete,
    competitors: [...competitors.values()].slice(0, 25).map((c) => ({ title: c.title, developer: c.developer })),
    facts,
  };
}

export type GenerateState = { created?: number; dropped?: number; error?: string } | null;

export async function generateSuggestions(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const appId = idSchema.parse(formData.get("appId"));
  const focus = z.string().trim().max(200).catch("").parse(formData.get("focus") ?? "");
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };

  const context = await gatherContext(app);
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

  const brands = competitorBrands(context.competitors, app.meta.developer);
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

export type DraftState = { savedAt?: string; error?: string } | null;

export async function saveDraft(_prev: DraftState, formData: FormData): Promise<DraftState> {
  const appId = idSchema.parse(formData.get("appId"));
  const fields = Object.fromEntries(Object.keys(draftSchema.shape).map((k) => [k, formData.get(k) ?? ""]));
  const parsed = draftSchema.safeParse(fields);
  if (!parsed.success) return { error: "Algún campo es demasiado largo para guardarlo." };
  const draft: MetadataDraft = parsed.data;
  await getDb().update(schema.apps).set({ draft }).where(eq(schema.apps.id, appId));
  revalidatePath(`/apps/${appId}/metadata`);
  return { savedAt: new Date().toISOString() };
}

export async function discardDraft(formData: FormData) {
  const appId = idSchema.parse(formData.get("appId"));
  await getDb().update(schema.apps).set({ draft: null }).where(eq(schema.apps.id, appId));
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
  const competitors = new Map<string, AppSummary>();
  for (const r of rows) for (const a of r.top5) if (a.id !== app.storeId) competitors.set(a.id, a);
  const country = getCountry(app.country);
  const brand = brandOf(current.title || app.meta.title);
  const input = {
    store: app.store,
    countryName: country.name,
    lang: country.lang,
    developer: app.meta.developer,
    category: app.meta.category,
    current,
    keywords: rows,
    avoidBrands: competitorBrands([...competitors.values()], app.meta.developer),
    facts,
    version: app.meta.version,
    releaseNotes: app.meta.releaseNotes,
    focus: focus || undefined,
  };
  const tracked = rows.map((r) => r.term);

  try {
    let result = await rewriteListing(input);
    let proposal = cleanProposal(app.store, result.output, tracked);
    // One more try when a field is over its limit or the brand was dropped.
    const feedback = proposalFeedback(app.store, proposal, brand);
    if (feedback.length > 0) {
      result = await rewriteListing(input, feedback);
      proposal = cleanProposal(app.store, result.output, tracked);
    }
    return { proposal, model: result.model };
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }
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

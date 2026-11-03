"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { CANDIDATE_SOURCES, type CandidateSource } from "@/lib/candidate-sources";
import { dismissedCandidatesMessage, FOLLOW_SOURCE, MAX_MEASURE } from "@/lib/candidates";
import { getCountry } from "@/lib/countries";
import { followKeywords } from "@/lib/follow";
import { MAX_KEYWORD_LENGTH, normalizeKeyword } from "@/lib/keywords";
import { measureAutocomplete } from "@/lib/popularity";
import { rateNewKeywords, type RelevanceStatus } from "@/lib/relevance-jobs";
import { revalidateMarket } from "@/lib/revalidate";
import { getAdapter } from "@/lib/stores";

// Keywords › Encontrar: the same «Seguir», «Descartar» and «Medir popularidad» for every source. AI ideas
// keep their status in ai_suggestions; the rest go to keyword_candidates (see db/schema.ts).

const itemSchema = z.object({
  term: z.string().trim().min(1).max(MAX_KEYWORD_LENGTH),
  source: z.enum(CANDIDATE_SOURCES),
  suggestionId: z.number().int().positive().optional(),
  relevance: z.number().int().min(1).max(5).nullable().optional(),
  reason: z.string().max(500).optional(),
});
export type CandidateItem = z.infer<typeof itemSchema>;

const requestSchema = (max: number) => z.object({ appId: z.number().int().positive(), items: z.array(itemSchema).min(1).max(max) });

function parse(appId: number, items: CandidateItem[], max: number) {
  const parsed = requestSchema(max).safeParse({ appId, items });
  if (!parsed.success) return null;
  // One entry per term (the first source wins), normalized like keywords.term.
  const byTerm = new Map<string, CandidateItem>();
  for (const item of parsed.data.items) {
    const term = normalizeKeyword(item.term);
    if (!byTerm.has(term)) byTerm.set(term, { ...item, term });
  }
  return { appId: parsed.data.appId, items: [...byTerm.values()] };
}

/** Sets the status of non-AI candidates, creating their rows when they were only computed live. */
async function setCandidateStatus(appId: number, items: CandidateItem[], status: "followed" | "dismissed") {
  const rows = items.filter((i) => i.source !== "ai");
  if (rows.length === 0) return 0;
  const changed = await getDb()
    .insert(schema.keywordCandidates)
    .values(rows.map((i) => ({ appId, term: i.term, source: i.source, status, reason: i.reason ?? null, relevance: i.relevance ?? null })))
    .onConflictDoUpdate({
      target: [schema.keywordCandidates.appId, schema.keywordCandidates.term, schema.keywordCandidates.source],
      set: { status },
    })
    .returning({ id: schema.keywordCandidates.id });
  return changed.length;
}

export type FollowCandidatesState = { added?: number; trackingFailed?: boolean; relevance?: RelevanceStatus; error?: string };

/** «Seguir N»: follows the ticked candidates, each with the origin of its source, and marks them followed. */
export async function followCandidates(appId: number, items: CandidateItem[]): Promise<FollowCandidatesState> {
  const parsed = parse(appId, items, 200);
  if (!parsed) return { error: "Marca al menos una keyword." };
  const db = getDb();
  const aiIds = parsed.items.flatMap((i) => (i.source === "ai" && i.suggestionId ? [i.suggestionId] : []));
  // An AI idea brings its own relevance; the rest are rated by rateNewKeywords below.
  const ideas = aiIds.length
    ? await db
        .select({ id: schema.aiSuggestions.id, relevance: schema.aiSuggestions.relevance })
        .from(schema.aiSuggestions)
        .where(and(eq(schema.aiSuggestions.appId, parsed.appId), inArray(schema.aiSuggestions.id, aiIds)))
    : [];
  const ideaRelevance = new Map(ideas.map((i) => [i.id, i.relevance]));
  try {
    const { added, keywordIds, trackingFailed } = await followKeywords(
      parsed.appId,
      parsed.items.map((i) => ({
        term: i.term,
        source: FOLLOW_SOURCE[i.source],
        relevance: i.source === "ai" && i.suggestionId ? (ideaRelevance.get(i.suggestionId) ?? null) : null,
      })),
      "manual",
    );
    const relevance = await rateNewKeywords(parsed.appId, keywordIds);
    if (ideas.length > 0) {
      await db
        .update(schema.aiSuggestions)
        .set({ status: "accepted" })
        .where(inArray(schema.aiSuggestions.id, ideas.map((i) => i.id)));
    }
    await setCandidateStatus(parsed.appId, parsed.items, "followed");
    await revalidateMarket(parsed.appId, "", "layout");
    return { added, trackingFailed, relevance };
  } catch (err) {
    console.error("followCandidates", err);
    return { error: "No se han podido seguir las keywords. Inténtalo de nuevo." };
  }
}

export type DismissCandidatesState = { dismissed: number; message?: string; error?: string };

/**
 * «Descartar»: the same for every source. AI ideas are marked dismissed in ai_suggestions; the others are
 * stored dismissed in keyword_candidates. A dismissed term is hidden in every source from then on.
 */
export async function dismissCandidates(appId: number, items: CandidateItem[]): Promise<DismissCandidatesState> {
  const parsed = parse(appId, items, 500);
  if (!parsed) return { dismissed: 0, error: "Marca al menos una keyword." };
  try {
    const aiIds = parsed.items.flatMap((i) => (i.source === "ai" && i.suggestionId ? [i.suggestionId] : []));
    const ai = aiIds.length
      ? await getDb()
          .update(schema.aiSuggestions)
          .set({ status: "dismissed" })
          .where(and(eq(schema.aiSuggestions.appId, parsed.appId), inArray(schema.aiSuggestions.id, aiIds)))
          .returning({ id: schema.aiSuggestions.id })
      : [];
    const others = await setCandidateStatus(parsed.appId, parsed.items, "dismissed");
    const dismissed = ai.length + others;
    await revalidateMarket(parsed.appId, "", "layout");
    return { dismissed, message: dismissedCandidatesMessage(dismissed) };
  } catch (err) {
    console.error("dismissCandidates", err);
    return { dismissed: 0, error: "No se han podido descartar. Inténtalo de nuevo." };
  }
}

export type MeasureState = { measured: Record<string, number>; error?: string };

/**
 * «Medir popularidad»: the real autocomplete measure (up to 16 requests each) for at most MAX_MEASURE
 * candidates, stored as `popularity_measured`. Two at a time: Google Play answers 429 when pushed.
 */
export async function measureCandidates(appId: number, items: CandidateItem[]): Promise<MeasureState> {
  const parsed = parse(appId, items, MAX_MEASURE);
  if (!parsed) return { measured: {}, error: `Elige entre 1 y ${MAX_MEASURE} keywords para medir.` };
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, parsed.appId) });
  if (!app) return { measured: {}, error: "App no encontrada." };
  const adapter = getAdapter(app.store);
  const query = { country: app.country, lang: getCountry(app.country).lang };
  const limit = pLimit(2);
  const measured: Record<string, number> = {};
  let failed = 0;
  await Promise.all(
    parsed.items.map((item) =>
      limit(async () => {
        try {
          const { popularity } = await measureAutocomplete(item.term, (prefix) => adapter.suggest(prefix, query));
          measured[item.term] = popularity;
          await getDb()
            .insert(schema.keywordCandidates)
            .values({ appId: parsed.appId, term: item.term, source: item.source as CandidateSource, reason: item.reason ?? null, popularityMeasured: popularity })
            .onConflictDoUpdate({
              target: [schema.keywordCandidates.appId, schema.keywordCandidates.term, schema.keywordCandidates.source],
              set: { popularityMeasured: sql`excluded.popularity_measured` },
            });
        } catch (err) {
          console.error("measureCandidates", item.term, err);
          failed++;
        }
      }),
    ),
  );
  await revalidateMarket(parsed.appId, "", "layout");
  if (failed > 0) {
    return { measured, error: failed === parsed.items.length ? "La tienda no respondió. Prueba dentro de un rato." : `${failed} no se pudieron medir; prueba dentro de un rato.` };
  }
  return { measured };
}

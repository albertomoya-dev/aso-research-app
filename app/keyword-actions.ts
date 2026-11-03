"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AiError } from "@/lib/claude";
import { type KeywordPanelData, loadKeywordPanel } from "@/lib/keyword-panel";
import { KEYWORD_INTENTS } from "@/lib/relevance";
import { rateAppKeywords } from "@/lib/relevance-jobs";
import { revalidateMarket } from "@/lib/revalidate";

// Actions of the keyword table (phase 29): the detail panel and the selection bar.

const id = z.number().int().positive();

/** The detail panel of one keyword (`?k=`), loaded when a row is opened without leaving the table. */
export async function loadKeywordPanelAction(appId: number, keywordId: number): Promise<KeywordPanelData | null> {
  const parsed = z.object({ appId: id, keywordId: id }).safeParse({ appId, keywordId });
  if (!parsed.success) return null;
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, parsed.data.appId) });
  if (!app) return null;
  return loadKeywordPanel(app, parsed.data.keywordId);
}

/**
 * «Cambiar relevancia» of the selection: the user's own value for every keyword ticked, so the AI never
 * changes them again. 3 or more also clears a «foreign intent» mark, like setKeywordRelevance.
 */
export async function setKeywordsRelevance(appId: number, keywordIds: number[], relevance: number): Promise<{ updated: number; error?: string }> {
  const parsed = z
    .object({ appId: id, keywordIds: z.array(id).min(1).max(500), relevance: z.number().int().min(1).max(5) })
    .safeParse({ appId, keywordIds, relevance });
  if (!parsed.success) return { updated: 0, error: "La relevancia va de 1 a 5." };
  const updated = await getDb()
    .update(schema.appKeywords)
    .set({
      relevance: parsed.data.relevance,
      relevanceSource: "user",
      relevanceCheckedAt: new Date(),
      ...(parsed.data.relevance >= 3 ? { intent: "own" as const } : {}),
    })
    .where(and(eq(schema.appKeywords.appId, parsed.data.appId), inArray(schema.appKeywords.keywordId, parsed.data.keywordIds)))
    .returning({ keywordId: schema.appKeywords.keywordId });
  await revalidateMarket(parsed.data.appId, "", "layout");
  return { updated: updated.length };
}

/** The intent of a keyword, set by hand in the detail panel: people searching it want an app like yours, or another kind. */
export async function setKeywordIntent(appId: number, keywordId: number, intent: string): Promise<{ error?: string }> {
  const parsed = z.object({ appId: id, keywordId: id, intent: z.enum(KEYWORD_INTENTS) }).safeParse({ appId, keywordId, intent });
  if (!parsed.success) return { error: "Intención no válida." };
  await getDb()
    .update(schema.appKeywords)
    .set({ intent: parsed.data.intent })
    .where(and(eq(schema.appKeywords.appId, parsed.data.appId), eq(schema.appKeywords.keywordId, parsed.data.keywordId)));
  await revalidateMarket(parsed.data.appId, "", "layout");
  return {};
}

/** «Recalcular con IA» of the selection: rates the ticked keywords again, except those the user rated. */
export async function recalculateSelected(appId: number, keywordIds: number[]): Promise<{ rated: number; asked: number; error?: string }> {
  const parsed = z.object({ appId: id, keywordIds: z.array(id).min(1).max(500) }).safeParse({ appId, keywordIds });
  if (!parsed.success) return { rated: 0, asked: 0, error: "Selecciona al menos una keyword." };
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, parsed.data.appId) });
  if (!app) return { rated: 0, asked: 0, error: "App no encontrada." };
  try {
    const report = await rateAppKeywords(app, { keywordIds: parsed.data.keywordIds });
    await revalidateMarket(parsed.data.appId, "", "layout");
    return { rated: report.rated, asked: report.asked, error: report.error && report.rated === 0 ? report.error : undefined };
  } catch (err) {
    if (err instanceof AiError) return { rated: 0, asked: 0, error: err.message };
    throw err;
  }
}

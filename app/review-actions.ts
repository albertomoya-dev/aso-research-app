"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AiError, analyzeReviews } from "@/lib/claude";
import { getCountry, isCountry } from "@/lib/countries";
import { productFactsPrompt } from "@/lib/product-queries";
import { EMPTY_REVIEW_ANALYSIS, MAX_REVIEWS, NO_REVIEWS_MODEL, ratingStats, REVIEW_PROMPT_VERSION } from "@/lib/review-analysis";
import { resolveReviewTarget } from "@/lib/review-queries";
import { getAdapter } from "@/lib/stores";
import { STORE_LABEL } from "@/lib/stores/types";

export type AnalyzeState = { error?: string; ok?: boolean } | null;

const inputSchema = z.object({
  appId: z.coerce.number().int().positive(),
  target: z.string().trim().min(1).max(200),
  country: z.string().trim().toLowerCase().refine(isCountry).optional(),
});

export async function analyzeReviewsAction(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const input = inputSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Datos no válidos: elige una app y un país de la lista." };
  const { appId, target, country: countryCode } = input.data;
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  // Our app, a watched competitor or an app seen in this app's TOP 5 (checked on the server).
  const resolved = await resolveReviewTarget(app, target);
  if (!resolved) return { error: "Solo se pueden analizar tu app, tus competidores vigilados y las apps de tu TOP 5." };
  const { title, own } = resolved;
  const country = getCountry(countryCode ?? app.country);

  let reviews;
  try {
    reviews = await getAdapter(app.store).getReviews(target, { country: country.code, lang: country.lang, limit: MAX_REVIEWS });
  } catch (error) {
    return { error: `No se pudieron leer las reseñas: ${error instanceof Error ? error.message : String(error)}` };
  }
  const row = { appId, targetStoreId: target, targetTitle: title, country: country.code, stats: ratingStats(reviews), promptVersion: REVIEW_PROMPT_VERSION };
  if (reviews.length === 0) {
    // Not an error: the store has nothing recent. Stored so the page says so after a reload.
    await db.insert(schema.reviewAnalyses).values({ ...row, result: EMPTY_REVIEW_ANALYSIS, model: NO_REVIEWS_MODEL });
    revalidatePath(`/apps/${appId}/resenas`);
    return { ok: true };
  }

  // Users review the published version. For our app the facts describe the reviewed app; for a
  // competitor they describe ours, to find the complaints we already solve.
  const facts = await productFactsPrompt(appId, "published");

  try {
    const { output, model } = await analyzeReviews({
      appTitle: title,
      storeName: STORE_LABEL[app.store],
      countryName: country.name,
      lang: country.lang,
      reviews,
      facts: own ? facts : null,
      ourFacts: own ? null : facts,
      version: own ? app.meta.version : null,
    });
    await db.insert(schema.reviewAnalyses).values({ ...row, result: { ...output, opportunities: own ? [] : output.opportunities }, model });
  } catch (error) {
    if (error instanceof AiError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/apps/${appId}/resenas`);
  return { ok: true };
}

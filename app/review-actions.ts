"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AiError, analyzeReviews } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { MAX_REVIEWS, ratingStats, REVIEW_PROMPT_VERSION } from "@/lib/review-analysis";
import { getAdapter } from "@/lib/stores";
import { STORE_LABEL } from "@/lib/stores/types";

export type AnalyzeState = { error?: string; ok?: boolean } | null;

const inputSchema = z.object({ appId: z.coerce.number().int().positive(), target: z.string().trim().min(1).max(200) });

export async function analyzeReviewsAction(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const { appId, target } = inputSchema.parse(Object.fromEntries(formData));
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  // Only our app or a competitor we watch can be analysed.
  const competitor =
    target === app.storeId
      ? null
      : await db.query.competitors.findFirst({ where: and(eq(schema.competitors.appId, appId), eq(schema.competitors.storeId, target)) });
  if (target !== app.storeId && !competitor) return { error: "Vigila primero esa app en Competidores." };
  const title = competitor?.title ?? app.title;
  const country = getCountry(app.country);

  let reviews;
  try {
    reviews = await getAdapter(app.store).getReviews(target, { country: app.country, lang: country.lang, limit: MAX_REVIEWS });
  } catch (error) {
    return { error: `No se pudieron leer las reseñas: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (reviews.length === 0) return { error: `${title} no tiene reseñas recientes en ${country.name}.` };

  try {
    const { output, model } = await analyzeReviews({
      appTitle: title,
      storeName: STORE_LABEL[app.store],
      countryName: country.name,
      lang: country.lang,
      reviews,
    });
    await db.insert(schema.reviewAnalyses).values({
      appId,
      targetStoreId: target,
      targetTitle: title,
      stats: ratingStats(reviews),
      result: output,
      model,
      promptVersion: REVIEW_PROMPT_VERSION,
    });
  } catch (error) {
    if (error instanceof AiError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/apps/${appId}/resenas`);
  return { ok: true };
}

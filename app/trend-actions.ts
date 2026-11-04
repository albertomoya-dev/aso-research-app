"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { marketPath, marketRef } from "@/lib/products";
import { today } from "@/lib/ranking";
import { prepareAnnotation, prepareFocus } from "@/lib/trends-view";
import { addAnnotation } from "./actions";

const prepareSchema = z.object({
  appId: z.coerce.number().int().positive(),
  keywordId: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(0).max(11),
  days: z.coerce.number().int().min(0).max(366),
});

/**
 * «Preparar» of a coming peak on Tendencias: leaves an annotation «Preparar temporada: <keyword>» (three
 * weeks before the peak, or today) and opens the listing editor with the seasonal focus in `?focus=`.
 * It does NOT create a draft: there is one draft per (app, language, country) and a new one would replace
 * the main draft (PLAN_REDISENO_UX §1, row 6.7). Named drafts are left for later.
 */
export async function prepareSeason(formData: FormData) {
  const { appId, keywordId, month, days } = prepareSchema.parse(Object.fromEntries(formData));
  const db = getDb();
  const [row] = await db
    .select({ term: schema.keywords.term })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .where(and(eq(schema.appKeywords.appId, appId), eq(schema.appKeywords.keywordId, keywordId)));
  const ref = await marketRef(appId);
  if (!row || !ref) throw new Error("Keyword no encontrada en esta app.");

  const note = prepareAnnotation(row.term, days, today());
  const data = new FormData();
  data.set("appId", String(appId));
  data.set("date", note.date);
  data.set("label", note.label);
  const state = await addAnnotation(null, data);
  if (state?.error) throw new Error(state.error);

  const focus = encodeURIComponent(prepareFocus(row.term, month));
  redirect(marketPath(ref, `/ficha?focus=${focus}`));
}

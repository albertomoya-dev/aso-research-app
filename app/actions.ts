"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getCountry, isCountry } from "@/lib/countries";
import { generateRankAlerts } from "@/lib/alert-jobs";
import { followKeywords } from "@/lib/follow";
import { parseKeywords } from "@/lib/keywords";
import { today } from "@/lib/ranking";
import { trackRankings } from "@/lib/tracking";
import { getAdapter } from "@/lib/stores";

const followSchema = z.object({
  store: z.enum(["ios", "android"]),
  id: z.string().trim().min(1).max(200),
  country: z.string().refine(isCountry, "País no soportado"),
});

/** Saves the app with its current store listing and opens its page. */
export async function followApp(formData: FormData) {
  const { store, id, country } = followSchema.parse(Object.fromEntries(formData));
  const { lang } = getCountry(country);
  const meta = await getAdapter(store).getApp(id, { country, lang });

  const values = {
    store,
    storeId: meta.id,
    country,
    title: meta.title,
    developer: meta.developer,
    icon: meta.icon,
    url: meta.url,
    meta,
    metaFetchedAt: new Date(),
  };
  const [app] = await getDb()
    .insert(schema.apps)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.apps.store, schema.apps.storeId, schema.apps.country],
      set: values,
    })
    .returning({ id: schema.apps.id });

  revalidatePath("/");
  redirect(`/apps/${app.id}`);
}

const appIdSchema = z.coerce.number().int().positive();

export async function refreshAppMeta(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) throw new Error("App no encontrada");

  const meta = await getAdapter(app.store).getApp(app.storeId, {
    country: app.country,
    lang: getCountry(app.country).lang,
  });
  await db
    .update(schema.apps)
    .set({ title: meta.title, developer: meta.developer, icon: meta.icon, url: meta.url, meta, metaFetchedAt: new Date() })
    .where(eq(schema.apps.id, appId));
  revalidatePath(`/apps/${appId}`);
}

export type AddKeywordsState = { added: number; skipped: number; error?: string; trackingFailed?: boolean } | null;

export async function addKeywords(_prev: AddKeywordsState, formData: FormData): Promise<AddKeywordsState> {
  const appId = appIdSchema.parse(formData.get("appId"));
  // A textarea sends one value; the discovery checklist sends one per ticked keyword.
  const terms = parseKeywords(formData.getAll("keywords").join("\n"));
  const source = z.enum(["manual", "autocomplete", "ai"]).catch("manual").parse(formData.get("source"));
  if (terms.length === 0) return { added: 0, skipped: 0, error: "Escribe al menos una keyword." };

  const { added, trackingFailed } = await followKeywords(
    appId,
    terms.map((term) => ({ term })),
    source,
  );
  revalidatePath(`/apps/${appId}`, "layout");
  return { added, skipped: terms.length - added, trackingFailed };
}

export async function removeKeyword(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  const keywordId = appIdSchema.parse(formData.get("keywordId"));
  await getDb()
    .delete(schema.appKeywords)
    .where(and(eq(schema.appKeywords.appId, appId), eq(schema.appKeywords.keywordId, keywordId)));
  revalidatePath(`/apps/${appId}`);
}

export async function unfollowApp(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  await getDb().delete(schema.apps).where(eq(schema.apps.id, appId));
  revalidatePath("/");
  redirect("/");
}

export async function refreshRankings(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  const report = await trackRankings({ appId });
  await generateRankAlerts(today());
  revalidatePath("/", "layout");
  if (report.errors.length > 0 && report.searches === 0) {
    throw new Error(`No se pudo consultar la tienda: ${report.errors[0].message}`);
  }
}

const annotationSchema = z.object({
  appId: z.coerce.number().int().positive(),
  date: z.iso.date(),
  label: z.string().trim().min(1, "Escribe qué cambió").max(120),
});

export type AnnotationState = { error?: string; ok?: boolean } | null;

export async function addAnnotation(_prev: AnnotationState, formData: FormData): Promise<AnnotationState> {
  const parsed = annotationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await getDb().insert(schema.annotations).values(parsed.data);
  revalidatePath(`/apps/${parsed.data.appId}`, "layout");
  return { ok: true };
}

export async function removeAnnotation(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  const id = appIdSchema.parse(formData.get("annotationId"));
  await getDb()
    .delete(schema.annotations)
    .where(and(eq(schema.annotations.id, id), eq(schema.annotations.appId, appId)));
  revalidatePath(`/apps/${appId}`, "layout");
}

"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getCountry, isCountry } from "@/lib/countries";
import { parseKeywords } from "@/lib/keywords";
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

export type AddKeywordsState = { added: number; skipped: number; error?: string } | null;

export async function addKeywords(_prev: AddKeywordsState, formData: FormData): Promise<AddKeywordsState> {
  const appId = appIdSchema.parse(formData.get("appId"));
  const terms = parseKeywords(String(formData.get("keywords") ?? ""));
  if (terms.length === 0) return { added: 0, skipped: 0, error: "Escribe al menos una keyword." };

  const db = getDb();
  await db
    .insert(schema.keywords)
    .values(terms.map((term) => ({ term })))
    .onConflictDoNothing();
  const rows = await db
    .select({ id: schema.keywords.id })
    .from(schema.keywords)
    .where(inArray(schema.keywords.term, terms));
  const inserted = await db
    .insert(schema.appKeywords)
    .values(rows.map((k) => ({ appId, keywordId: k.id, source: "manual" as const })))
    .onConflictDoNothing()
    .returning({ keywordId: schema.appKeywords.keywordId });

  revalidatePath(`/apps/${appId}`);
  return { added: inserted.length, skipped: terms.length - inserted.length };
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

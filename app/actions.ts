"use server";

import { and, asc, eq, inArray, notExists } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getCountry, isCountry } from "@/lib/countries";
import { generateRankAlerts } from "@/lib/alert-jobs";
import { followKeywords } from "@/lib/follow";
import { KEYWORD_SOURCES, parseKeywords } from "@/lib/keywords";
import { recordOwnListing } from "@/lib/own-listings";
import { KEYWORD_INTENTS, RELEVANCE_SOURCES } from "@/lib/relevance";
import { rateNewKeywords, type RelevanceStatus } from "@/lib/relevance-jobs";
import { today } from "@/lib/ranking";
import { trackRankings } from "@/lib/tracking";
import { ensureProduct, marketPath } from "@/lib/products";
import { revalidateMarket } from "@/lib/revalidate";
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
  // The app as a whole: created the first time it is followed, shared by every country after that.
  const product = await ensureProduct({ store, storeId: meta.id, title: meta.title, icon: meta.icon });

  const values = {
    productId: product.id,
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
  // Baseline for the automatic annotations (or an annotation, if the app was already followed and changed).
  await recordOwnListing(app.id, meta);

  revalidatePath("/", "layout");
  redirect(marketPath({ productSlug: product.slug, country }));
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
  // Same path as the daily job: a changed listing leaves an automatic annotation.
  await recordOwnListing(appId, meta);
  await revalidateMarket(appId, "", "layout");
}

export type AddKeywordsState = {
  added: number;
  skipped: number;
  error?: string;
  trackingFailed?: boolean;
  /** Whether the AI rated the new keywords (see rateNewKeywords). */
  relevance?: RelevanceStatus;
} | null;

export async function addKeywords(_prev: AddKeywordsState, formData: FormData): Promise<AddKeywordsState> {
  const appId = appIdSchema.parse(formData.get("appId"));
  // A textarea sends one value; the discovery checklist sends one per ticked keyword.
  const terms = parseKeywords(formData.getAll("keywords").join("\n"));
  const source = z.enum(KEYWORD_SOURCES).catch("manual").parse(formData.get("source"));
  if (terms.length === 0) return { added: 0, skipped: 0, error: "Escribe al menos una keyword." };

  const { added, keywordIds, trackingFailed } = await followKeywords(
    appId,
    terms.map((term) => ({ term })),
    source,
  );
  const relevance = await rateNewKeywords(appId, keywordIds);
  await revalidateMarket(appId, "", "layout");
  return { added, skipped: terms.length - added, trackingFailed, relevance };
}

export async function removeKeyword(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  const keywordId = appIdSchema.parse(formData.get("keywordId"));
  await getDb()
    .delete(schema.appKeywords)
    .where(and(eq(schema.appKeywords.appId, appId), eq(schema.appKeywords.keywordId, keywordId)));
  await revalidateMarket(appId);
}

const removeSchema = z.object({
  appId: z.number().int().positive(),
  keywordIds: z.array(z.number().int().positive()).min(1).max(500),
});

/** A removed keyword with everything needed to put it back. Dates as ISO strings. */
export type RemovedKeyword = {
  keywordId: number;
  term: string;
  source: (typeof KEYWORD_SOURCES)[number];
  relevance: number | null;
  relevanceSource: (typeof RELEVANCE_SOURCES)[number] | null;
  intent: (typeof KEYWORD_INTENTS)[number] | null;
  relevanceCheckedAt: string | null;
  createdAt: string;
};

export type RemoveKeywordsResult = { removed: RemovedKeyword[]; error?: string };

/**
 * Stops following several keywords at once. Returns the removed rows so «Deshacer» can put them back.
 * The position history is kept (it belongs to the keyword, not to the app's list).
 */
export async function removeKeywords(appId: number, keywordIds: number[]): Promise<RemoveKeywordsResult> {
  const parsed = removeSchema.safeParse({ appId, keywordIds });
  if (!parsed.success) return { removed: [], error: "Selecciona al menos una keyword." };
  const where = and(eq(schema.appKeywords.appId, parsed.data.appId), inArray(schema.appKeywords.keywordId, parsed.data.keywordIds));
  const db = getDb();
  const rows = await db
    .select({
      keywordId: schema.appKeywords.keywordId,
      term: schema.keywords.term,
      source: schema.appKeywords.source,
      relevance: schema.appKeywords.relevance,
      relevanceSource: schema.appKeywords.relevanceSource,
      intent: schema.appKeywords.intent,
      relevanceCheckedAt: schema.appKeywords.relevanceCheckedAt,
      createdAt: schema.appKeywords.createdAt,
    })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .where(where);
  await db.delete(schema.appKeywords).where(where);
  await revalidateMarket(parsed.data.appId, "", "layout");
  return {
    removed: rows.map((r) => ({ ...r, relevanceCheckedAt: r.relevanceCheckedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() })),
  };
}

const restoreSchema = z.object({
  appId: z.number().int().positive(),
  rows: z
    .array(
      z.object({
        keywordId: z.number().int().positive(),
        source: z.enum(KEYWORD_SOURCES),
        relevance: z.number().int().min(1).max(5).nullable(),
        relevanceSource: z.enum(RELEVANCE_SOURCES).nullable(),
        intent: z.enum(KEYWORD_INTENTS).nullable(),
        relevanceCheckedAt: z.iso.datetime().nullable(),
        createdAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(500),
});

/** «Deshacer»: follows again the keywords just removed, with their origin, relevance and date. */
export async function restoreKeywords(appId: number, rows: RemovedKeyword[]): Promise<{ restored: number; error?: string }> {
  const parsed = restoreSchema.safeParse({ appId, rows });
  if (!parsed.success) return { restored: 0, error: "No se pudieron recuperar las keywords." };
  const restored = await getDb()
    .insert(schema.appKeywords)
    .values(
      parsed.data.rows.map((r) => ({
        ...r,
        appId: parsed.data.appId,
        relevanceCheckedAt: r.relevanceCheckedAt ? new Date(r.relevanceCheckedAt) : null,
        createdAt: new Date(r.createdAt),
      })),
    )
    .onConflictDoNothing()
    .returning({ keywordId: schema.appKeywords.keywordId });
  await revalidateMarket(parsed.data.appId, "", "layout");
  return { restored: restored.length };
}

export async function unfollowApp(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  const db = getDb();
  // Only the market goes (its keywords, rankings, reviews, drafts…). The app-wide data (product sheet,
  // brand exceptions, creatives) belongs to the product and stays while another country is followed.
  const [removed] = await db.delete(schema.apps).where(eq(schema.apps.id, appId)).returning({ productId: schema.apps.productId });
  let next = "/";
  if (removed) {
    // The last market gone: the product goes too, and its data with it by cascade (its slug is free again).
    await db
      .delete(schema.products)
      .where(
        and(
          eq(schema.products.id, removed.productId),
          notExists(db.select({ id: schema.apps.id }).from(schema.apps).where(eq(schema.apps.productId, removed.productId))),
        ),
      );
    // Otherwise, on to the product's next market.
    const [other] = await db
      .select({ productSlug: schema.products.slug, country: schema.apps.country })
      .from(schema.apps)
      .innerJoin(schema.products, eq(schema.products.id, schema.apps.productId))
      .where(eq(schema.apps.productId, removed.productId))
      .orderBy(asc(schema.apps.id))
      .limit(1);
    if (other) next = marketPath(other);
  }
  revalidatePath("/", "layout");
  redirect(next);
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
  await revalidateMarket(parsed.data.appId, "", "layout");
  return { ok: true };
}

export async function removeAnnotation(formData: FormData) {
  const appId = appIdSchema.parse(formData.get("appId"));
  const id = appIdSchema.parse(formData.get("annotationId"));
  await getDb()
    .delete(schema.annotations)
    .where(and(eq(schema.annotations.id, id), eq(schema.annotations.appId, appId)));
  await revalidateMarket(appId, "", "layout");
}

const countrySchema = z.object({
  appId: z.coerce.number().int().positive(),
  country: z.string().refine(isCountry, "País no soportado"),
  copyKeywords: z.literal("on").optional(),
});

/** Follows the same app in another country's store, optionally with the same keywords, and opens it. */
export async function followInCountry(formData: FormData) {
  const { appId, country, copyKeywords } = countrySchema.parse(Object.fromEntries(formData));
  const db = getDb();
  const source = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!source) throw new Error("App no encontrada");
  const meta = await getAdapter(source.store).getApp(source.storeId, { country, lang: getCountry(country).lang });
  const values = {
    // Same product as the market it was added from.
    productId: source.productId,
    store: source.store,
    storeId: meta.id,
    country,
    title: meta.title,
    developer: meta.developer,
    icon: meta.icon,
    url: meta.url,
    meta,
    metaFetchedAt: new Date(),
  };
  const [app] = await db
    .insert(schema.apps)
    .values(values)
    .onConflictDoUpdate({ target: [schema.apps.store, schema.apps.storeId, schema.apps.country], set: values })
    .returning({ id: schema.apps.id });

  if (copyKeywords) {
    const terms = await db
      .select({
        term: schema.keywords.term,
        source: schema.appKeywords.source,
        relevance: schema.appKeywords.relevance,
        relevanceSource: schema.appKeywords.relevanceSource,
        intent: schema.appKeywords.intent,
      })
      .from(schema.appKeywords)
      .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
      .where(eq(schema.appKeywords.appId, appId));
    await followKeywords(
      app.id,
      // Same origin and relevance as in the original country.
      terms,
      "manual",
    );
  }
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, source.productId) });
  revalidatePath("/", "layout");
  redirect(product ? marketPath({ productSlug: product.slug, country }) : "/");
}

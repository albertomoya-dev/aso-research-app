"use server";

import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AiError, importChangelog } from "@/lib/claude";
import {
  type ChangelogProposal,
  changelogApplySchema,
  cleanChangelogProposal,
  factsFormSchema,
  featureInputSchema,
  MAX_CHANGELOG_CHARS,
  releaseInputSchema,
} from "@/lib/product-facts";
import { marketProductId } from "@/lib/products";
import { revalidateProduct } from "@/lib/revalidate";

const idSchema = z.coerce.number().int().positive();

type Owner = { marketId: number; productId: number };

// The sheet feeds every AI screen of the app (editor, ideas, creatives, reviews) in every country, so refresh them all.
const refresh = (owner: Owner) => revalidateProduct(owner.marketId, "", "layout");

/**
 * The form's market (`appId`, any country of the app) and its product, which owns the sheet: every
 * country shares it. Null when the market does not exist.
 */
async function sheetOwner(formData: FormData): Promise<Owner | null> {
  const marketId = idSchema.parse(formData.get("appId"));
  const productId = await marketProductId(marketId);
  return productId === null ? null : { marketId, productId };
}

export type FactsState = { savedAt?: string; error?: string } | null;

export async function saveFacts(_prev: FactsState, formData: FormData): Promise<FactsState> {
  const owner = await sheetOwner(formData);
  const fields = Object.fromEntries(Object.keys(factsFormSchema.shape).map((k) => [k, formData.get(k) ?? ""]));
  const parsed = factsFormSchema.safeParse(fields);
  if (!parsed.success) return { error: "Algún campo es demasiado largo para guardarlo." };
  if (!owner) return { error: "App no encontrada." };
  const values = { ...parsed.data, updatedAt: new Date() };
  await getDb()
    .insert(schema.productFacts)
    .values({ productId: owner.productId, ...values })
    .onConflictDoUpdate({ target: schema.productFacts.productId, set: values });
  await refresh(owner);
  return { savedAt: new Date().toISOString() };
}

function featureFromForm(formData: FormData) {
  return featureInputSchema.safeParse({
    name: formData.get("name") ?? "",
    summary: formData.get("summary") ?? "",
    status: formData.get("status"),
    sinceVersion: formData.get("sinceVersion") ?? "",
    advertise: formData.get("advertise") === "on",
  });
}

async function nextSort(productId: number) {
  const [row] = await getDb()
    .select({ sort: max(schema.productFeatures.sort) })
    .from(schema.productFeatures)
    .where(eq(schema.productFeatures.productId, productId));
  return (row?.sort ?? -1) + 1;
}

/** What a sheet form gets back: an error to show, or nothing when it was saved. */
export type SheetItemResult = { error?: string };

/** The first message of a failed parse (the schemas carry the Spanish ones). */
const firstIssue = (error: z.ZodError, fallback: string) => error.issues[0]?.message || fallback;

export async function addFeature(formData: FormData): Promise<SheetItemResult> {
  const owner = await sheetOwner(formData);
  const parsed = featureFromForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error, "Revisa los campos de la función.") };
  if (!owner) return { error: "App no encontrada." };
  await getDb()
    .insert(schema.productFeatures)
    .values({ productId: owner.productId, ...parsed.data, sort: await nextSort(owner.productId) });
  await refresh(owner);
  return {};
}

export async function updateFeature(formData: FormData): Promise<SheetItemResult> {
  const owner = await sheetOwner(formData);
  const id = idSchema.parse(formData.get("featureId"));
  const parsed = featureFromForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error, "Revisa los campos de la función.") };
  if (!owner) return { error: "App no encontrada." };
  await getDb()
    .update(schema.productFeatures)
    .set(parsed.data)
    .where(and(eq(schema.productFeatures.id, id), eq(schema.productFeatures.productId, owner.productId)));
  await refresh(owner);
  return {};
}

export async function deleteFeature(formData: FormData) {
  const owner = await sheetOwner(formData);
  const id = idSchema.parse(formData.get("featureId"));
  if (!owner) return;
  await getDb()
    .delete(schema.productFeatures)
    .where(and(eq(schema.productFeatures.id, id), eq(schema.productFeatures.productId, owner.productId)));
  await refresh(owner);
}

function releaseFromForm(formData: FormData) {
  return releaseInputSchema.safeParse({
    version: formData.get("version") ?? "",
    date: formData.get("date") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function addRelease(formData: FormData): Promise<SheetItemResult> {
  const owner = await sheetOwner(formData);
  const parsed = releaseFromForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error, "Revisa los campos de la versión.") };
  if (!owner) return { error: "App no encontrada." };
  await getDb()
    .insert(schema.productReleases)
    .values({ productId: owner.productId, ...parsed.data });
  await refresh(owner);
  return {};
}

export async function updateRelease(formData: FormData): Promise<SheetItemResult> {
  const owner = await sheetOwner(formData);
  const id = idSchema.parse(formData.get("releaseId"));
  const parsed = releaseFromForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error, "Revisa los campos de la versión.") };
  if (!owner) return { error: "App no encontrada." };
  await getDb()
    .update(schema.productReleases)
    .set(parsed.data)
    .where(and(eq(schema.productReleases.id, id), eq(schema.productReleases.productId, owner.productId)));
  await refresh(owner);
  return {};
}

export async function deleteRelease(formData: FormData) {
  const owner = await sheetOwner(formData);
  const id = idSchema.parse(formData.get("releaseId"));
  if (!owner) return;
  await getDb()
    .delete(schema.productReleases)
    .where(and(eq(schema.productReleases.id, id), eq(schema.productReleases.productId, owner.productId)));
  await refresh(owner);
}

export type ChangelogState = { proposal?: ChangelogProposal; model?: string; error?: string } | null;

/** Asks Claude for the features in a pasted CHANGELOG. Nothing is saved: the owner ticks what to keep. */
export async function proposeChangelog(_prev: ChangelogState, formData: FormData): Promise<ChangelogState> {
  const owner = await sheetOwner(formData);
  const text = z.string().trim().catch("").parse(formData.get("changelog"));
  if (!text) return { error: "Pega el CHANGELOG o las notas de versión." };
  if (text.length > MAX_CHANGELOG_CHARS) return { error: `El texto es demasiado largo: como mucho ${MAX_CHANGELOG_CHARS.toLocaleString("es-ES")} caracteres.` };
  if (!owner) return { error: "App no encontrada." };
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, owner.marketId) });
  if (!app) return { error: "App no encontrada." };
  const existing = await db.select().from(schema.productFeatures).where(eq(schema.productFeatures.productId, owner.productId));
  try {
    const { output, model } = await importChangelog(text, {
      appTitle: app.title,
      publishedVersion: app.meta.version,
      existing: existing.map((f) => ({ name: f.name, status: f.status, sinceVersion: f.sinceVersion })),
    });
    const proposal = cleanChangelogProposal(output, existing);
    if (proposal.features.length === 0 && proposal.releases.length === 0) {
      return { error: "Claude no encontró funciones nuevas ni cambios en ese texto." };
    }
    return { proposal, model };
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    throw err;
  }
}

export type ApplyState = { features?: number; releases?: number; error?: string } | null;

/** Saves only the items the owner ticked in the import review. */
export async function applyChangelog(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const owner = await sheetOwner(formData);
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "No se pudo leer la selección." };
  }
  const parsed = changelogApplySchema.safeParse(payload);
  if (!parsed.success) return { error: "La selección no tiene un formato válido." };
  const { features, releases } = parsed.data;
  if (features.length === 0 && releases.length === 0) return { error: "Marca al menos una función o versión." };
  if (!owner) return { error: "App no encontrada." };
  const { productId } = owner;

  const db = getDb();
  let sort = await nextSort(productId);
  for (const { existingId, advertise, ...f } of features) {
    if (existingId) {
      // An update never touches `advertise`: hiding a feature from the listing is the owner's call.
      await db
        .update(schema.productFeatures)
        .set(f)
        .where(and(eq(schema.productFeatures.id, existingId), eq(schema.productFeatures.productId, productId)));
    } else {
      await db.insert(schema.productFeatures).values({ productId, ...f, advertise, sort: sort++ });
    }
  }
  // A version already in the history is updated, not duplicated.
  const known = releases.length
    ? await db
        .select({ id: schema.productReleases.id, version: schema.productReleases.version })
        .from(schema.productReleases)
        .where(and(eq(schema.productReleases.productId, productId), inArray(schema.productReleases.version, releases.map((r) => r.version))))
    : [];
  const idByVersion = new Map(known.map((r) => [r.version, r.id]));
  for (const r of releases) {
    const id = idByVersion.get(r.version);
    if (id) await db.update(schema.productReleases).set(r).where(eq(schema.productReleases.id, id));
    else await db.insert(schema.productReleases).values({ productId, ...r });
  }
  await refresh(owner);
  return { features: features.length, releases: releases.length };
}

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
import { sharedAppId } from "@/lib/products";
import { revalidateProduct } from "@/lib/revalidate";

const idSchema = z.coerce.number().int().positive();

// The sheet feeds every AI screen of the app (editor, ideas, creatives, reviews) in every country, so refresh them all.
const refresh = (appId: number) => revalidateProduct(appId, "", "layout");

/** The sheet is the app's, not the country's: it lives on the primary market (lib/products.ts `sharedAppId`). */
async function productAppId(formData: FormData) {
  return sharedAppId(idSchema.parse(formData.get("appId")));
}

async function appExists(appId: number) {
  return Boolean(await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId), columns: { id: true } }));
}

export type FactsState = { savedAt?: string; error?: string } | null;

export async function saveFacts(_prev: FactsState, formData: FormData): Promise<FactsState> {
  const appId = await productAppId(formData);
  const fields = Object.fromEntries(Object.keys(factsFormSchema.shape).map((k) => [k, formData.get(k) ?? ""]));
  const parsed = factsFormSchema.safeParse(fields);
  if (!parsed.success) return { error: "Algún campo es demasiado largo para guardarlo." };
  if (!(await appExists(appId))) return { error: "App no encontrada." };
  const values = { ...parsed.data, updatedAt: new Date() };
  await getDb()
    .insert(schema.productFacts)
    .values({ appId, ...values })
    .onConflictDoUpdate({ target: schema.productFacts.appId, set: values });
  await refresh(appId);
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

async function nextSort(appId: number) {
  const [row] = await getDb()
    .select({ sort: max(schema.productFeatures.sort) })
    .from(schema.productFeatures)
    .where(eq(schema.productFeatures.appId, appId));
  return (row?.sort ?? -1) + 1;
}

export async function addFeature(formData: FormData) {
  const appId = await productAppId(formData);
  const parsed = featureFromForm(formData);
  if (!parsed.success || !(await appExists(appId))) return;
  await getDb()
    .insert(schema.productFeatures)
    .values({ appId, ...parsed.data, sort: await nextSort(appId) });
  await refresh(appId);
}

export async function updateFeature(formData: FormData) {
  const appId = await productAppId(formData);
  const id = idSchema.parse(formData.get("featureId"));
  const parsed = featureFromForm(formData);
  if (!parsed.success) return;
  await getDb()
    .update(schema.productFeatures)
    .set(parsed.data)
    .where(and(eq(schema.productFeatures.id, id), eq(schema.productFeatures.appId, appId)));
  await refresh(appId);
}

export async function deleteFeature(formData: FormData) {
  const appId = await productAppId(formData);
  const id = idSchema.parse(formData.get("featureId"));
  await getDb()
    .delete(schema.productFeatures)
    .where(and(eq(schema.productFeatures.id, id), eq(schema.productFeatures.appId, appId)));
  await refresh(appId);
}

function releaseFromForm(formData: FormData) {
  return releaseInputSchema.safeParse({
    version: formData.get("version") ?? "",
    date: formData.get("date") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function addRelease(formData: FormData) {
  const appId = await productAppId(formData);
  const parsed = releaseFromForm(formData);
  if (!parsed.success || !(await appExists(appId))) return;
  await getDb()
    .insert(schema.productReleases)
    .values({ appId, ...parsed.data });
  await refresh(appId);
}

export async function updateRelease(formData: FormData) {
  const appId = await productAppId(formData);
  const id = idSchema.parse(formData.get("releaseId"));
  const parsed = releaseFromForm(formData);
  if (!parsed.success) return;
  await getDb()
    .update(schema.productReleases)
    .set(parsed.data)
    .where(and(eq(schema.productReleases.id, id), eq(schema.productReleases.appId, appId)));
  await refresh(appId);
}

export async function deleteRelease(formData: FormData) {
  const appId = await productAppId(formData);
  const id = idSchema.parse(formData.get("releaseId"));
  await getDb()
    .delete(schema.productReleases)
    .where(and(eq(schema.productReleases.id, id), eq(schema.productReleases.appId, appId)));
  await refresh(appId);
}

export type ChangelogState = { proposal?: ChangelogProposal; model?: string; error?: string } | null;

/** Asks Claude for the features in a pasted CHANGELOG. Nothing is saved: the owner ticks what to keep. */
export async function proposeChangelog(_prev: ChangelogState, formData: FormData): Promise<ChangelogState> {
  const appId = await productAppId(formData);
  const text = z.string().trim().catch("").parse(formData.get("changelog"));
  if (!text) return { error: "Pega el CHANGELOG o las notas de versión." };
  if (text.length > MAX_CHANGELOG_CHARS) return { error: `El texto es demasiado largo: como mucho ${MAX_CHANGELOG_CHARS.toLocaleString("es-ES")} caracteres.` };
  const db = getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) return { error: "App no encontrada." };
  const existing = await db.select().from(schema.productFeatures).where(eq(schema.productFeatures.appId, appId));
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
  const appId = await productAppId(formData);
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
  if (!(await appExists(appId))) return { error: "App no encontrada." };

  const db = getDb();
  let sort = await nextSort(appId);
  for (const { existingId, advertise, ...f } of features) {
    if (existingId) {
      // An update never touches `advertise`: hiding a feature from the listing is the owner's call.
      await db
        .update(schema.productFeatures)
        .set(f)
        .where(and(eq(schema.productFeatures.id, existingId), eq(schema.productFeatures.appId, appId)));
    } else {
      await db.insert(schema.productFeatures).values({ appId, ...f, advertise, sort: sort++ });
    }
  }
  // A version already in the history is updated, not duplicated.
  const known = releases.length
    ? await db
        .select({ id: schema.productReleases.id, version: schema.productReleases.version })
        .from(schema.productReleases)
        .where(and(eq(schema.productReleases.appId, appId), inArray(schema.productReleases.version, releases.map((r) => r.version))))
    : [];
  const idByVersion = new Map(known.map((r) => [r.version, r.id]));
  for (const r of releases) {
    const id = idByVersion.get(r.version);
    if (id) await db.update(schema.productReleases).set(r).where(eq(schema.productReleases.id, id));
    else await db.insert(schema.productReleases).values({ appId, ...r });
  }
  await refresh(appId);
  return { features: features.length, releases: releases.length };
}

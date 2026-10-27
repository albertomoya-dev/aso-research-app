"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { cleanScreenshotCopy, type CreativeInput, toIconSpec } from "@/lib/assets/creative-ai";
import { type IconSpec, iconSpecSchema, initials } from "@/lib/assets/icon";
import { MAX_SPEC_BYTES, type ScreenshotSpec, screenshotSpecSchema, specBytes } from "@/lib/assets/screenshots";
import { AiError, designIconConcepts, writeScreenshotCopy } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { getKeywordRows } from "@/lib/queries";

const idSchema = z.coerce.number().int().positive();

async function loadAppOrThrow(appId: number) {
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) throw new Error("App no encontrada.");
  return app;
}

async function creativeInput(appId: number, focus?: string): Promise<CreativeInput & { app: typeof schema.apps.$inferSelect }> {
  const app = await loadAppOrThrow(appId);
  const rows = await getKeywordRows(app);
  const country = getCountry(app.country);
  return {
    app,
    store: app.store,
    countryName: country.name,
    lang: country.lang,
    meta: app.meta,
    keywords: rows.map((r) => ({ term: r.term, position: r.position, popularity: r.popularity, opportunity: r.opportunity })),
    focus: focus || undefined,
  };
}

function aiMessage(err: unknown): string {
  if (err instanceof AiError) return err.message;
  console.error(err);
  return "No se pudo hablar con Claude. Inténtalo de nuevo.";
}

export type SaveState = { savedAt?: string; error?: string } | null;

/** Upserts the one design of this kind for the app. The spec is validated and size-capped. */
export async function saveDesign(appId: number, kind: "screenshots" | "icon", spec: unknown): Promise<SaveState> {
  const id = idSchema.parse(appId);
  const parsed = kind === "screenshots" ? screenshotSpecSchema.safeParse(spec) : iconSpecSchema.safeParse(spec);
  if (!parsed.success) return { error: "El diseño tiene un formato no válido." };
  if (kind === "screenshots" && specBytes(parsed.data as ScreenshotSpec) > MAX_SPEC_BYTES) {
    return { error: "El conjunto pesa demasiado. Quita alguna captura o usa imágenes más pequeñas." };
  }
  const db = getDb();
  await db
    .insert(schema.assetDesigns)
    .values({ appId: id, kind, spec: parsed.data })
    .onConflictDoUpdate({ target: [schema.assetDesigns.appId, schema.assetDesigns.kind], set: { spec: parsed.data, updatedAt: new Date() } });
  revalidatePath(`/apps/${id}/creativos`);
  return { savedAt: new Date().toISOString() };
}

export async function deleteDesign(appId: number, kind: "screenshots" | "icon"): Promise<void> {
  const id = idSchema.parse(appId);
  await getDb()
    .delete(schema.assetDesigns)
    .where(and(eq(schema.assetDesigns.appId, id), eq(schema.assetDesigns.kind, kind)));
  revalidatePath(`/apps/${id}/creativos`);
}

export type CopyResult = { slides: { headline: string; subheadline: string; keyword: string }[]; notes: string[]; model: string } | { error: string };

/** Captions for the current slides, written by Claude around the tracked keywords. */
export async function generateScreenshotCopy(
  appId: number,
  current: { headline: string; subheadline: string }[],
  focus: string,
): Promise<CopyResult> {
  const count = Math.max(1, Math.min(10, current.length));
  try {
    const input = await creativeInput(idSchema.parse(appId), z.string().trim().max(200).catch("").parse(focus));
    const { output, model } = await writeScreenshotCopy({ ...input, count, current: current.slice(0, count) });
    const clean = cleanScreenshotCopy(
      output,
      count,
      input.keywords.map((k) => k.term),
    );
    return { ...clean, model };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

export type IconConceptResult = { concepts: { name: string; rationale: string; spec: IconSpec }[]; model: string } | { error: string };

/** Four icon concepts from Claude, already converted to renderable specs. */
export async function generateIconConcepts(appId: number, focus: string): Promise<IconConceptResult> {
  try {
    const input = await creativeInput(idSchema.parse(appId), z.string().trim().max(200).catch("").parse(focus));
    const { output, model } = await designIconConcepts(input);
    const letter = initials(input.meta.title);
    const concepts = output.concepts
      .map((c) => ({ name: c.name.trim(), rationale: c.rationale.trim(), spec: toIconSpec(c, letter) }))
      .filter((c): c is { name: string; rationale: string; spec: IconSpec } => c.spec != null)
      .slice(0, 4);
    if (concepts.length === 0) return { error: "Claude no devolvió ningún concepto utilizable. Inténtalo de nuevo." };
    return { concepts, model };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

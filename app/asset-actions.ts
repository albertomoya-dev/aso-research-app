"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  type BackgroundThemeHint,
  cleanLogoPrompts,
  cleanScreenshotCopy,
  type CreativeInput,
  MAX_VISION_IMAGE_CHARS,
  MAX_VISION_IMAGES,
  toIconSpec,
  withAppPalette,
} from "@/lib/assets/creative-ai";
import { generateImages, ImageGenError } from "@/lib/assets/image-provider";
import { type IconSpec, iconSpecSchema, initials } from "@/lib/assets/icon";
import { MAX_SPEC_BYTES, type ScreenshotSpec, screenshotSpecSchema, specBytes, generatedImageUrl } from "@/lib/assets/screenshots";
import { AiError, designIconConcepts, writeBackgroundPrompts, writeLogoPrompts, writeScreenshotCopy } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { productFactsPrompt } from "@/lib/product-queries";
import { getKeywordRows } from "@/lib/queries";
import { isRelevantKeyword } from "@/lib/relevance";

const idSchema = z.coerce.number().int().positive();

async function loadAppOrThrow(appId: number) {
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  if (!app) throw new Error("App no encontrada.");
  return app;
}

async function creativeInput(appId: number, focus?: string): Promise<CreativeInput & { app: typeof schema.apps.$inferSelect }> {
  const app = await loadAppOrThrow(appId);
  // Screenshots and icons are made for the coming release, so its features count.
  const [rows, facts] = await Promise.all([getKeywordRows(app), productFactsPrompt(app.id, "next")]);
  const country = getCountry(app.country);
  return {
    app,
    store: app.store,
    countryName: country.name,
    lang: country.lang,
    meta: app.meta,
    // Creatives only build on relevant keywords: noise or foreign-intent searches would end up on a screen.
    keywords: rows
      .filter((r) => isRelevantKeyword(r, country.lang))
      .map((r) => ({ term: r.term, position: r.position, popularity: r.popularity, opportunity: r.opportunity })),
    facts,
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
  images: (string | null)[] = [],
): Promise<CopyResult> {
  const count = Math.max(1, Math.min(10, current.length));
  // Small screens made in the browser, checked one by one: an oversized or malformed one becomes null
  // (that slide goes by its text) without dropping the others. parseVisionImage checks the format.
  const screens = z
    .array(z.string().max(MAX_VISION_IMAGE_CHARS).nullable().catch(null))
    .catch([])
    .parse(images)
    .slice(0, MAX_VISION_IMAGES);
  try {
    const input = await creativeInput(idSchema.parse(appId), z.string().trim().max(200).catch("").parse(focus));
    const { output, model } = await writeScreenshotCopy({ ...input, count, current: current.slice(0, count) }, screens);
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

export type LogoPromptResult = { prompts: { name: string; prompt: string; rationale: string }[]; model: string } | { error: string };

/** Three prompts for the image generator, written by Claude from the listing and the keywords. */
export async function generateLogoPrompts(appId: number, focus: string): Promise<LogoPromptResult> {
  try {
    const input = await creativeInput(idSchema.parse(appId), z.string().trim().max(200).catch("").parse(focus));
    const { output, model } = await writeLogoPrompts(input);
    const prompts = cleanLogoPrompts(output);
    if (prompts.length === 0) return { error: "Claude no devolvió ningún prompt utilizable. Inténtalo de nuevo." };
    return { prompts, model };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

export type LogoImagesResult = { ids: number[]; provider: string; model: string } | { error: string };

/** Calls the image provider and stores the results; the page reloads them through /api/assets/generated/[id]. */
export async function generateLogoImages(appId: number, prompt: string, count: number): Promise<LogoImagesResult> {
  const id = idSchema.parse(appId);
  const text = z.string().trim().min(10).max(2000).safeParse(prompt);
  if (!text.success) return { error: "Escribe un prompt de al menos 10 caracteres." };
  await loadAppOrThrow(id);
  try {
    const { images, provider, model } = await generateImages({ prompt: text.data, count });
    const ids: number[] = [];
    for (const img of images) {
      const [row] = await getDb()
        .insert(schema.generatedImages)
        .values({ appId: id, kind: "logo", prompt: text.data, provider, model, mime: img.mime, data: img.base64 })
        .returning({ id: schema.generatedImages.id });
      ids.push(row.id);
    }
    revalidatePath(`/apps/${id}/creativos/logo`);
    return { ids, provider, model };
  } catch (err) {
    if (err instanceof ImageGenError) return { error: err.message };
    console.error(err);
    return { error: "No se pudo generar la imagen. Inténtalo de nuevo." };
  }
}

export async function deleteGeneratedImage(appId: number, imageId: number): Promise<void> {
  const id = idSchema.parse(appId);
  await getDb()
    .delete(schema.generatedImages)
    .where(and(eq(schema.generatedImages.id, idSchema.parse(imageId)), eq(schema.generatedImages.appId, id)));
  revalidatePath(`/apps/${id}/creativos/logo`);
  revalidatePath(`/apps/${id}/creativos`);
}

const hexColour = z.string().regex(/^#[0-9a-f]{6}$/i);
const paletteSchema = z.array(hexColour).max(6).optional().catch(undefined);
const themeHintSchema = z.object({ dark: z.boolean(), background: z.string().max(20), accent: z.string().max(20), palette: paletteSchema }).optional();

/** Three backdrop prompts for the screenshots, written by Claude from the listing, the keywords and the current theme. */
export async function generateBackgroundPrompts(appId: number, focus: string, theme?: BackgroundThemeHint): Promise<LogoPromptResult> {
  try {
    const input = await creativeInput(idSchema.parse(appId), z.string().trim().max(200).catch("").parse(focus));
    const { output, model } = await writeBackgroundPrompts(input, themeHintSchema.parse(theme));
    const prompts = cleanLogoPrompts(output);
    if (prompts.length === 0) return { error: "Claude no devolvió ningún prompt utilizable. Inténtalo de nuevo." };
    return { prompts, model };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

export type BackgroundImageResult = { id: number; url: string; provider: string; model: string } | { error: string };

/** Generates one portrait backdrop and stores it; the screenshot spec references it by URL. */
export async function generateBackgroundImage(appId: number, prompt: string, palette?: string[]): Promise<BackgroundImageResult> {
  const id = idSchema.parse(appId);
  const text = z.string().trim().min(10).max(2000).safeParse(prompt);
  if (!text.success) return { error: "Escribe un prompt de al menos 10 caracteres." };
  await loadAppOrThrow(id);
  try {
    const finalPrompt = withAppPalette(text.data, paletteSchema.parse(palette));
    const { images, provider, model } = await generateImages({ prompt: finalPrompt, count: 1, aspect: "9:16" });
    const [row] = await getDb()
      .insert(schema.generatedImages)
      .values({ appId: id, kind: "background", prompt: finalPrompt, provider, model, mime: images[0].mime, data: images[0].base64 })
      .returning({ id: schema.generatedImages.id });
    revalidatePath(`/apps/${id}/creativos`);
    return { id: row.id, url: generatedImageUrl(row.id), provider, model };
  } catch (err) {
    if (err instanceof ImageGenError) return { error: err.message };
    console.error(err);
    return { error: "No se pudo generar el fondo. Inténtalo de nuevo." };
  }
}

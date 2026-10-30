"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AiError, draftReviewReply } from "@/lib/claude";
import { formatDay } from "@/lib/format";
import { isKnownLocale } from "@/lib/listing-drafts";
import { playConfig } from "@/lib/play-console/auth";
import { getPlayClient, playErrorMessage } from "@/lib/play-console/client";
import { CSV_TOO_BIG_MESSAGE, MAX_CSV_BYTES } from "@/lib/play-console/constants";
import { CsvFormatError, parseSearchTermsCsv } from "@/lib/play-console/csv";
import { planPlayPublish } from "@/lib/play-console/plan";
import { productFactsPrompt } from "@/lib/product-queries";
import { recordPublication } from "@/lib/publication-queries";
import { buildPublishPreview, fieldList, publishedFields } from "@/lib/publications";
import { fitReply } from "@/lib/review-replies";
import { saveSearchTermStats } from "@/lib/search-term-queries";
import { PeriodRequiredError, statRowsFrom } from "@/lib/search-terms";

// Writes to Google Play are double-gated: the server needs GOOGLE_PLAY_ALLOW_WRITE=1 and every request
// carries the explicit confirmation of the dialog (confirm=yes). Credentials never leave the server.

export type PlayActionState = { ok?: boolean; message?: string; error?: string } | null;

/** Added to the message when the store took the change but the publication history could not be written. */
const HISTORY_NOT_SAVED = "Publicado, pero no se pudo guardar el historial: no saldrá en «Publicaciones» ni como anotación.";

async function loadAndroidApp(appId: number) {
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  return app && app.store === "android" ? app : null;
}

const publishSchema = z.object({
  appId: z.coerce.number().int().positive(),
  locale: z.string().trim().min(2).max(20),
  country: z.string().trim().max(2).default(""),
  /** updatedAt of the draft shown in the preview: publishing a draft edited since then is refused. */
  draftUpdatedAt: z.string().min(1),
  confirm: z.string().optional(),
});

/** Publishes the saved draft of one language to Google Play (edits.insert → listings.patch → validate → commit). */
export async function publishToPlay(_prev: PlayActionState, formData: FormData): Promise<PlayActionState> {
  const input = publishSchema.parse(Object.fromEntries(formData));
  if (input.confirm !== "yes") return { error: "Falta la confirmación." };
  const app = await loadAndroidApp(input.appId);
  if (!app) return { error: "App de Google Play no encontrada." };
  if (!isKnownLocale(input.locale)) return { error: "Idioma no válido." };

  const plan = await planPlayPublish(app, { locale: input.locale, country: input.country });
  if (plan.kind !== "ready") return { error: "Este borrador no se puede publicar en Google Play: vuelve a abrir la vista previa." };
  if (!plan.writeEnabled) return { error: "Modo solo lectura: para publicar, añade GOOGLE_PLAY_ALLOW_WRITE=1 en las variables de entorno del servidor." };
  if (plan.draft.updatedAt.toISOString() !== input.draftUpdatedAt) {
    return { error: "El borrador ha cambiado desde que abriste la vista previa. Recarga la página y revisa los cambios de nuevo." };
  }
  const check = buildPublishPreview("android", null, plan.fields);
  if (check.blockers.length) return { error: `No se puede publicar: ${check.blockers.join(" ")}` };

  const client = getPlayClient();
  if (!client) return { error: "La conexión con Google Play no está configurada." };
  const base = { appId: app.id, store: "android" as const, locale: input.locale, storeLocale: plan.language.code, country: "" };
  let result;
  try {
    result = await client.publishListing(app.storeId, plan.language.code, plan.fields);
  } catch (err) {
    const message = playErrorMessage(err);
    // The attempt is recorded too: what was tried, and why it failed.
    const tried = buildPublishPreview("android", null, plan.fields);
    await recordPublication({ ...base, fields: publishedFields(tried.changes), status: "failed", error: message }).catch(() => {});
    revalidatePath(`/apps/${app.id}/metadata`, "layout");
    return { error: `Google Play no aceptó la publicación. ${message} No se ha cambiado nada en la ficha.` };
  }
  if (result.unchanged) return { ok: true, message: "La ficha de Google Play ya tenía este texto: no se ha enviado nada." };

  // The edit is committed: from here on a failure is only bookkeeping, never a failed publication.
  const preview = buildPublishPreview("android", result.before, plan.fields);
  const sent = `Enviado a Google Play: ${fieldList(preview.changes.map((c) => c.label))}. Google revisa los cambios antes de publicarlos; puede tardar desde minutos hasta unos días.`;
  try {
    await recordPublication({ ...base, fields: publishedFields(preview.changes), status: "committed", externalRef: result.editId });
    revalidatePath(`/apps/${app.id}/metadata`, "layout");
  } catch {
    return { ok: true, message: `${sent} ${HISTORY_NOT_SAVED}` };
  }
  return { ok: true, message: sent };
}

export type ReplyDraftState = { text?: string; notes?: string[]; cut?: boolean; error?: string; nonce?: number } | null;

const reviewSchema = z.object({ appId: z.coerce.number().int().positive(), reviewId: z.string().trim().min(1).max(300) });

/** Asks Claude for a reply to one review. The review is re-read from Google Play, never taken from the form. */
export async function draftReplyAction(_prev: ReplyDraftState, formData: FormData): Promise<ReplyDraftState> {
  const { appId, reviewId } = reviewSchema.parse(Object.fromEntries(formData));
  const app = await loadAndroidApp(appId);
  const client = getPlayClient();
  if (!app || !client) return { error: "La conexión con Google Play no está configurada para esta app." };
  try {
    const review = await client.getReview(app.storeId, reviewId);
    const { output } = await draftReviewReply({
      appTitle: app.title,
      review: { text: review.text, rating: review.rating, language: review.language, appVersion: review.appVersion },
      currentReply: review.reply?.text ?? null,
      facts: await productFactsPrompt(app.id, "published"),
    });
    const fitted = fitReply(output.reply);
    return { text: fitted.text, cut: fitted.cut, notes: output.notes.slice(0, 2), nonce: Date.now() };
  } catch (err) {
    if (err instanceof AiError) return { error: err.message };
    return { error: playErrorMessage(err) };
  }
}

const replySchema = reviewSchema.extend({ text: z.string().max(2000), confirm: z.string().optional() });

/** Publishes (or replaces) the developer reply to a review. */
export async function replyToReview(_prev: PlayActionState, formData: FormData): Promise<PlayActionState> {
  const { appId, reviewId, text, confirm } = replySchema.parse(Object.fromEntries(formData));
  if (confirm !== "yes") return { error: "Falta la confirmación." };
  if (!playConfig().writeEnabled) return { error: "Modo solo lectura: para responder desde Rankeo, añade GOOGLE_PLAY_ALLOW_WRITE=1." };
  const app = await loadAndroidApp(appId);
  const client = getPlayClient();
  if (!app || !client) return { error: "La conexión con Google Play no está configurada para esta app." };
  try {
    await client.replyToReview(app.storeId, reviewId, text);
  } catch (err) {
    return { error: playErrorMessage(err) };
  }
  revalidatePath(`/apps/${app.id}/resenas`);
  return { ok: true, message: "Respuesta publicada en Google Play." };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Imports a search terms CSV exported from Play Console. Reading a file is not a write to the store: no extra gate. */
export async function importSearchTerms(_prev: PlayActionState, formData: FormData): Promise<PlayActionState> {
  const appId = z.coerce.number().int().positive().parse(formData.get("appId"));
  const app = await loadAndroidApp(appId);
  if (!app) return { error: "Los términos de búsqueda de Play Console solo se pueden importar en apps de Google Play." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige el archivo CSV." };
  if (file.size > MAX_CSV_BYTES) return { error: CSV_TOO_BIG_MESSAGE };
  const start = isoDate.safeParse(formData.get("periodStart"));
  const end = isoDate.safeParse(formData.get("periodEnd"));
  try {
    const parsed = parseSearchTermsCsv(new Uint8Array(await file.arrayBuffer()));
    const rows = statRowsFrom(parsed, start.success && end.success ? { start: start.data, end: end.data } : null);
    if (rows.length === 0) return { error: "El archivo no tiene ningún término de búsqueda con datos." };
    await saveSearchTermStats(app.id, rows);
    revalidatePath(`/apps/${app.id}`, "layout");
    const terms = new Set(rows.map((r) => r.term)).size;
    const range = parsed.hasDates ? `del ${formatDay(parsed.from)} al ${formatDay(parsed.to)}` : `del ${formatDay(start.data)} al ${formatDay(end.data)}`;
    return {
      ok: true,
      message: `Importados ${terms} términos ${range}${parsed.skipped ? ` (${parsed.skipped} filas sin término u «Other» ignoradas)` : ""}.`,
    };
  } catch (err) {
    if (err instanceof CsvFormatError || err instanceof PeriodRequiredError) return { error: err.message };
    throw err;
  }
}

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ascConfig } from "@/lib/app-store-connect/auth";
import { ascErrorMessage, AscPartialSaveError, getAscClient } from "@/lib/app-store-connect/client";
import { planAscPublish } from "@/lib/app-store-connect/plan";
import { isKnownLocale } from "@/lib/listing-drafts";
import { recordPublication } from "@/lib/publication-queries";
import { ascNextFields, buildPublishPreview, fieldList, type PublishFieldKey, type PublishFields, publishedFields } from "@/lib/publications";

// Writes to App Store Connect are double-gated like Google Play: ASC_ALLOW_WRITE=1 on the server and the
// explicit confirmation of the dialog (confirm=yes) on every request.

export type AscActionState = { ok?: boolean; message?: string; error?: string } | null;

async function loadIosApp(appId: number) {
  const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
  return app && app.store === "ios" ? app : null;
}

const publishSchema = z.object({
  appId: z.coerce.number().int().positive(),
  locale: z.string().trim().min(2).max(20),
  draftUpdatedAt: z.string().min(1),
  promotionalText: z.string().max(1000).optional(),
  whatsNew: z.string().max(8000).optional(),
  confirm: z.string().optional(),
});

/** Saves the draft of one locale in the App Store version in preparation (it does not submit it for review). */
export async function publishToAsc(_prev: AscActionState, formData: FormData): Promise<AscActionState> {
  const input = publishSchema.parse(Object.fromEntries(formData));
  if (input.confirm !== "yes") return { error: "Falta la confirmación." };
  const app = await loadIosApp(input.appId);
  if (!app) return { error: "App del App Store no encontrada." };
  if (!isKnownLocale(input.locale)) return { error: "Idioma no válido." };

  const plan = await planAscPublish(app, { locale: input.locale, country: "" });
  if (plan.kind !== "ready") return { error: "Este borrador no se puede enviar a App Store Connect: vuelve a abrir la vista previa." };
  if (!plan.writeEnabled) return { error: "Modo solo lectura: para enviar, añade ASC_ALLOW_WRITE=1 en las variables de entorno del servidor." };
  if (plan.draft.updatedAt.toISOString() !== input.draftUpdatedAt) {
    return { error: "El borrador ha cambiado desde que abriste la vista previa. Recarga la página y revisa los cambios de nuevo." };
  }
  const client = getAscClient();
  if (!client) return { error: "La conexión con App Store Connect no está configurada." };

  const base = { appId: app.id, store: "ios" as const, locale: input.locale, storeLocale: plan.locale.code, country: "" };
  const fail = async (message: string, fields: PublishFields) => {
    const attempt = buildPublishPreview("ios", null, fields);
    await recordPublication({ ...base, fields: publishedFields(attempt.changes), status: "failed", error: message }).catch(() => {});
    revalidatePath(`/apps/${app.id}/metadata`, "layout");
    return { error: `App Store Connect no aceptó el envío. ${message}` };
  };

  let listing;
  let preview;
  try {
    // Re-read now: the texts in App Store Connect may have changed since the preview.
    listing = await client.readListing(app.storeId, app.meta.bundleId, plan.locale.code);
    const { fields } = ascNextFields(
      plan.draft.draft,
      listing.fields,
      { promotionalText: input.promotionalText, whatsNew: input.whatsNew },
      listing.appInfoLocalizationId != null,
    );
    preview = buildPublishPreview("ios", listing.fields, fields);
  } catch (err) {
    return fail(ascErrorMessage(err), {});
  }
  if (preview.blockers.length) return { error: `No se puede enviar: ${preview.blockers.join(" ")}` };
  if (preview.changes.length === 0) return { ok: true, message: "App Store Connect ya tenía estos textos: no se ha enviado nada." };
  const changed = Object.fromEntries(preview.changes.map((c) => [c.field, c.after])) as PublishFields;

  let saved: PublishFieldKey[];
  let failure: string | null = null;
  try {
    saved = (await client.saveListing(listing, changed)).saved;
  } catch (err) {
    // App info and version are two PATCHes: the first may have gone through.
    if (!(err instanceof AscPartialSaveError)) return fail(ascErrorMessage(err), changed);
    saved = err.saved;
    failure = ascErrorMessage(err);
  }

  // App Store Connect has the saved fields: from here on a failure is only bookkeeping.
  const savedChanges = preview.changes.filter((c) => saved.includes(c.field));
  const failedChanges = preview.changes.filter((c) => !saved.includes(c.field));
  let historySaved = true;
  try {
    if (savedChanges.length) {
      await recordPublication({ ...base, fields: publishedFields(savedChanges), status: "saved", externalRef: listing.version.id });
    }
    if (failure && failedChanges.length) {
      await recordPublication({ ...base, fields: publishedFields(failedChanges), status: "failed", error: failure, externalRef: listing.version.id });
    }
    revalidatePath(`/apps/${app.id}/metadata`, "layout");
  } catch {
    historySaved = false;
  }
  const note = historySaved ? "" : " Publicado, pero no se pudo guardar el historial: no saldrá en «Publicaciones» ni como anotación.";
  const where = `la versión ${listing.version.versionString} de App Store Connect`;
  if (failure) {
    return {
      error: `Guardado a medias en ${where}: ${fieldList(savedChanges.map((c) => c.label))} sí; ${fieldList(failedChanges.map((c) => c.label))} no. ${failure}${note}`,
    };
  }
  return {
    ok: true,
    message: `Guardado en ${where}: ${fieldList(savedChanges.map((c) => c.label))}. Envíala a revisión desde App Store Connect cuando esté lista.${note}`,
  };
}

/** Asks Apple to start generating the analytics reports (ONGOING) for the app. A write: gated and confirmed. */
export async function requestAscAnalytics(_prev: AscActionState, formData: FormData): Promise<AscActionState> {
  const appId = z.coerce.number().int().positive().parse(formData.get("appId"));
  if (formData.get("confirm") !== "yes") return { error: "Falta la confirmación." };
  if (!ascConfig().writeEnabled) return { error: "Modo solo lectura: para pedir los informes, añade ASC_ALLOW_WRITE=1." };
  const app = await loadIosApp(appId);
  const client = getAscClient();
  if (!app || !client) return { error: "La conexión con App Store Connect no está configurada para esta app." };
  try {
    const ascAppId = await client.findApp(app.storeId, app.meta.bundleId);
    await client.createAnalyticsReportRequest(ascAppId);
  } catch (err) {
    return { error: ascErrorMessage(err) };
  }
  revalidatePath(`/apps/${app.id}/metadata/publicar`);
  return { ok: true, message: "Petición enviada. Apple tarda 1 o 2 días en generar los primeros informes." };
}

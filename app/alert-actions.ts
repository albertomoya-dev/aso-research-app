"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ALERT_KIND_GROUPS, type AlertKind } from "@/lib/alerts";
import { appUrl, emailConfigured, renderSummaryEmail, sendEmail } from "@/lib/email";
import { getWeeklySummaries } from "@/lib/summary";

export async function markAlertsRead(formData: FormData) {
  const appId = z.coerce.number().int().positive().optional().catch(undefined).parse(formData.get("appId") || undefined);
  await getDb()
    .update(schema.alerts)
    .set({ readAt: new Date() })
    .where(and(isNull(schema.alerts.readAt), appId ? eq(schema.alerts.appId, appId) : undefined));
  revalidatePath("/", "layout");
}

const prefsSchema = z.object({
  appId: z.coerce.number().int().positive(),
  groups: z.array(z.string()),
  minRelevance: z.coerce.number().int().min(1).max(5).catch(3),
});

/** Saves which alerts the user wants for an app. Applies from the next check on. */
export async function saveAlertPrefs(formData: FormData) {
  const { appId, groups, minRelevance } = prefsSchema.parse({
    appId: formData.get("appId"),
    groups: formData.getAll("group"),
    minRelevance: formData.get("minRelevance"),
  });
  const kinds: AlertKind[] = ALERT_KIND_GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.kinds);
  await getDb()
    .insert(schema.alertPrefs)
    .values({ appId, kinds, minRelevance })
    .onConflictDoUpdate({ target: schema.alertPrefs.appId, set: { kinds, minRelevance, updatedAt: new Date() } });
  revalidatePath("/novedades");
}

export type SendState = { ok?: boolean; error?: string } | null;

export async function sendSummaryNow(): Promise<SendState> {
  if (!emailConfigured()) return { error: "Faltan RESEND_API_KEY y ALERT_EMAIL." };
  try {
    await sendEmail("Resumen semanal de ASO", renderSummaryEmail(await getWeeklySummaries(), appUrl()));
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

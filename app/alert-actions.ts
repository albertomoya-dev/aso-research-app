"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
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

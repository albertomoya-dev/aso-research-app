"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { experimentInputSchema } from "@/lib/experiments";

const idSchema = z.coerce.number().int().positive();

export type ExperimentState = { ok?: boolean; error?: string; savedAt?: string } | null;

const FIELDS = ["name", "hypothesis", "variant", "metric", "startDate", "endDate", "result", "learned", "status"] as const;

function fromForm(formData: FormData) {
  return experimentInputSchema.safeParse(Object.fromEntries(FIELDS.map((k) => [k, formData.get(k) ?? undefined])));
}

/** Creates an experiment (no experimentId in the form) or updates one. */
export async function saveExperiment(_prev: ExperimentState, formData: FormData): Promise<ExperimentState> {
  const appId = idSchema.parse(formData.get("appId"));
  const experimentId = formData.get("experimentId");
  const parsed = fromForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = getDb();
  if (experimentId) {
    await db
      .update(schema.experiments)
      .set(parsed.data)
      .where(and(eq(schema.experiments.id, idSchema.parse(experimentId)), eq(schema.experiments.appId, appId)));
  } else {
    const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId), columns: { id: true } });
    if (!app) return { error: "App no encontrada." };
    await db.insert(schema.experiments).values({ appId, ...parsed.data });
  }
  revalidatePath(`/apps/${appId}/cambios`);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deleteExperiment(formData: FormData) {
  const appId = idSchema.parse(formData.get("appId"));
  const id = idSchema.parse(formData.get("experimentId"));
  await getDb()
    .delete(schema.experiments)
    .where(and(eq(schema.experiments.id, id), eq(schema.experiments.appId, appId)));
  revalidatePath(`/apps/${appId}/cambios`);
}

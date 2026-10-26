"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { trackCompetitors } from "@/lib/competitors";

const idSchema = z.coerce.number().int().positive();
const followSchema = z.object({
  appId: idSchema,
  storeId: z.string().trim().min(1).max(200),
  title: z.string().max(300),
  developer: z.string().max(300),
  icon: z.url().max(1000),
  url: z.url().max(1000),
});

export async function followCompetitor(formData: FormData) {
  const data = followSchema.parse(Object.fromEntries(formData));
  const [row] = await getDb()
    .insert(schema.competitors)
    .values(data)
    .onConflictDoNothing()
    .returning({ id: schema.competitors.id });
  // First snapshot now, so changes show up from the next daily check.
  if (row) await trackCompetitors({ competitorId: row.id });
  revalidatePath(`/apps/${data.appId}/competidores`);
}

export async function unfollowCompetitor(formData: FormData) {
  const appId = idSchema.parse(formData.get("appId"));
  const id = idSchema.parse(formData.get("competitorId"));
  await getDb()
    .delete(schema.competitors)
    .where(and(eq(schema.competitors.id, id), eq(schema.competitors.appId, appId)));
  revalidatePath(`/apps/${appId}/competidores`);
}

export async function refreshCompetitors(formData: FormData) {
  const appId = idSchema.parse(formData.get("appId"));
  await trackCompetitors({ appId });
  revalidatePath(`/apps/${appId}/competidores`);
}

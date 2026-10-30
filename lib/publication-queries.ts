import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { publishAnnotation } from "./annotations";
import type { PublicationStatus, PublishedField } from "./publications";
import { today } from "./ranking";
import type { Store } from "./stores/types";

export type Publication = typeof schema.publications.$inferSelect;

export type NewPublication = {
  appId: number;
  store: Store;
  locale: string;
  storeLocale: string;
  country?: string;
  fields: PublishedField[];
  status: PublicationStatus;
  error?: string | null;
  externalRef?: string | null;
};

/**
 * Records one publish attempt (successful or not). A successful one also leaves a «publish» annotation on
 * the position charts, so its effect can be measured (the daily job adds an «auto» one when the store shows it).
 */
export async function recordPublication(p: NewPublication): Promise<Publication> {
  const db = getDb();
  const [row] = await db
    .insert(schema.publications)
    .values({ ...p, country: p.country ?? "", error: p.error ?? null, externalRef: p.externalRef ?? null })
    .returning();
  const note = publishAnnotation(p);
  if (note) await db.insert(schema.annotations).values({ appId: p.appId, date: today(), label: note.label, source: "publish", detail: note.detail });
  return row;
}

/** Latest publish attempts of an app, newest first. */
export function getPublications(appId: number, limit = 20): Promise<Publication[]> {
  return getDb()
    .select()
    .from(schema.publications)
    .where(eq(schema.publications.appId, appId))
    .orderBy(desc(schema.publications.publishedAt))
    .limit(limit);
}

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { PublicationStatus, PublishedField } from "./publications";
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

/** Records one publish attempt (successful or not). Phase 22 reads these to annotate the charts. */
export async function recordPublication(p: NewPublication): Promise<Publication> {
  const [row] = await getDb()
    .insert(schema.publications)
    .values({ ...p, country: p.country ?? "", error: p.error ?? null, externalRef: p.externalRef ?? null })
    .returning();
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

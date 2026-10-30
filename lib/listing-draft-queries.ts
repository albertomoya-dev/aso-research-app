import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { DraftTarget } from "./listing-drafts";
import type { MetadataDraft } from "./metadata-check";

export type ListingDraftRow = typeof schema.listingDrafts.$inferSelect;

/** Every saved draft of the app, by locale and then country (the main listing, country "", first). */
export function getListingDrafts(appId: number): Promise<ListingDraftRow[]> {
  return getDb()
    .select()
    .from(schema.listingDrafts)
    .where(eq(schema.listingDrafts.appId, appId))
    .orderBy(asc(schema.listingDrafts.locale), asc(schema.listingDrafts.country));
}

/**
 * The saved draft of one listing, or null. `country` "" (the default) is the main listing of the
 * locale; a country code is a Google Play custom store listing.
 */
export async function getListingDraft(appId: number, locale: string, country = ""): Promise<ListingDraftRow | null> {
  const row = await getDb().query.listingDrafts.findFirst({
    where: and(eq(schema.listingDrafts.appId, appId), eq(schema.listingDrafts.locale, locale), eq(schema.listingDrafts.country, country)),
  });
  return row ?? null;
}

/** Creates or replaces the draft of a listing. Returns when it was saved. */
export async function saveListingDraft(appId: number, target: DraftTarget, draft: MetadataDraft): Promise<Date> {
  const updatedAt = new Date();
  await getDb()
    .insert(schema.listingDrafts)
    .values({ appId, locale: target.locale, country: target.country, draft, updatedAt })
    .onConflictDoUpdate({
      target: [schema.listingDrafts.appId, schema.listingDrafts.locale, schema.listingDrafts.country],
      set: { draft, updatedAt },
    });
  return updatedAt;
}

export async function deleteListingDraft(appId: number, target: DraftTarget): Promise<void> {
  await getDb()
    .delete(schema.listingDrafts)
    .where(
      and(
        eq(schema.listingDrafts.appId, appId),
        eq(schema.listingDrafts.locale, target.locale),
        eq(schema.listingDrafts.country, target.country),
      ),
    );
}

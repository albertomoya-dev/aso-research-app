import { and, desc, eq, gte } from "drizzle-orm";
import pLimit from "p-limit";
import { getDb, schema } from "@/db";
import { listingAnnotation } from "./annotations";
import { getCountry } from "./countries";
import { diffListings, type ListingChange, toListing } from "./listing-diff";
import type { PublicationStatus, PublishedField, PublishFieldKey } from "./publications";
import { today } from "./ranking";
import { getAdapter } from "./stores";
import type { AppMeta } from "./stores/types";

export type OwnListingReport = { checked: number; changed: number; skipped: number; errors: { title: string; message: string }[] };

/** A publication from Rankeo explains the listing changes the store shows within this many days. */
export const PUBLISH_COVER_DAYS = 14;

/** Listing field (lib/listing-diff) each published console field ends up in. */
const LISTING_FIELD: Partial<Record<PublishFieldKey, ListingChange["field"]>> = {
  title: "title",
  shortDescription: "shortDescription",
  fullDescription: "description",
  name: "title",
  description: "description",
};

type RecentPublication = { status: PublicationStatus; locale: string; fields: PublishedField[]; publishedAt: Date };

/**
 * The changes an automatic annotation still has to explain: text changes of fields that a successful
 * publication from Rankeo (same language, last PUBLISH_COVER_DAYS days) already sent are dropped,
 * because its «publish» annotation is on the chart already. Other changes (version, icon…) stay.
 */
export function changesNotPublished(changes: ListingChange[], publications: RecentPublication[], lang: string, now = new Date()): ListingChange[] {
  const since = now.getTime() - PUBLISH_COVER_DAYS * 86_400_000;
  const published = new Set<string>();
  for (const p of publications) {
    if (p.status === "failed" || p.publishedAt.getTime() < since) continue;
    if (p.locale.split("-")[0].toLowerCase() !== lang.toLowerCase()) continue;
    for (const f of p.fields) {
      const field = LISTING_FIELD[f.field];
      if (field) published.add(field);
    }
  }
  return changes.filter((c) => !(c.kind === "text" && published.has(c.field)));
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Saves the freshly fetched listing of a followed app: updates apps.meta and, when it differs from the
 * last snapshot, stores a new snapshot and an automatic annotation with the diff. The first call only
 * stores the baseline. Returns the annotation label, or null when nothing changed.
 */
export async function recordOwnListing(appId: number, meta: AppMeta): Promise<string | null> {
  const db = getDb();
  const listing = toListing(meta);
  const [app] = await db
    .update(schema.apps)
    .set({ title: meta.title, developer: meta.developer, icon: meta.icon, url: meta.url, meta, metaFetchedAt: new Date() })
    .where(eq(schema.apps.id, appId))
    .returning({ country: schema.apps.country });
  if (!app) return null;
  const [last] = await db
    .select({ listing: schema.appSnapshots.listing })
    .from(schema.appSnapshots)
    .where(eq(schema.appSnapshots.appId, appId))
    .orderBy(desc(schema.appSnapshots.fetchedAt))
    .limit(1);
  const changes = last ? diffListings(last.listing, listing) : [];
  if (last && changes.length === 0) return null;
  await db.insert(schema.appSnapshots).values({ appId, listing });
  // Texts just published from Rankeo already have their «publish» annotation: no second one for them.
  const publications = await db
    .select({
      status: schema.publications.status,
      locale: schema.publications.locale,
      fields: schema.publications.fields,
      publishedAt: schema.publications.publishedAt,
    })
    .from(schema.publications)
    .where(
      and(
        eq(schema.publications.appId, appId),
        gte(schema.publications.publishedAt, new Date(Date.now() - PUBLISH_COVER_DAYS * 86_400_000)),
      ),
    );
  // A changed listing is stored once, so the annotation cannot repeat on a second run.
  const note = listingAnnotation(changesNotPublished(changes, publications, getCountry(app.country).lang));
  if (!note) return null;
  await db.insert(schema.annotations).values({ appId, date: today(), label: note.label, source: "auto", detail: note.detail });
  return note.label;
}

/**
 * Daily job: fetches the listing of every followed app (or one) and records it with recordOwnListing.
 * Stops starting new fetches after `deadline` (ms since epoch) so the cron stays within its time budget.
 */
export async function trackOwnListings(filter: { appId?: number } = {}, deadline = Infinity): Promise<OwnListingReport> {
  const db = getDb();
  const apps = await db
    .select({ id: schema.apps.id, store: schema.apps.store, storeId: schema.apps.storeId, country: schema.apps.country, title: schema.apps.title })
    .from(schema.apps)
    .where(filter.appId ? eq(schema.apps.id, filter.appId) : undefined);
  const report: OwnListingReport = { checked: 0, changed: 0, skipped: 0, errors: [] };
  const limit = pLimit(4);

  await Promise.all(
    apps.map((app) =>
      limit(async () => {
        if (Date.now() > deadline) {
          report.skipped++;
          return;
        }
        try {
          const meta = await getAdapter(app.store).getApp(app.storeId, { country: app.country, lang: getCountry(app.country).lang });
          if (await recordOwnListing(app.id, meta)) report.changed++;
          report.checked++;
        } catch (error) {
          report.errors.push({ title: app.title, message: message(error) });
        }
      }),
    ),
  );
  return report;
}

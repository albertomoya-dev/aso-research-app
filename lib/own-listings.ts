import { desc, eq } from "drizzle-orm";
import pLimit from "p-limit";
import { getDb, schema } from "@/db";
import { listingAnnotation } from "./annotations";
import { getCountry } from "./countries";
import { diffListings, toListing } from "./listing-diff";
import { today } from "./ranking";
import { getAdapter } from "./stores";
import type { AppMeta } from "./stores/types";

export type OwnListingReport = { checked: number; changed: number; skipped: number; errors: { title: string; message: string }[] };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Saves the freshly fetched listing of a followed app: updates apps.meta and, when it differs from the
 * last snapshot, stores a new snapshot and an automatic annotation with the diff. The first call only
 * stores the baseline. Returns the annotation label, or null when nothing changed.
 */
export async function recordOwnListing(appId: number, meta: AppMeta): Promise<string | null> {
  const db = getDb();
  const listing = toListing(meta);
  await db
    .update(schema.apps)
    .set({ title: meta.title, developer: meta.developer, icon: meta.icon, url: meta.url, meta, metaFetchedAt: new Date() })
    .where(eq(schema.apps.id, appId));
  const [last] = await db
    .select({ listing: schema.appSnapshots.listing })
    .from(schema.appSnapshots)
    .where(eq(schema.appSnapshots.appId, appId))
    .orderBy(desc(schema.appSnapshots.fetchedAt))
    .limit(1);
  const changes = last ? diffListings(last.listing, listing) : [];
  if (last && changes.length === 0) return null;
  await db.insert(schema.appSnapshots).values({ appId, listing });
  // A changed listing is stored once, so the annotation cannot repeat on a second run.
  const note = listingAnnotation(changes);
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

import { desc, eq } from "drizzle-orm";
import pLimit from "p-limit";
import { getDb, schema } from "@/db";
import { getCountry } from "./countries";
import { diffListings, toListing } from "./listing-diff";
import { getAdapter } from "./stores";

export type CompetitorReport = { checked: number; changed: number; errors: { title: string; message: string }[] };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Fetches each competitor listing and stores a snapshot when it changed since the last one. */
export async function trackCompetitors(filter: { appId?: number; competitorId?: number } = {}): Promise<CompetitorReport> {
  const db = getDb();
  const rows = await db
    .select({ competitor: schema.competitors, store: schema.apps.store, country: schema.apps.country })
    .from(schema.competitors)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.competitors.appId))
    .where(
      filter.competitorId
        ? eq(schema.competitors.id, filter.competitorId)
        : filter.appId
          ? eq(schema.competitors.appId, filter.appId)
          : undefined,
    );
  const report: CompetitorReport = { checked: 0, changed: 0, errors: [] };
  const limit = pLimit(4);

  await Promise.all(
    rows.map(({ competitor, store, country }) =>
      limit(async () => {
        try {
          const meta = await getAdapter(store).getApp(competitor.storeId, { country, lang: getCountry(country).lang });
          const listing = toListing(meta);
          const [last] = await db
            .select({ listing: schema.competitorSnapshots.listing })
            .from(schema.competitorSnapshots)
            .where(eq(schema.competitorSnapshots.competitorId, competitor.id))
            .orderBy(desc(schema.competitorSnapshots.fetchedAt))
            .limit(1);
          const changes = last ? diffListings(last.listing, listing) : [];
          if (!last || changes.length > 0) {
            await db.insert(schema.competitorSnapshots).values({ competitorId: competitor.id, listing });
          }
          if (changes.length > 0) {
            report.changed++;
            await db.insert(schema.alerts).values({
              appId: competitor.appId,
              competitorId: competitor.id,
              kind: "competitor_change",
              tone: "info",
              title: `${meta.title} ha cambiado su ficha`,
              detail: changes.map((c) => c.label).join(", "),
            });
          }
          await db
            .update(schema.competitors)
            .set({
              title: meta.title,
              developer: meta.developer,
              icon: meta.icon,
              rating: meta.rating,
              ratingsCount: meta.ratingsCount,
              checkedAt: new Date(),
              error: null,
            })
            .where(eq(schema.competitors.id, competitor.id));
          report.checked++;
        } catch (error) {
          report.errors.push({ title: competitor.title, message: message(error) });
          await db.update(schema.competitors).set({ error: message(error) }).where(eq(schema.competitors.id, competitor.id));
        }
      }),
    ),
  );
  return report;
}

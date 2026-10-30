import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { type FactsMode, factsForPrompt, type ProductFacts } from "./product-facts";

export type FeatureRow = typeof schema.productFeatures.$inferSelect;
export type ReleaseRow = typeof schema.productReleases.$inferSelect;

/** The app's product sheet: facts (null until first saved), features in their order and releases, newest first. */
export async function getProductFacts(appId: number): Promise<{ facts: ProductFacts | null; features: FeatureRow[]; releases: ReleaseRow[] }> {
  const db = getDb();
  const [facts, features, releases] = await Promise.all([
    db.query.productFacts.findFirst({ where: eq(schema.productFacts.appId, appId) }),
    db
      .select()
      .from(schema.productFeatures)
      .where(eq(schema.productFeatures.appId, appId))
      .orderBy(asc(schema.productFeatures.sort), asc(schema.productFeatures.id)),
    db
      .select()
      .from(schema.productReleases)
      .where(eq(schema.productReleases.appId, appId))
      .orderBy(sql`${schema.productReleases.date} desc nulls last`, desc(schema.productReleases.id)),
  ]);
  return { facts: facts ?? null, features, releases };
}

/** The PRODUCT FACTS block for the prompts, or null when the owner has not filled in the sheet. */
export async function productFactsPrompt(appId: number, mode: FactsMode): Promise<string | null> {
  const { facts, features } = await getProductFacts(appId);
  return factsForPrompt(facts, features, mode);
}

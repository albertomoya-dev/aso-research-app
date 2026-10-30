import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCountry } from "./countries";
import { type ProductFacts, productBrandTerms } from "./product-facts";
import { type FeatureRow, getProductFacts } from "./product-queries";
import type { AppSummary } from "./stores/types";
import { competitorBrands, topCompetitors } from "./suggestions";

/** Words the user marked as «no es una marca» for this app. */
export async function getBrandExceptions(appId: number): Promise<string[]> {
  const rows = await getDb()
    .select({ word: schema.brandExceptions.word })
    .from(schema.brandExceptions)
    .where(eq(schema.brandExceptions.appId, appId))
    .orderBy(schema.brandExceptions.word);
  return rows.map((r) => r.word);
}

type ProductSheet = { facts: ProductFacts | null; features: Pick<FeatureRow, "name" | "summary">[] };

/**
 * Competitor brands for the optimizer and the editor: the 25 apps that show up most in the TOP 5 of our
 * keywords, without our own title, tracked keywords, product sheet (pitch, audience, features) or the
 * user's exceptions. Pass the product sheet when already loaded; without it the sheet is loaded here.
 */
export async function detectBrands(
  app: { id: number; storeId: string; country: string; meta: { title: string; developer: string } },
  rows: { term: string; top5: AppSummary[] }[],
  product?: ProductSheet | null,
): Promise<{ brands: string[]; exceptions: string[] }> {
  const [exceptions, sheet] = await Promise.all([
    getBrandExceptions(app.id),
    product ?? getProductFacts(app.id),
  ]);
  const brands = competitorBrands(topCompetitors(rows, app.storeId, 25), app.meta.developer, {
    ownTitle: app.meta.title,
    trackedTerms: rows.map((r) => r.term),
    productTerms: productBrandTerms(sheet.facts, sheet.features),
    exceptions,
    lang: getCountry(app.country).lang,
  });
  return { brands: brands.sort((a, b) => a.localeCompare(b)), exceptions };
}

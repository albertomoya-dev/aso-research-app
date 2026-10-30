import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { staleSlides } from "./assets/bulk-upload";
import { detectBrands } from "./brand-queries";
import { getCountry } from "./countries";
import {
  coverageItem,
  type HealthItem,
  irrelevantItem,
  listingAgeItem,
  nextSeason,
  policyItem,
  screenshotsItem,
  seasonItem,
} from "./health";
import { getListingDraft } from "./listing-draft-queries";
import { mainLocale } from "./listing-drafts";
import { draftFromMeta, weightedCoverage } from "./metadata-check";
import { policyCheck } from "./policy-check";
import { hasProductFacts } from "./product-facts";
import { getProductFacts } from "./product-queries";
import type { KeywordRow } from "./queries";
import { today } from "./ranking";
import { isLikelyIrrelevant, isRelevantKeyword, KEYWORD_BUDGET } from "./relevance";
import { analyzeSeasonality, canAnnouncePeak } from "./seasonality";
import type { AppMeta } from "./stores/types";
import type { TrendPoint } from "./trends";

type HealthApp = { id: number; store: "ios" | "android"; country: string; storeId: string; meta: AppMeta };

/**
 * Only the dates and versions of the saved screenshots, computed in Postgres: the spec carries every
 * uploaded image in base64 and the home page must not download megabytes to count them.
 */
async function screenshotDates(appId: number) {
  const rows = await getDb().execute<{ uploaded: boolean; captured_at: string | null; app_version: string | null }>(sql`
    select coalesce(s->>'image', '') like 'data:%' as uploaded, s->>'capturedAt' as captured_at, s->>'appVersion' as app_version
    from ${schema.assetDesigns}, jsonb_array_elements(${schema.assetDesigns.spec}->'slides') as s
    where ${schema.assetDesigns.appId} = ${appId} and ${schema.assetDesigns.kind} = 'screenshots'
  `);
  return rows.rows;
}

function trendPoints(app: HealthApp) {
  return getDb()
    .select({ keywordId: schema.keywordTrends.keywordId, points: schema.keywordTrends.points })
    .from(schema.keywordTrends)
    .innerJoin(schema.appKeywords, eq(schema.appKeywords.keywordId, schema.keywordTrends.keywordId))
    .where(and(eq(schema.appKeywords.appId, app.id), eq(schema.keywordTrends.country, app.country)));
}

/**
 * Every health line except the reviews one (that one waits for Google, so the page streams it apart).
 * `rows` are the keyword rows the page already loaded; the rest is one round of parallel queries plus
 * the brand exceptions, never one query per keyword.
 */
export async function loadHealth(app: HealthApp, rows: KeywordRow[]): Promise<HealthItem[]> {
  const base = `/apps/${app.id}`;
  const lang = getCountry(app.country).lang;
  const [draftRow, product, slides, trends] = await Promise.all([
    getListingDraft(app.id, mainLocale(app.country), ""),
    getProductFacts(app.id),
    screenshotDates(app.id),
    trendPoints(app),
  ]);
  const { brands } = await detectBrands({ ...app, meta: app.meta }, rows, product);

  const source = draftRow ? "draft" : "published";
  const draft = draftRow?.draft ?? draftFromMeta(app.meta);
  // The same keyword set as the editor and the optimizer: relevant ones only.
  const relevant = rows.filter((r) => isRelevantKeyword(r, lang)).map((r) => ({ term: r.term, opportunity: r.opportunity }));
  const coverage = relevant.length ? weightedCoverage(app.store, draft, relevant).score : null;

  const issues = policyCheck(app.store, draft, { lang, category: app.meta.category, keywords: rows.map((r) => r.term), brands });

  const latest = product.releases[0];
  const nextFeatures = product.features.filter((f) => f.status === "next_release" && f.advertise).length;

  const uploaded = slides.filter((s) => s.uploaded).map((s) => ({ image: "data:", capturedAt: s.captured_at, appVersion: s.app_version }));
  const stale = staleSlides(uploaded, { version: app.meta.version, updatedAt: app.meta.updatedAt }).length;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const analysed = trends.filter((t) => t.points && t.points.length > 0);
  const peaks = analysed.flatMap((t) => {
    const row = byId.get(t.keywordId);
    if (!row || !canAnnouncePeak(row.popularity) || !isRelevantKeyword(row, lang)) return [];
    const s = analyzeSeasonality(t.points as TrendPoint[]);
    return s && s.peaks.length ? [{ term: row.term, peaks: s.peaks }] : [];
  });

  return [
    coverageItem({ score: coverage, source, keywords: relevant.length, href: `${base}/metadata` }),
    irrelevantItem({ irrelevant: rows.filter((r) => isLikelyIrrelevant(r, lang)).length, total: rows.length, budget: KEYWORD_BUDGET, href: `${base}?f=noise` }),
    listingAgeItem({
      published: { version: app.meta.version, updatedAt: app.meta.updatedAt },
      latestRelease: latest ? { version: latest.version, date: latest.date } : null,
      nextFeatures,
      hasProduct: hasProductFacts(product.facts, product.features),
      productHref: `${base}/producto`,
      editorHref: `${base}/metadata`,
    }),
    screenshotsItem({ stale, uploaded: uploaded.length, hasDesign: slides.length > 0, href: `${base}/creativos` }),
    policyItem({ issues, source, href: `${base}/metadata` }),
    seasonItem({ next: nextSeason(peaks, today()), analysed: analysed.length, href: `${base}/estacionalidad` }),
  ];
}

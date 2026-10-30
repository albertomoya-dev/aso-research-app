import { and, eq, isNull, ne, or } from "drizzle-orm";
import { after } from "next/server";
import pLimit from "p-limit";
import { getDb, schema } from "@/db";
import { AiError, hasAnthropicKey, rateRelevance } from "./claude";
import { getCountry } from "./countries";
import { productFactsPrompt } from "./product-queries";
import { getKeywordRows } from "./queries";
import { chunk, cleanRatings, mergeRatings, rateable, type RelevanceContext } from "./relevance";

type App = typeof schema.apps.$inferSelect;

/** What the model needs to know about the app. Keyword research looks ahead, so next-version features count. */
export async function relevanceContextFor(app: App): Promise<RelevanceContext> {
  const country = getCountry(app.country);
  return {
    store: app.store,
    countryName: country.name,
    lang: country.lang,
    title: app.meta.title,
    developer: app.meta.developer,
    category: app.meta.category,
    shortDescription: app.meta.shortDescription,
    description: app.meta.description,
    facts: await productFactsPrompt(app.id, "next"),
  };
}

export type RateReport = {
  /** Keywords that got a relevance from the model. */
  rated: number;
  /** Keywords sent to the model (those the user has not rated by hand). */
  asked: number;
  /** First error message, in Spanish, when a batch failed. */
  error?: string;
};

/**
 * Rates with Claude the keywords the user has not rated by hand, in batches of 100, and stores
 * relevance, intent and the date. `keywordIds` limits it to some keywords (e.g. the ones just added).
 * A batch that fails is reported and the others are still stored.
 */
export async function rateAppKeywords(app: App, keywordIds?: number[]): Promise<RateReport> {
  const only = keywordIds ? new Set(keywordIds) : null;
  const [rows, context] = await Promise.all([getKeywordRows(app), relevanceContextFor(app)]);
  const targets = rateable(rows).filter((r) => !only || only.has(r.id));
  if (targets.length === 0) return { rated: 0, asked: 0 };

  const db = getDb();
  const limit = pLimit(3);
  const writes = pLimit(10);
  let rated = 0;
  let error: string | undefined;
  await Promise.all(
    chunk(targets).map((batch) =>
      limit(async () => {
        try {
          const items = batch.map((r) => ({
            term: r.term,
            top: r.top5.filter((a) => a.id !== app.storeId).map((a) => a.title),
          }));
          const { output } = await rateRelevance(context, items);
          const updates = mergeRatings(batch, cleanRatings(output, items.map((i) => i.term)));
          const now = new Date();
          await Promise.all(
            updates.map((u) =>
              writes(() =>
                db
                  .update(schema.appKeywords)
                  .set({ relevance: u.relevance, intent: u.intent, relevanceSource: "ai", relevanceCheckedAt: now })
                  .where(
                    and(
                      eq(schema.appKeywords.appId, app.id),
                      eq(schema.appKeywords.keywordId, u.id),
                      // The user may have rated it while the model was thinking.
                      or(isNull(schema.appKeywords.relevanceSource), ne(schema.appKeywords.relevanceSource, "user")),
                    ),
                  ),
              ),
            ),
          );
          rated += updates.length;
        } catch (err) {
          error ??= err instanceof AiError ? err.message : "No se pudo estimar la relevancia de un lote.";
          if (!(err instanceof AiError)) console.error("rateAppKeywords", err);
        }
      }),
    ),
  );
  return { rated, asked: targets.length, error };
}

/** What happened to the relevance of keywords just added, for the form's message. */
export type RelevanceStatus = "rated" | "pending" | "failed" | "off";

/**
 * Best effort after adding keywords: rates the new ones, waiting at most `waitMs`. If the model is
 * slower, the work goes on after the response (`after`) and the page shows it on the next load.
 * Never throws: adding keywords must not fail because of the AI.
 */
export async function rateNewKeywords(appId: number, keywordIds: number[], waitMs = 20_000): Promise<RelevanceStatus> {
  if (keywordIds.length === 0 || !hasAnthropicKey()) return "off";
  try {
    const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
    if (!app) return "off";
    const job: Promise<RelevanceStatus> = rateAppKeywords(app, keywordIds)
      .then((r) => (r.error ? "failed" : "rated"))
      .catch((err) => {
        console.error("rateNewKeywords", err);
        return "failed";
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<RelevanceStatus>((resolve) => {
      timer = setTimeout(() => resolve("pending"), waitMs);
    });
    const status = await Promise.race([job, timeout]);
    clearTimeout(timer);
    // Keeps the function alive until the model answers.
    if (status === "pending") after(() => job);
    return status;
  } catch (err) {
    console.error("rateNewKeywords", err);
    return "failed";
  }
}

import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { after } from "next/server";
import pLimit from "p-limit";
import { getDb, schema } from "@/db";
import { AiError, type AskOptions, hasAnthropicKey, rateRelevance } from "./claude";
import { getCountry } from "./countries";
import { productFactsPrompt } from "./product-queries";
import { getKeywordRows } from "./queries";
import {
  chunk,
  cleanRatings,
  mergeRatings,
  NEW_KEYWORDS_BATCH_SIZE,
  RELEVANCE_BATCH_SIZE,
  rateable,
  type RelevanceContext,
} from "./relevance";

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
  /** Keywords left out because the deadline passed before their batch started. */
  skipped?: number;
  /** First error message, in Spanish, when a batch failed. */
  error?: string;
};

export type RateOptions = {
  /** Only these keywords (e.g. the ones just added). */
  keywordIds?: number[];
  /** Keywords per request; 100 by default. */
  batchSize?: number;
  /** Requests at the same time; 3 by default. */
  concurrency?: number;
  /** Epoch ms: batches not started by then are skipped (reported in `skipped`). */
  deadline?: number;
  /** Per-request timeout and retries (the daily cron: short timeout, no retries). */
  request?: AskOptions;
};

/**
 * Rates with Claude the keywords the user has not rated by hand, in batches, and stores relevance,
 * intent and the date as each batch answers, so partial progress sticks. A batch that fails is
 * reported, its unrated keywords get `relevance_checked_at` (the table then says the AI gave nothing
 * instead of «calculando…») and the other batches are still stored. Keywords the model leaves out of
 * an answer get the same stamp, so they do not stay «pendiente» forever and the daily job tries
 * never-checked keywords before them.
 */
export async function rateAppKeywords(app: App, options: RateOptions = {}): Promise<RateReport> {
  const { keywordIds, batchSize = RELEVANCE_BATCH_SIZE, concurrency = 3, deadline, request } = options;
  const only = keywordIds ? new Set(keywordIds) : null;
  const [rows, context] = await Promise.all([getKeywordRows(app), relevanceContextFor(app)]);
  const targets = rateable(rows).filter((r) => !only || only.has(r.id));
  if (targets.length === 0) return { rated: 0, asked: 0 };

  const db = getDb();
  const limit = pLimit(concurrency);
  const writes = pLimit(10);
  let rated = 0;
  let skipped = 0;
  let error: string | undefined;
  await Promise.all(
    chunk(targets, batchSize).map((batch) =>
      limit(async () => {
        if (deadline != null && Date.now() > deadline) {
          skipped += batch.length;
          return;
        }
        try {
          const items = batch.map((r) => ({
            term: r.term,
            top: r.top5.filter((a) => a.id !== app.storeId).map((a) => a.title),
          }));
          const { output } = await rateRelevance(context, items, request);
          const updates = mergeRatings(batch, cleanRatings(output, items.map((i) => i.term)));
          const omitted = omittedIds(batch, updates);
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
          if (omitted.length > 0) await markFailed(app.id, omitted);
        } catch (err) {
          error ??= err instanceof AiError ? err.message : "No se pudo estimar la relevancia de un lote.";
          if (!(err instanceof AiError)) console.error("rateAppKeywords", err);
          await markFailed(app.id, batch.map((r) => r.id));
        }
      }),
    ),
  );
  return { rated, asked: targets.length, ...(skipped > 0 && { skipped }), error };
}

/** Keywords of a batch the model did not rate (left out of its answer). Exported for tests. */
export function omittedIds(batch: { id: number }[], updates: { id: number }[]): number[] {
  const answered = new Set(updates.map((u) => u.id));
  return batch.filter((r) => !answered.has(r.id)).map((r) => r.id);
}

/** Leaves a trace on the still unrated keywords of a failed batch or omitted by the model. Never throws. */
async function markFailed(appId: number, keywordIds: number[]): Promise<void> {
  try {
    await getDb()
      .update(schema.appKeywords)
      .set({ relevanceCheckedAt: new Date() })
      .where(
        and(
          eq(schema.appKeywords.appId, appId),
          inArray(schema.appKeywords.keywordId, keywordIds),
          isNull(schema.appKeywords.relevance),
          isNull(schema.appKeywords.relevanceSource),
        ),
      );
  } catch (err) {
    console.error("markFailed", err);
  }
}

/**
 * What happened to the relevance of keywords just added, for the form's message.
 * «none»: nothing new to rate; «off»: no ANTHROPIC_API_KEY.
 */
export type RelevanceStatus = "rated" | "pending" | "failed" | "off" | "none";

/**
 * Best effort after adding keywords: rates the new ones in small batches side by side, waiting at
 * most `waitMs`. If the model is slower, the work goes on after the response (`after`, bounded by the
 * route's maxDuration); each batch is stored as it answers, and whatever is left the daily job rates.
 * Never throws: adding keywords must not fail because of the AI.
 */
export async function rateNewKeywords(appId: number, keywordIds: number[], waitMs = 20_000): Promise<RelevanceStatus> {
  if (keywordIds.length === 0) return "none";
  if (!hasAnthropicKey()) return "off";
  try {
    const app = await getDb().query.apps.findFirst({ where: eq(schema.apps.id, appId) });
    if (!app) return "none";
    const job: Promise<RelevanceStatus> = rateAppKeywords(app, {
      keywordIds,
      batchSize: NEW_KEYWORDS_BATCH_SIZE,
      concurrency: NEW_KEYWORDS_CONCURRENCY,
    })
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

/** Requests at the same time for keywords just added: 30 keywords → 3 batches of 10 at once. */
const NEW_KEYWORDS_CONCURRENCY = 4;

/**
 * Order in which the daily job picks unrated keywords: never checked first (Postgres sorts NULLs last
 * in ascending order, hence the explicit NULLS FIRST), then least recently checked, then oldest.
 * Exported for tests.
 */
export const UNRATED_PICK_ORDER = [
  sql`${schema.appKeywords.relevanceCheckedAt} asc nulls first`,
  asc(schema.appKeywords.createdAt),
] as const;

/** Most keywords the daily job rates per run; the rest wait for the next day. */
export const MAX_UNRATED_PER_RUN = 200;

export type UnratedReport = { apps: number; asked: number; rated: number; skipped: number; errors: string[] };

export type UnratedOptions = {
  /** Most keywords per run; MAX_UNRATED_PER_RUN by default. */
  max?: number;
  /** Epoch ms: batches not started by then wait for the next run. */
  deadline?: number;
  /** Per-request timeout and retries for Claude. */
  request?: AskOptions;
};

/**
 * Daily job: rates keywords nobody has rated yet (no relevance and no source), at most `max` per run
 * across all apps, in small batches. Never-checked keywords go first (oldest first), then those the AI
 * already failed on or left out, the least recently tried first: a keyword the model keeps skipping
 * cannot crowd out new ones, and is retried only when there is room. Batches not started by
 * `deadline` wait for the next run. Returns "off" without ANTHROPIC_API_KEY.
 */
export async function rateUnratedKeywords(options: UnratedOptions = {}): Promise<UnratedReport | "off"> {
  const { max = MAX_UNRATED_PER_RUN, deadline, request } = options;
  if (!hasAnthropicKey()) return "off";
  const db = getDb();
  const unrated = await db
    .select({ appId: schema.appKeywords.appId, keywordId: schema.appKeywords.keywordId })
    .from(schema.appKeywords)
    .where(and(isNull(schema.appKeywords.relevance), isNull(schema.appKeywords.relevanceSource)))
    .orderBy(...UNRATED_PICK_ORDER)
    .limit(max);
  const report: UnratedReport = { apps: 0, asked: 0, rated: 0, skipped: 0, errors: [] };
  for (const [appId, rows] of Map.groupBy(unrated, (r) => r.appId)) {
    if (deadline != null && Date.now() > deadline) {
      report.skipped += rows.length;
      continue;
    }
    const app = await db.query.apps.findFirst({ where: eq(schema.apps.id, appId) });
    if (!app) continue;
    const result = await rateAppKeywords(app, {
      keywordIds: rows.map((r) => r.keywordId),
      batchSize: NEW_KEYWORDS_BATCH_SIZE,
      deadline,
      request,
    });
    report.apps++;
    report.asked += result.asked;
    report.rated += result.rated;
    report.skipped += result.skipped ?? 0;
    if (result.error) report.errors.push(`${app.title}: ${result.error}`);
  }
  return report;
}

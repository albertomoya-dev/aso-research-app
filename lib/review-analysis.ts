import { z } from "zod";
import { genericWordsFor, stopwordsFor } from "./stopwords";
import type { Review } from "./stores/types";
import { fold } from "./text";

export const REVIEW_PROMPT_VERSION = "rv-3";
/** Enough to see patterns while keeping the prompt small. */
export const MAX_REVIEWS = 300;
const MAX_REVIEW_CHARS = 600;

export const reviewAnalysisSchema = z.object({
  summary: z.string(),
  themes: z.array(
    z.object({
      theme: z.string(),
      sentiment: z.enum(["positive", "negative", "mixed"]),
      share: z.number(),
      quote: z.string(),
    }),
  ),
  complaints: z.array(z.string()),
  requests: z.array(z.string()),
  keywordIdeas: z.array(z.object({ keyword: z.string(), reason: z.string() })),
  listingTips: z.array(z.string()),
  /** Competitor complaints and requests that our app already solves (empty for our own app). */
  opportunities: z.array(z.object({ need: z.string(), feature: z.string(), quote: z.string() })),
});

/** What is stored: analyses made before rv-3 have no opportunities. */
export const storedReviewAnalysisSchema = reviewAnalysisSchema.extend({ opportunities: reviewAnalysisSchema.shape.opportunities.optional() });
export type ReviewAnalysis = z.infer<typeof storedReviewAnalysisSchema>;

/** Stored when the store returns no recent reviews, so the page can say so after a reload. */
export const EMPTY_REVIEW_ANALYSIS: ReviewAnalysis = {
  summary: "",
  themes: [],
  complaints: [],
  requests: [],
  keywordIdeas: [],
  listingTips: [],
  opportunities: [],
};
/** `model` of a stored "no reviews" check: Claude was not asked. */
export const NO_REVIEWS_MODEL = "sin-reseñas";

export const REVIEW_SYSTEM_PROMPT = `You analyse app store reviews for an App Store Optimization (ASO) specialist.

From the reviews you get, produce:
- summary: two or three sentences in Spanish on what users think of the app.
- themes: the 4 to 8 topics users mention most, each with its sentiment, the approximate share of reviews that mention it (0 to 100) and one short literal quote from a review, in its original language.
- complaints: the most repeated problems, in Spanish, most frequent first (up to 6).
- requests: features users ask for, in Spanish (up to 6).
- keywordIdeas: up to 12 search phrases in the store's language that users use to describe the app or what they need it for. Lower case, one to four words, no brand names of other apps. reason is one short Spanish sentence.
- listingTips: up to 5 concrete, short Spanish suggestions for the store listing (title, subtitle, screenshots, description) based on what users value or misunderstand.

Base everything on the reviews. If there are few reviews, return fewer items rather than guessing.

When the prompt includes PRODUCT FACTS outside an "OUR APP" section (what the reviewed app really does, declared by its owner), use them to tell real gaps from misunderstandings: a request for a feature the app already has is not a missing feature. Leave it out of requests and turn it into a listingTip that makes the feature easier to find (say which feature). Never contradict PRODUCT FACTS.

When the prompt has a section that starts with "OUR APP", the reviewed app is a competitor of ours and the PRODUCT FACTS in that section describe OUR app, not the reviewed one: never use them to describe or judge the reviewed app. Use them only for opportunities:
- opportunities: up to 6 complaints or requests from these competitor reviews that OUR app already solves according to OUR APP's PRODUCT FACTS. need is the user's problem or wish, in Spanish; feature is the name of our feature that solves it, exactly as written in OUR APP; quote is one short literal quote from a review, in its original language, that shows the need. Only features listed as available count. If nothing matches, return an empty list; never stretch a feature to fit.
Without an "OUR APP" section, return opportunities as an empty list.`;

const clip = (s: string) => (s.length > MAX_REVIEW_CHARS ? `${s.slice(0, MAX_REVIEW_CHARS)}…` : s);

export type ReviewPromptInput = {
  appTitle: string;
  storeName: string;
  countryName: string;
  lang: string;
  reviews: Review[];
  /** PRODUCT FACTS block of the reviewed app (only for our own app), or null. */
  facts: string | null;
  /** PRODUCT FACTS of our app when the reviewed app is a competitor, for the opportunities. */
  ourFacts?: string | null;
  /** Version in the store, to tell complaints about old versions apart. */
  version?: string | null;
};

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const lines = input.reviews
    .slice(0, MAX_REVIEWS)
    .map((r) => `[${r.rating}★ ${r.date.slice(0, 10)}${r.version ? ` v${r.version}` : ""}] ${clip([r.title, r.text].filter(Boolean).join(". ").replace(/\s+/g, " "))}`);
  return [
    `App: ${input.appTitle} (${input.storeName}, ${input.countryName}, language code ${input.lang}).`,
    input.version ? `Version in the store now: ${input.version}.` : null,
    input.facts ? `\n${input.facts}\n` : null,
    input.ourFacts
      ? `\nOUR APP (the reviewed app is a competitor; these facts describe our app, use them only for opportunities):\n${input.ourFacts}\n`
      : null,
    `${lines.length} most recent reviews:`,
    ...lines,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export type RatingStats = { count: number; average: number | null; distribution: number[]; from: string | null; to: string | null };

/** Counts per star (index 0 = 1 star) and the date range covered. */
export function ratingStats(reviews: Review[]): RatingStats {
  const distribution = [0, 0, 0, 0, 0];
  for (const r of reviews) if (r.rating >= 1 && r.rating <= 5) distribution[Math.round(r.rating) - 1]++;
  const rated = distribution.reduce((a, b) => a + b, 0);
  const dates = reviews.map((r) => r.date).sort();
  return {
    count: reviews.length,
    average: rated ? distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / rated : null,
    distribution,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
}

// ---------- What the category asks for ----------

export type CategorySource = { targetTitle: string; result: ReviewAnalysis };
export type FeatureRef = { name: string; summary: string };

export type CategoryAsk = {
  text: string;
  kind: "complaint" | "request";
  /** Competitors whose reviews mention it. */
  apps: string[];
  /** Our feature that already covers it, or null: a possible future feature. */
  coveredBy: string | null;
};

const STEM = 5;
/** Meaningful words, cut to their first letters so "escanear" and "escáner" or "códigos" and "código" match. */
function stems(text: string): string[] {
  const skip = new Set([...stopwordsFor("es"), ...genericWordsFor("es")]);
  return [
    ...new Set(
      fold(text)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4 && !skip.has(w))
        .map((w) => w.slice(0, STEM)),
    ),
  ];
}

/**
 * The feature that covers a need, by plain word matching (no AI): at least half of the meaningful
 * words of the feature name appear in the need. Falls back to two shared words with the summary.
 */
export function coveringFeature(need: string, features: FeatureRef[]): string | null {
  const words = new Set(stems(need));
  if (words.size === 0) return null;
  let best: { name: string; score: number } | null = null;
  for (const f of features) {
    const name = stems(f.name);
    const inName = name.filter((w) => words.has(w)).length;
    const inSummary = stems(f.summary).filter((w) => words.has(w)).length;
    const score = name.length && inName / name.length >= 0.5 ? 1 + inName / name.length : inSummary >= 2 ? inSummary / 10 : 0;
    if (score > 0 && (!best || score > best.score)) best = { name: f.name, score };
  }
  return best?.name ?? null;
}

/**
 * Joins the complaints and requests of the latest analysis of each competitor. Repeated items
 * (same words) merge and keep every app that mentions them. Opportunities the model found count
 * as covered by the feature it named. Most mentioned first, requests before complaints on ties.
 */
export function aggregateCategoryAsks(sources: CategorySource[], features: FeatureRef[]): CategoryAsk[] {
  const asks = new Map<string, CategoryAsk>();
  const add = (text: string, kind: CategoryAsk["kind"], app: string, coveredBy: string | null) => {
    const key = fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key) return;
    const known = asks.get(key);
    if (known) {
      if (!known.apps.includes(app)) known.apps.push(app);
      known.coveredBy ??= coveredBy;
      if (kind === "request") known.kind = "request";
    } else {
      asks.set(key, { text: text.trim(), kind, apps: [app], coveredBy });
    }
  };
  for (const { targetTitle, result } of sources) {
    for (const o of result.opportunities ?? []) add(o.need, "complaint", targetTitle, o.feature);
    for (const c of result.complaints) add(c, "complaint", targetTitle, coveringFeature(c, features));
    for (const r of result.requests) add(r, "request", targetTitle, coveringFeature(r, features));
  }
  return [...asks.values()].sort((a, b) => b.apps.length - a.apps.length || (a.kind === b.kind ? 0 : a.kind === "request" ? -1 : 1));
}

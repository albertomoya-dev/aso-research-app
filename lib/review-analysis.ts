import { z } from "zod";
import { factsForPrompt, type ProductFacts, type ProductFeature } from "./product-facts";
import { genericWordsFor, stopwordsFor } from "./stopwords";
import type { Review } from "./stores/types";
import { fold } from "./text";

export const REVIEW_PROMPT_VERSION = "rv-6";
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
  /**
   * Competitor complaints and requests that our app solves (empty for our own app): with a feature of
   * the published version ("published") or of the next one ("next").
   */
  opportunities: z.array(z.object({ need: z.string(), feature: z.string(), quote: z.string(), status: z.enum(["published", "next"]) })),
});

const opportunitySchema = reviewAnalysisSchema.shape.opportunities.element;
/** What is stored: analyses made before rv-3 have no opportunities, before rv-5 no opportunity status (published). */
export const storedReviewAnalysisSchema = reviewAnalysisSchema.extend({
  opportunities: z.array(opportunitySchema.extend({ status: opportunitySchema.shape.status.optional() })).optional(),
});
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
- listingTips: up to 5 concrete, short Spanish suggestions for the store listing (title, subtitle, screenshots, description) based on what users value or misunderstand. When the reviewed app is a competitor (an "OUR APP" section, see below), the tips are for OUR listing, never for the competitor's.

Base everything on the reviews. If there are few reviews, return fewer items rather than guessing.

When the prompt includes PRODUCT FACTS outside an "OUR APP" section (what the reviewed app really does, declared by its owner), use them to tell real gaps from misunderstandings: a request for a feature the app already has is not a missing feature. Leave it out of requests and turn it into a listingTip that makes the feature easier to find (say which feature). Never contradict PRODUCT FACTS.

When the prompt has a section that starts with "OUR APP", the reviewed app is a competitor of ours and the PRODUCT FACTS in that section (if any) describe OUR app, not the reviewed one: never use them to describe or judge the reviewed app. Use them for listingTips and opportunities:
- listingTips are advice for OUR app's listing, drawn from what the competitor's users complain about or miss: "their users complain about X, so show that ours does Y" (for example: "Sus usuarios se quejan de la suscripción: destaca en el subtítulo y en la primera captura que la tuya es gratis y sin suscripción"). Never give advice to the competitor: do not tell it to explain its trial, its prices, its data policy or its features better. Never suggest anything that contradicts OUR APP's PRODUCT FACTS or that they do not support: if they do not mention a trial, a subscription, an account or a feature, do not suggest promoting it. Without PRODUCT FACTS for our app, only suggest how to speak to the needs the competitor's users show, without claiming features.
- opportunities: up to 8 complaints or requests from these competitor reviews that OUR app solves according to OUR APP's PRODUCT FACTS. need is the user's problem or wish, in Spanish; feature is the name of our feature that solves it, exactly as written in OUR APP; quote is one short literal quote from a review, in its original language, that shows the need; status is "published" when the feature is available in the published version and "next" when it is listed under OUR NEXT VERSION. Judge by what the feature does (its summary), not by shared words: "intervals every X hours that never end" is solved by a feature whose summary offers schedules "every X hours". Only features listed as available or under OUR NEXT VERSION count, never planned or retired ones. If nothing matches, return an empty list; never stretch a feature to fit.
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
  /** PRODUCT FACTS of our app when the reviewed app is a competitor, for the tips and opportunities. */
  ourFacts?: string | null;
  /** Our app's title when the reviewed app is a competitor: the tips are for it, even without facts. */
  ourAppTitle?: string | null;
  /** Version in the store, to tell complaints about old versions apart. */
  version?: string | null;
};

/**
 * OUR APP's facts for a competitor's review analysis: the published version (what listingTips may
 * claim) plus the features of the next version, marked apart, so opportunities can say "next".
 */
export function ourFactsForReviews(facts: ProductFacts | null, features: ProductFeature[]): string | null {
  const published = factsForPrompt(facts, features, "published");
  if (!published) return null;
  const next = features.filter((f) => f.advertise && f.status === "next_release");
  if (next.length === 0) return published;
  return [
    published,
    "OUR NEXT VERSION (about to ship, not in the store yet): these features count for opportunities with status \"next\", but listingTips must not claim them as available today:",
    // The section says they are the next version: a marker after the name would end up copied into `feature`.
    ...next.map((f) => `- ${f.name}${f.summary.trim() ? `: ${f.summary.trim()}` : ""}`),
  ].join("\n");
}

type Opportunity = ReviewAnalysis["opportunities"] extends (infer O)[] | undefined ? O : never;

/**
 * A feature name as the model may write it, reduced to compare: folded, without trailing parentheticals
 * («(next version)», «(próxima versión)»), quotes and trailing punctuation. Exported for tests.
 */
export function featureKey(name: string): string {
  let key = fold(name).replace(/\s+/g, " ").trim();
  for (let previous = ""; previous !== key; ) {
    previous = key;
    key = key
      .replace(/\s*\([^()]*\)$/u, "")
      .replace(/^["'«»“”‘’`*\s-]+|["'«»“”‘’`*\s.,;:!?…]+$/gu, "")
      .trim();
  }
  return key;
}

/** When two features share a name, the one that solves something wins: shipped, then next_release. */
const STATUS_RANK: Record<ProductFeature["status"], number> = { shipped: 3, next_release: 2, planned: 1, retired: 0 };

/**
 * Trusts the feature list over the model for the status: an opportunity named after a feature of the
 * next version is "next" even if the model said "published", and the other way round. Planned and
 * retired features solve nothing today and are dropped, and so are names of no current feature when the
 * list is known (a feature deleted from the product sheet solves nothing either). Only without a feature
 * list do names keep what the model said. Names are compared by `featureKey`.
 */
export function fixOpportunityStatus<O extends Opportunity>(opportunities: O[], features: Pick<ProductFeature, "name" | "status">[]): O[] {
  const statusOf = new Map<string, ProductFeature["status"]>();
  for (const f of features) {
    const key = featureKey(f.name);
    const known = statusOf.get(key);
    if (!known || STATUS_RANK[f.status] > STATUS_RANK[known]) statusOf.set(key, f.status);
  }
  return opportunities.flatMap((o) => {
    const status = statusOf.get(featureKey(o.feature));
    if (status === "planned" || status === "retired" || (status === undefined && statusOf.size > 0)) return [];
    return [status === "next_release" ? { ...o, status: "next" } : status === "shipped" ? { ...o, status: "published" } : o];
  });
}

/**
 * Stored analyses with the status of their opportunities checked against today's feature list: the check
 * at save time goes stale when a feature ships, is retired or is deleted later. An analysis without opportunities
 * (before rv-5) keeps them undefined.
 */
export function withCurrentOpportunityStatus<T extends { result: ReviewAnalysis }>(
  analyses: T[],
  features: Pick<ProductFeature, "name" | "status">[],
): T[] {
  return analyses.map((a) =>
    a.result.opportunities ? { ...a, result: { ...a.result, opportunities: fixOpportunityStatus(a.result.opportunities, features) } } : a,
  );
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const lines = input.reviews
    .slice(0, MAX_REVIEWS)
    .map((r) => `[${r.rating}★ ${r.date.slice(0, 10)}${r.version ? ` v${r.version}` : ""}] ${clip([r.title, r.text].filter(Boolean).join(". ").replace(/\s+/g, " "))}`);
  return [
    `App: ${input.appTitle} (${input.storeName}, ${input.countryName}, language code ${input.lang}).`,
    input.version ? `Version in the store now: ${input.version}.` : null,
    input.facts ? `\n${input.facts}\n` : null,
    input.ourFacts || input.ourAppTitle
      ? [
          `\nOUR APP${input.ourAppTitle ? ` (${input.ourAppTitle})` : ""}: the reviewed app is a competitor of ours. Every listingTip is for OUR listing, drawn from the complaints of ${input.appTitle}'s users; never advice for ${input.appTitle}.`,
          input.ourFacts
            ? `These PRODUCT FACTS describe our app, not ${input.appTitle}. Never suggest anything they do not support (no trials, subscriptions or features they do not list):\n${input.ourFacts}\n`
            : "There are no PRODUCT FACTS for our app: do not claim features in the tips, and return opportunities as an empty list.\n",
        ].join("\n")
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

/**
 * How sure a match is: "ia" when the model named the feature (opportunities), "alta" when two or
 * more meaningful words of the feature name appear in the need, "media" when three or more appear
 * between the name and the summary.
 */
export type MatchConfidence = "ia" | "alta" | "media";
export type FeatureMatch = { name: string; confidence: MatchConfidence };

export type CategoryAsk = {
  text: string;
  kind: "complaint" | "request";
  /** Competitors whose reviews mention it. */
  apps: string[];
  /** Our published feature that already covers it, or null. */
  coveredBy: FeatureMatch | null;
  /** A feature of the next version that will cover it (only when no published one does), or null. */
  nextBy: FeatureMatch | null;
};

const STEM = 5;
/**
 * Stems too common in reviews and feature lists to tell two things apart: "medicamentos" is in
 * every ask of a medication app, "funciona" or "problema" in every complaint.
 */
const COMMON_STEMS = new Set(["medic", "funci", "aplic", "usado", "usada", "usand", "utili", "probl", "error", "fallo", "falla", "pueda", "quier"]);
const SKIP = new Set([...stopwordsFor("es"), ...genericWordsFor("es")]);

/** Meaningful words, cut to their first letters so "escanear" and "escáner" or "códigos" and "código" match. */
function stems(text: string): string[] {
  return [
    ...new Set(
      fold(text)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4 && !SKIP.has(w))
        .map((w) => w.slice(0, STEM))
        .filter((w) => !COMMON_STEMS.has(w)),
    ),
  ];
}

/** Shared meaningful words needed with the feature name ("alta") or with name and summary together ("media"). */
const MIN_IN_NAME = 2;
const MIN_IN_FEATURE = 3;

/**
 * The feature that covers a need, by plain word matching (no AI), or null. One shared word is never
 * enough ("Traducción incompleta, con partes en inglés" is not covered by "Español e inglés").
 */
export function coveringFeature(need: string, features: FeatureRef[]): FeatureMatch | null {
  const words = new Set(stems(need));
  if (words.size < 2) return null;
  let best: { match: FeatureMatch; score: number } | null = null;
  for (const f of features) {
    const name = stems(f.name);
    const all = new Set([...name, ...stems(f.summary)]);
    const inName = name.filter((w) => words.has(w)).length;
    const inFeature = [...all].filter((w) => words.has(w)).length;
    const confidence = inName >= MIN_IN_NAME ? "alta" : inFeature >= MIN_IN_FEATURE ? "media" : null;
    if (!confidence) continue;
    const score = (confidence === "alta" ? 100 : 0) + inFeature * 10 + inName;
    if (!best || score > best.score) best = { match: { name: f.name, confidence }, score };
  }
  return best?.match ?? null;
}

/**
 * Joins the complaints and requests of the latest analysis of each competitor. Repeated items
 * (same words) merge and keep every app that mentions them. Opportunities the model found count
 * as covered by the feature it named, or as solved by the next version when it said so. What no published feature covers is matched against the
 * features of the next version. Most mentioned first, requests before complaints on ties.
 */
export function aggregateCategoryAsks(sources: CategorySource[], features: FeatureRef[], nextFeatures: FeatureRef[] = []): CategoryAsk[] {
  const asks = new Map<string, CategoryAsk>();
  const add = (text: string, kind: CategoryAsk["kind"], app: string, coveredBy: FeatureMatch | null, nextBy: FeatureMatch | null = null) => {
    const key = fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key) return;
    const known = asks.get(key);
    if (known) {
      if (!known.apps.includes(app)) known.apps.push(app);
      known.coveredBy ??= coveredBy;
      known.nextBy ??= nextBy;
      if (kind === "request") known.kind = "request";
    } else {
      asks.set(key, { text: text.trim(), kind, apps: [app], coveredBy, nextBy });
    }
  };
  for (const { targetTitle, result } of sources) {
    for (const o of result.opportunities ?? []) {
      const match: FeatureMatch = { name: o.feature, confidence: "ia" };
      // Before rv-5 every opportunity was a published feature.
      if (o.status === "next") add(o.need, "complaint", targetTitle, null, match);
      else add(o.need, "complaint", targetTitle, match);
    }
    for (const c of result.complaints) add(c, "complaint", targetTitle, coveringFeature(c, features));
    for (const r of result.requests) add(r, "request", targetTitle, coveringFeature(r, features));
  }
  // Word matching is the fallback when the model did not place the ask in the next version.
  for (const ask of asks.values()) ask.nextBy = ask.coveredBy ? null : (ask.nextBy ?? coveringFeature(ask.text, nextFeatures));
  return [...asks.values()].sort((a, b) => b.apps.length - a.apps.length || (a.kind === b.kind ? 0 : a.kind === "request" ? -1 : 1));
}

import { z } from "zod";
import type { Review } from "./stores/types";

export const REVIEW_PROMPT_VERSION = "rv-1";
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
});
export type ReviewAnalysis = z.infer<typeof reviewAnalysisSchema>;

export const REVIEW_SYSTEM_PROMPT = `You analyse app store reviews for an App Store Optimization (ASO) specialist.

From the reviews you get, produce:
- summary: two or three sentences in Spanish on what users think of the app.
- themes: the 4 to 8 topics users mention most, each with its sentiment, the approximate share of reviews that mention it (0 to 100) and one short literal quote from a review, in its original language.
- complaints: the most repeated problems, in Spanish, most frequent first (up to 6).
- requests: features users ask for, in Spanish (up to 6).
- keywordIdeas: up to 12 search phrases in the store's language that users use to describe the app or what they need it for. Lower case, one to four words, no brand names of other apps. reason is one short Spanish sentence.
- listingTips: up to 5 concrete, short Spanish suggestions for the store listing (title, subtitle, screenshots, description) based on what users value or misunderstand.

Base everything on the reviews. If there are few reviews, return fewer items rather than guessing.`;

const clip = (s: string) => (s.length > MAX_REVIEW_CHARS ? `${s.slice(0, MAX_REVIEW_CHARS)}…` : s);

export function buildReviewPrompt(input: { appTitle: string; storeName: string; countryName: string; lang: string; reviews: Review[] }): string {
  const lines = input.reviews
    .slice(0, MAX_REVIEWS)
    .map((r) => `[${r.rating}★ ${r.date.slice(0, 10)}${r.version ? ` v${r.version}` : ""}] ${clip([r.title, r.text].filter(Boolean).join(". ").replace(/\s+/g, " "))}`);
  return [
    `App: ${input.appTitle} (${input.storeName}, ${input.countryName}, language code ${input.lang}).`,
    `${lines.length} most recent reviews:`,
    ...lines,
  ].join("\n");
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

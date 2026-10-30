import { z } from "zod";
import { normalizeKeyword } from "./keywords";
import { isNoiseTerm } from "./stopwords";
import type { Store } from "./stores/types";

/** Bump when the instructions or the output shape change. */
export const RELEVANCE_PROMPT_VERSION = "rel-1";
/** Keywords per request: cheap enough and the answer stays well under the output limit. */
export const RELEVANCE_BATCH_SIZE = 100;
/** Above this many keywords per app, alerts and visibility share lose precision. */
export const KEYWORD_BUDGET = 150;
/** Relevance at or below this counts as "probably irrelevant". */
export const LOW_RELEVANCE = 2;

export const RELEVANCE_SOURCES = ["ai", "user"] as const;
export type RelevanceSource = (typeof RELEVANCE_SOURCES)[number];
export const KEYWORD_INTENTS = ["own", "foreign"] as const;
export type KeywordIntent = (typeof KEYWORD_INTENTS)[number];

export const RELEVANCE_SOURCE_LABEL: Record<RelevanceSource, string> = { ai: "IA", user: "Tuya" };

/** Loose on purpose so the structured-output schema stays simple; `cleanRatings` checks each item after. */
export const relevanceOutputSchema = z.object({
  ratings: z.array(
    z.object({
      term: z.string(),
      relevance: z.number(),
      intent: z.string(),
      reason: z.string(),
    }),
  ),
});
export type RelevanceOutput = z.infer<typeof relevanceOutputSchema>;

export const ratingSchema = z.object({
  term: z.string().transform(normalizeKeyword).pipe(z.string().min(1).max(100)),
  relevance: z.number().transform(Math.round).pipe(z.number().int().min(1).max(5)),
  intent: z.enum(KEYWORD_INTENTS).catch("own"),
  reason: z
    .string()
    .trim()
    .transform((r) => r.slice(0, 200)),
});
export type Rating = z.infer<typeof ratingSchema>;

export const RELEVANCE_SYSTEM_PROMPT = `You are an App Store Optimization (ASO) specialist. You rate how relevant each search keyword is for one app: would a person who types it into the store be happy to find this app?

Rules:
- relevance from 1 to 5: 5 the keyword describes exactly what the app is or its main use; 4 a clear feature or need the app covers; 3 related and worth tracking; 2 loosely related or too broad for this app to rank (single generic words such as "phone", "notes" or "doctor" usually go here); 1 unrelated, filler words ("now", "you can", "etc"), or another product's brand.
- When the prompt includes PRODUCT FACTS, they are the source of truth about what the app does; the listing may be outdated. Features listed as retired or not yet available do not count.
- intent: "own" when people searching it want an app like this one; "foreign" when they want something else, for example a game, a cartoon, a messenger or a clock app. Each keyword comes with the titles of the apps ranking first for it today: when at least 4 of those 5 are clearly a different kind of app, the intent is "foreign" (and relevance should be 2 or less). With no titles, judge from the words alone.
- reason: one short sentence in Spanish, at most 15 words.
- Return exactly one item per keyword, with term written exactly as given. Do not add keywords.`;

export type RelevanceContext = {
  store: Store;
  countryName: string;
  lang: string;
  title: string;
  developer: string;
  category: string | null;
  shortDescription: string | null;
  description: string;
  /** PRODUCT FACTS block from `factsForPrompt`, or null without a product sheet. */
  facts: string | null;
};

export type RelevanceItem = {
  term: string;
  /** Titles of the first search results today; empty when never tracked. */
  top: string[];
};

const clip = (s: string | null | undefined, max: number) => {
  const flat = (s ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat || "–";
};

export function buildRelevancePrompt(context: RelevanceContext, items: RelevanceItem[]): string {
  return [
    `Store: ${context.store === "ios" ? "Apple App Store" : "Google Play"}, country: ${context.countryName}, language code: ${context.lang}.`,
    "",
    context.facts ? "App listing (may be outdated; PRODUCT FACTS below win):" : "App listing:",
    `Title: ${context.title}`,
    `Developer: ${context.developer}`,
    `Category: ${context.category ?? "–"}`,
    context.store === "android" ? `Short description: ${clip(context.shortDescription, 200)}` : null,
    `Description: ${clip(context.description, 1500)}`,
    context.facts ? "" : null,
    context.facts,
    "",
    `Keywords to rate (${items.length}), each with the apps ranking first for it today:`,
    ...items.map((i) => `- ${i.term}${i.top.length ? ` | top results: ${i.top.map((t) => clip(t, 40)).join("; ")}` : ""}`),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Splits a list into batches of `size` (100 by default), in order. */
export function chunk<T>(items: T[], size = RELEVANCE_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Valid ratings for the keywords that were asked about, one per keyword; anything else is dropped. */
export function cleanRatings(output: RelevanceOutput, asked: string[]): Rating[] {
  const wanted = new Set(asked.map(normalizeKeyword));
  const seen = new Set<string>();
  const out: Rating[] = [];
  for (const raw of output.ratings) {
    const parsed = ratingSchema.safeParse(raw);
    if (!parsed.success || !wanted.has(parsed.data.term) || seen.has(parsed.data.term)) continue;
    seen.add(parsed.data.term);
    out.push(parsed.data);
  }
  return out;
}

export type StoredRelevance = {
  id: number;
  term: string;
  relevance: number | null;
  relevanceSource: RelevanceSource | null;
};

export type RelevanceUpdate = { id: number; relevance: number; intent: KeywordIntent; relevanceSource: "ai" };

/** Keywords the AI may (re)rate: everything the user has not rated by hand. */
export function rateable<T extends Pick<StoredRelevance, "relevanceSource">>(rows: T[]): T[] {
  return rows.filter((r) => r.relevanceSource !== "user");
}

/** Updates to store for the model's ratings. Never touches a keyword whose relevance the user set. */
export function mergeRatings(rows: StoredRelevance[], ratings: Rating[]): RelevanceUpdate[] {
  const byTerm = new Map(ratings.map((r) => [r.term, r]));
  const updates: RelevanceUpdate[] = [];
  for (const row of rows) {
    if (row.relevanceSource === "user") continue;
    const rating = byTerm.get(normalizeKeyword(row.term));
    if (rating) updates.push({ id: row.id, relevance: rating.relevance, intent: rating.intent, relevanceSource: "ai" });
  }
  return updates;
}

// ---------- Hygiene ----------

export type HygieneRow = { term: string; relevance: number | null; intent: KeywordIntent | null };

export type NoiseReason = "filler" | "foreign" | "low";

export const NOISE_REASON_LABEL: Record<NoiseReason, string> = {
  filler: "Palabra vacía",
  foreign: "Intención ajena",
  low: "Relevancia baja",
};

/**
 * Why a keyword is probably not worth tracking, or null when it looks fine: a filler or generic
 * word, a search where people want another kind of app, or relevance 2 or less.
 */
export function noiseReason(row: HygieneRow, lang: string): NoiseReason | null {
  if (isNoiseTerm(row.term, lang)) return "filler";
  if (row.intent === "foreign") return "foreign";
  if (row.relevance != null && row.relevance <= LOW_RELEVANCE) return "low";
  return null;
}

/** The «Probablemente irrelevantes» filter. */
export function isLikelyIrrelevant(row: HygieneRow, lang: string): boolean {
  return noiseReason(row, lang) !== null;
}

/**
 * Keywords to build on (optimizer, alerts, visibility): not noise and rated 3 or more.
 * Unrated keywords pass, since nobody has judged them yet.
 */
export function isRelevantKeyword(row: HygieneRow, lang: string): boolean {
  return !isLikelyIrrelevant(row, lang) && (row.relevance == null || row.relevance >= 3);
}

/** Should a candidate (TOP 10, Descubrir) start ticked? Not when it is filler or rated 2 or less. */
export function preselect(term: string, relevance: number | null | undefined, lang: string): boolean {
  return !isNoiseTerm(term, lang) && !(relevance != null && relevance <= LOW_RELEVANCE);
}

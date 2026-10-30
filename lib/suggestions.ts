import { z } from "zod";
import { normalizeKeyword } from "./keywords";
import type { AppMeta, Store } from "./stores/types";

/** Bump when the instructions or the output shape change, so old suggestions can be told apart. */
export const PROMPT_VERSION = "kw-2";
export const MAX_SUGGESTIONS = 40;

export const INTENTS = ["category", "feature", "problem", "audience", "competitor-alternative", "long-tail"] as const;
export const COMPETITION = ["low", "medium", "high"] as const;

export const INTENT_LABEL: Record<(typeof INTENTS)[number], string> = {
  category: "Categoría",
  feature: "Función",
  problem: "Problema",
  audience: "Público",
  "competitor-alternative": "Alternativa",
  "long-tail": "Long tail",
};
export const COMPETITION_LABEL: Record<(typeof COMPETITION)[number], string> = { low: "Baja", medium: "Media", high: "Alta" };

/**
 * Shape requested from the model. Kept loose (plain strings and numbers) so the
 * structured-output schema stays simple; `suggestionSchema` checks each item after.
 */
export const modelOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      keyword: z.string(),
      language: z.string(),
      intent: z.string(),
      relevance: z.number(),
      estimatedCompetition: z.string(),
      reason: z.string(),
    }),
  ),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

export const suggestionSchema = z.object({
  keyword: z.string().transform(normalizeKeyword).pipe(z.string().min(2).max(60)),
  language: z.string().trim().toLowerCase().min(2).max(10),
  intent: z.enum(INTENTS).catch("long-tail"),
  relevance: z.number().int().min(1).max(5),
  estimatedCompetition: z.enum(COMPETITION).catch("medium"),
  reason: z.string().trim().min(1).max(300),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const SYSTEM_PROMPT = `You are an App Store Optimization (ASO) specialist. You propose search keywords that real users type into the App Store or Google Play to find an app like the one described.

Rules:
- Write every keyword in the store's language, the way people type it in that country: lower case, no punctuation, no hashtags, one to four words.
- Only propose keywords that describe what the app actually does or the problem it solves. Relevance means how well the app answers that search, from 1 (barely related) to 5 (exactly what the app is).
- When the prompt includes PRODUCT FACTS, they are the source of truth about what the app does: use the features listed there (the listing is only a reference and may be outdated), never propose keywords for features it does not list, and follow its constraints. Without PRODUCT FACTS, rely on the listing and do not invent features.
- Never propose brand names of other apps or companies, even when they are listed as competitors. You may propose generic alternatives ("strava alternative" is not allowed, "running tracker" is).
- Do not repeat keywords the user already tracks or has rejected, and do not return two keywords that only differ in plural, accents or word order.
- Mix short category terms with specific long-tail phrases. Long-tail phrases are usually easier to rank for.
- estimatedCompetition is your guess of how crowded the results are (low, medium, high). You do not know real search volumes, so do not invent numbers.
- intent is one of: category (what kind of app), feature (a capability), problem (what the user wants to solve), audience (who it is for), competitor-alternative (generic term people use when switching apps), long-tail (specific phrase).
- reason is one short sentence in Spanish explaining why the keyword fits this app.
- The autocomplete phrases come from the store itself and show what people really search. Prefer them, or close variants, when they are relevant.
- Return between 20 and ${MAX_SUGGESTIONS} keywords, best first.`;

export type PromptInput = {
  store: Store;
  countryName: string;
  lang: string;
  meta: Pick<AppMeta, "title" | "developer" | "category" | "shortDescription" | "description"> &
    Partial<Pick<AppMeta, "version" | "releaseNotes">>;
  /** PRODUCT FACTS block from `factsForPrompt`, or null when the owner has not filled in the product sheet. */
  facts: string | null;
  existing: string[];
  rejected: string[];
  autocomplete: string[];
  competitors: { title: string; developer: string }[];
  focus?: string;
};

const clip = (s: string | null | undefined, max: number) => (s ? (s.length > max ? `${s.slice(0, max)}…` : s) : "–");
const list = (items: string[]) => (items.length ? items.join(", ") : "(none)");

export function buildUserPrompt(input: PromptInput): string {
  const { meta } = input;
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"}, country: ${input.countryName}, language code: ${input.lang}.`,
    "",
    input.facts ? "App listing (may be outdated; PRODUCT FACTS below win):" : "App listing:",
    `Title: ${meta.title}`,
    `Developer: ${meta.developer}`,
    `Category: ${meta.category ?? "–"}`,
    input.store === "android" ? `Short description: ${clip(meta.shortDescription, 200)}` : null,
    `Description: ${clip(meta.description, 3000)}`,
    meta.version ? `Published version: ${meta.version}${meta.releaseNotes ? `. Release notes: ${clip(meta.releaseNotes, 500)}` : ""}` : null,
    input.facts ? "" : null,
    input.facts,
    "",
    `Keywords already tracked: ${list(input.existing)}`,
    `Keywords the user rejected before: ${list(input.rejected)}`,
    `Store autocomplete phrases for words in the title and category: ${list(input.autocomplete)}`,
    `Apps ranking for the tracked keywords (do not use their brands): ${list(input.competitors.map((c) => `${c.title} (${c.developer})`))}`,
    input.focus ? `\nThe user wants ideas focused on: ${input.focus}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

const fold = (s: string) => normalizeKeyword(s.normalize("NFD").replace(/\p{Diacritic}/gu, ""));
const LEGAL_SUFFIX = /[,.]?\s+(inc|llc|ltd|limited|gmbh|s\.?l\.?u?|s\.?a\.?|corp(oration)?|co|pty|ab|oy|bv|ag|sas|srl|plc)\.?$/i;
// Splits "Strava: Run & Ride" or "Nike Run Club - Running" into brand and tagline.
const TITLE_SEPARATOR = /\s*(?::|\s[-–—|·]\s)\s*/;

/**
 * Brand phrases of other apps: the part of the title before a separator (or the
 * whole title when it is one word) and the developer name without its legal suffix.
 */
export function competitorBrands(competitors: { title: string; developer: string }[], ownDeveloper: string): string[] {
  const own = fold(ownDeveloper.replace(LEGAL_SUFFIX, ""));
  const brands = new Set<string>();
  for (const c of competitors) {
    const parts = c.title.split(TITLE_SEPARATOR);
    const head = fold(parts[0]);
    if (parts.length > 1 || !head.includes(" ")) brands.add(head);
    const developer = fold(c.developer.replace(LEGAL_SUFFIX, ""));
    if (developer && developer !== own) brands.add(developer);
  }
  return [...brands].filter((b) => b.length >= 3);
}

const containsPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/** Variant key so "zapatillas running" and "zapatilla running" count as the same keyword. */
const variantKey = (term: string) =>
  fold(term)
    .split(" ")
    .map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w))
    .sort()
    .join(" ");

export type FilterResult = { kept: Suggestion[]; dropped: { keyword: string; why: "invalid" | "duplicate" | "existing" | "brand" }[] };

/** Validates the model output and drops invalid items, duplicates, tracked keywords and other brands. */
export function filterSuggestions(output: ModelOutput, existing: string[], brands: string[]): FilterResult {
  const seen = new Set(existing.map(variantKey));
  const foldedBrands = brands.map(fold);
  const kept: Suggestion[] = [];
  const dropped: FilterResult["dropped"] = [];
  for (const raw of output.suggestions) {
    const parsed = suggestionSchema.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ keyword: String(raw.keyword), why: "invalid" });
      continue;
    }
    const s = parsed.data;
    const key = variantKey(s.keyword);
    if (existing.some((e) => normalizeKeyword(e) === s.keyword)) {
      dropped.push({ keyword: s.keyword, why: "existing" });
    } else if (seen.has(key)) {
      dropped.push({ keyword: s.keyword, why: "duplicate" });
    } else if (foldedBrands.some((b) => containsPhrase(fold(s.keyword), b))) {
      dropped.push({ keyword: s.keyword, why: "brand" });
    } else {
      seen.add(key);
      kept.push(s);
      if (kept.length === MAX_SUGGESTIONS) break;
    }
  }
  return { kept, dropped };
}

/** Words from the title and category used as autocomplete seeds. */
export function seedWords(title: string, category: string | null, max = 4): string[] {
  const words = fold(`${title.split(TITLE_SEPARATOR).slice(1).join(" ") || title} ${category ?? ""}`)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4);
  return [...new Set(words)].slice(0, max);
}

/** Relevance 1–5 → factor for the opportunity score; unknown (manual keywords) counts as fully relevant. */
export function relevanceFactor(relevance: number | null | undefined): number {
  if (relevance == null) return 1;
  return 0.5 + Math.min(5, Math.max(1, relevance)) / 10;
}

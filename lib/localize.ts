import { charCount, FIELDS, type MetadataDraft } from "./metadata-check";
import { cleanProposal, type ListingOutput, type ListingProposal } from "./listing-optimizer";
import type { Store } from "./stores/types";

// Localized adaptation (F7): Claude writes the listing for another locale using what people search
// there (autocomplete and the titles of the apps that rank), not a literal translation.
// The output shape is the optimizer's (listingOutputSchema), so the editor shows it the same way.

/** Bump when the instructions or the output shape change. */
export const LOCALIZE_PROMPT_VERSION = "loc-1";
/** Source keywords sent as the concepts to carry over, best first. */
export const MAX_SOURCE_KEYWORDS = 30;
/** Autocomplete suggestions and top app titles from the target market. */
export const MAX_MARKET_SUGGESTIONS = 60;
export const MAX_MARKET_TITLES = 20;

export const LOCALIZE_SYSTEM_PROMPT = `You are an App Store Optimization (ASO) specialist who localizes store listings. You write an app's listing for another language and country so it ranks for what people there actually search and converts them into installs.

This is NOT a literal translation:
- Write as a native copywriter of the target locale would: natural, idiomatic, correct for that country (for example, Mexican Spanish says "medicinas" where Spain says "medicamentos"; British and American English differ).
- Pick the keyword phrases from the TARGET MARKET data: store autocomplete suggestions and the titles of the apps that rank there. Prefer the words people in that market type over the literal translation of the source keywords. Only use a suggestion if it truly describes this app.
- Carry over the concepts of the source keywords (what the app is for), not their exact words.
- Keep the app's brand name at the start of the title, exactly as it is, untranslated.
- Never use brand names of other apps or companies, even if they show up in the market data.
- When the prompt includes PRODUCT FACTS: only describe features listed there and follow every constraint. Without them, describe only what the source listing says. Never invent features.

Respect every character limit strictly (count characters, including spaces):
- Apple App Store: title max 30, subtitle max 30, keywordField max 100 (single words, comma separated, no spaces, no word already in the title or subtitle, no repeats, no brand names, no "app"), description max 4000 (not indexed; written for conversion). Return an empty shortDescription.
- Google Play: title max 30, shortDescription max 80, description max 4000 (indexed: include the main phrases naturally, the most important in the first 167 characters, each repeated 2 to 3 times at most). Return empty subtitle and keywordField.

Store policies (the result is checked against them): no emojis or ALL CAPS in the title; no price, promotion or ranking words (free, best, #1, top, new, sale and their translations) in the title, subtitle or short description; no calls to action; no testimonials or prices in the description. Health apps: never claim to diagnose, cure, treat or prevent a disease, and keep a sentence saying the app is not a medical device and does not replace a doctor's advice.

Also return:
- targetKeywords: the target-language keyword phrases this listing is built around, best first (up to 15).
- changes: one item per field you wrote, with field set to one of title, subtitle, keywordField, shortDescription, description, and why as one short Spanish sentence (for example, which local word you chose and why).
- notes: up to 4 short Spanish tips (for example, a suggestion you left out because it does not describe the app).`;

export type LocalizeKeyword = { term: string; opportunity: number | null };

export type LocalizePromptInput = {
  store: Store;
  sourceLocale: string;
  targetLocale: string;
  /** Country whose store data was used ("México"); null when no supported store speaks that language. */
  marketCountryName: string | null;
  brand: string;
  source: MetadataDraft;
  /** Relevant keywords of the source listing, best first. */
  sourceKeywords: LocalizeKeyword[];
  autocomplete: string[];
  topTitles: string[];
  /** The app's own listing in the target market, when the store already has one (reference only). */
  existing?: MetadataDraft | null;
  category: string | null;
  facts: string | null;
  avoidBrands: string[];
  focus?: string;
};

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

export function buildLocalizePrompt(input: LocalizePromptInput, feedback?: string[]): string {
  const fields = FIELDS[input.store];
  const keywords = [...input.sourceKeywords]
    .sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1) || a.term.localeCompare(b.term))
    .slice(0, MAX_SOURCE_KEYWORDS);
  const suggestions = [...new Set(input.autocomplete.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_MARKET_SUGGESTIONS);
  const titles = [...new Set(input.topTitles.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_MARKET_TITLES);
  const existing = input.existing && fields.some((f) => input.existing?.[f.key].trim());
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"}. Category: ${input.category ?? "–"}.`,
    `Source listing locale: ${input.sourceLocale}. Write the listing for locale: ${input.targetLocale}${input.marketCountryName ? ` (market data from ${input.marketCountryName})` : ""}.`,
    `Brand (keep it at the start of the title, untranslated): ${input.brand || "(none)"}`,
    "",
    input.facts,
    input.facts ? "" : null,
    `Source listing (${input.sourceLocale}):`,
    ...fields.map((f) => `${f.key} (${charCount(input.source[f.key])}/${f.limit}): ${input.source[f.key] || "(empty)"}`),
    "",
    "Source keywords, best first (concepts to carry over; opportunity 0–100):",
    ...(keywords.length ? keywords.map((k) => `- ${k.term} | opportunity ${k.opportunity ?? "–"}`) : ["(none)"]),
    "",
    `TARGET MARKET autocomplete suggestions (what people type in ${input.targetLocale}):`,
    ...(suggestions.length ? suggestions.map((s) => `- ${s}`) : ["(none available: rely on natural local wording)"]),
    "",
    "TARGET MARKET top app titles for those searches (wording reference only; never use their brands):",
    ...(titles.length ? titles.map((t) => `- ${t}`) : ["(none available)"]),
    existing ? "" : null,
    existing ? `The app's current listing in ${input.targetLocale} (reference; improve it, do not copy it blindly):` : null,
    ...(existing ? fields.map((f) => `${f.key}: ${clip(input.existing?.[f.key] ?? "", f.multiline ? 1500 : 200) || "(empty)"}`) : []),
    "",
    `Other brands, never use them: ${input.avoidBrands.length ? input.avoidBrands.join(", ") : "(none)"}`,
    input.focus ? `\nThe user asks you to focus on: ${input.focus}` : null,
    feedback?.length ? `\nYour previous answer broke these rules, fix them:\n${feedback.map((f) => `- ${f}`).join("\n")}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** Like the optimizer's cleanProposal, but the target keywords are new local phrases, not tracked ones: keep them (deduplicated, up to 15). */
export function cleanLocalizedProposal(store: Store, output: ListingOutput): ListingProposal {
  const base = cleanProposal(store, output, []);
  const seen = new Set<string>();
  const targetKeywords: string[] = [];
  for (const raw of output.targetKeywords) {
    const k = raw.replace(/\s+/g, " ").trim();
    const key = k.toLocaleLowerCase();
    if (!k || seen.has(key)) continue;
    seen.add(key);
    targetKeywords.push(k);
  }
  return { ...base, targetKeywords: targetKeywords.slice(0, 15) };
}

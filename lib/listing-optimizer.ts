import { z } from "zod";
import { charCount, FIELDS, type FieldKey, type MetadataDraft, tokens } from "./metadata-check";
import type { Store } from "./stores/types";

/** Bump when the instructions or the output shape change. */
export const LISTING_PROMPT_VERSION = "lst-1";
/** The most useful keywords go in the prompt; the rest only add noise. */
export const MAX_PROMPT_KEYWORDS = 60;

/** Loose on purpose (plain strings) so the structured-output schema stays simple; `cleanProposal` fixes it up after. */
export const listingOutputSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  keywordField: z.string(),
  shortDescription: z.string(),
  description: z.string(),
  targetKeywords: z.array(z.string()),
  changes: z.array(z.object({ field: z.string(), why: z.string() })),
  notes: z.array(z.string()),
});
export type ListingOutput = z.infer<typeof listingOutputSchema>;

export const LISTING_SYSTEM_PROMPT = `You are an App Store Optimization (ASO) specialist. You rewrite an app's store listing so it ranks for the keywords the user tracks while still converting visitors into installs.

General rules:
- Write the listing in the store's language, natural and correct, for people in that country. Never stuff keywords into unreadable lists.
- Keep the app's brand name at the start of the title, exactly as it is now.
- Never use brand names of other apps or companies.
- Do not promise features the current description does not mention. You may reword and reorder, but do not invent.
- Prioritise keywords by the data you get: high opportunity first, then high popularity and relevance. Keywords where the app already ranks in the top 3 are lower priority; keywords ranking 4 to 50 are the best targets.
- Respect every character limit strictly. Count characters, including spaces. A field over its limit is rejected by the store.

Apple App Store (indexed fields: title, subtitle, keyword field; the description is NOT indexed):
- title: max 30 characters. Brand plus the single most valuable keyword phrase.
- subtitle: max 30 characters. Second most valuable phrase, written as a benefit.
- keywordField: max 100 characters. Single words separated by commas with no spaces ("run,tracker,gps"). Never repeat a word that is already in the title or subtitle, never repeat words, no plurals of words already present, no app category name, no "app", no brand names. Apple combines words across title, subtitle and keyword field, so split phrases into their words. Use as many of the 100 characters as possible.
- description: max 4000 characters. Written for conversion: a strong first three lines, then benefits and features in short paragraphs or bullet lines. Return an empty shortDescription.

Google Play (indexed fields: title, short description, description):
- title: max 30 characters. Brand plus the most valuable keyword phrase.
- shortDescription: max 80 characters. A benefit-led sentence with the next most valuable keywords.
- description: max 4000 characters. Include the target keyword phrases naturally: the most important ones in the first 167 characters and repeated 2 to 4 times across the text, never more than 5 times each. Use short paragraphs and bullet lines.
- Return empty subtitle and keywordField.

Also return:
- targetKeywords: the tracked keywords this listing is built around, best first.
- changes: one item per field you changed, with field set to one of title, subtitle, keywordField, shortDescription, description, and why as one short Spanish sentence.
- notes: up to 4 short Spanish tips the user should know (for example, a keyword left out on purpose and why).`;

export type PromptKeyword = {
  term: string;
  position: number | null;
  depth: number | null;
  popularity: number | null;
  difficulty: number | null;
  opportunity: number | null;
  relevance: number | null;
};

export type ListingPromptInput = {
  store: Store;
  countryName: string;
  lang: string;
  developer: string;
  category: string | null;
  current: MetadataDraft;
  keywords: PromptKeyword[];
  avoidBrands: string[];
  focus?: string;
};

const num = (n: number | null) => (n == null ? "–" : String(n));

/** Best targets first: opportunity, then popularity, then relevance. */
export function rankKeywords(keywords: PromptKeyword[]): PromptKeyword[] {
  const score = (k: PromptKeyword) => [k.opportunity ?? -1, k.popularity ?? -1, k.relevance ?? 0];
  return [...keywords].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || a.term.localeCompare(b.term);
  });
}

export function buildListingPrompt(input: ListingPromptInput, feedback?: string[]): string {
  const { current } = input;
  const fields = FIELDS[input.store];
  const rows = rankKeywords(input.keywords)
    .slice(0, MAX_PROMPT_KEYWORDS)
    .map((k) => {
      const pos = k.position ?? (k.depth ? `>${k.depth}` : "–");
      return `- ${k.term} | position ${pos} | popularity ${num(k.popularity)} | difficulty ${num(k.difficulty)} | opportunity ${num(k.opportunity)} | relevance ${num(k.relevance)}`;
    });
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"}, country: ${input.countryName}, language code: ${input.lang}.`,
    `Developer: ${input.developer}. Category: ${input.category ?? "–"}.`,
    "",
    "Current listing:",
    ...fields.map((f) => `${f.key} (${charCount(current[f.key])}/${f.limit}): ${current[f.key] || "(empty)"}`),
    "",
    `Tracked keywords, best targets first (popularity, difficulty and opportunity are 0–100; position ">N" means outside the top N):`,
    ...(rows.length ? rows : ["(none: optimise for the app's category and features)"]),
    "",
    `Other brands, never use them: ${input.avoidBrands.length ? input.avoidBrands.join(", ") : "(none)"}`,
    input.focus ? `\nThe user asks you to focus on: ${input.focus}` : null,
    feedback?.length ? `\nYour previous answer broke these rules, fix them:\n${feedback.map((f) => `- ${f}`).join("\n")}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

/**
 * App Store keyword field: single words, comma separated with no spaces, no word
 * already in the title or subtitle, no repeats, cut at whole words to fit 100.
 */
export function cleanKeywordField(field: string, title: string, subtitle: string, limit = 100): string {
  const used = new Set([...tokens(title), ...tokens(subtitle)]);
  const out: string[] = [];
  let length = 0;
  for (const raw of field.split(/[,\s]+/)) {
    const word = raw.trim().toLocaleLowerCase();
    const key = tokens(word).join(" ");
    if (!key || used.has(key)) continue;
    const add = charCount(word) + (out.length ? 1 : 0);
    if (length + add > limit) continue;
    used.add(key);
    out.push(word);
    length += add;
  }
  return out.join(",");
}

const tidy = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export type ListingProposal = {
  /** Only the fields of the app's store. */
  fields: Partial<MetadataDraft>;
  targetKeywords: string[];
  changes: { field: FieldKey; why: string }[];
  notes: string[];
  /** Fields still over the store limit after the retry. */
  over: FieldKey[];
};

/** Keeps the store's fields, tidies whitespace, fixes the keyword field and lists what is still over the limit. */
export function cleanProposal(store: Store, output: ListingOutput, tracked: string[]): ListingProposal {
  const specs = FIELDS[store];
  const fields: Partial<MetadataDraft> = {};
  for (const f of specs) fields[f.key] = f.multiline ? tidy(output[f.key]) : oneLine(output[f.key]);
  if (store === "ios") {
    fields.keywordField = cleanKeywordField(output.keywordField, fields.title ?? "", fields.subtitle ?? "");
  }
  const keys = new Set<string>(specs.map((f) => f.key));
  const trackedByKey = new Map(tracked.map((t) => [fold(t), t]));
  return {
    fields,
    targetKeywords: [...new Set(output.targetKeywords.map((k) => trackedByKey.get(fold(k.trim()))).filter((k) => k != null))],
    changes: output.changes
      .filter((c) => keys.has(c.field) && c.why.trim())
      .map((c) => ({ field: c.field as FieldKey, why: c.why.trim() })),
    notes: output.notes.map((n) => n.trim()).filter(Boolean).slice(0, 4),
    over: specs.filter((f) => charCount(fields[f.key] ?? "") > f.limit).map((f) => f.key),
  };
}

/** Rule breaks to send back to the model for one more try. */
export function proposalFeedback(store: Store, proposal: ListingProposal, brand: string): string[] {
  const specs = FIELDS[store];
  const feedback = proposal.over.map((key) => {
    const f = specs.find((s) => s.key === key)!;
    return `${f.key} has ${charCount(proposal.fields[key] ?? "")} characters, the limit is ${f.limit}.`;
  });
  const brandWords = tokens(brand);
  const title = tokens(proposal.fields.title ?? "");
  if (brandWords.length && !brandWords.every((w, i) => title[i] === w)) {
    feedback.push(`The title must start with the brand "${brand}".`);
  }
  return feedback;
}

/** The brand part of a title: "Runly: Correr y GPS" → "Runly"; without a separator, the first word. */
export function brandOf(title: string): string {
  const parts = title.split(/\s*(?::|\s[-–—|·]\s)\s*/);
  return (parts.length > 1 ? parts[0] : title.trim().split(/\s+/)[0] ?? "").trim();
}

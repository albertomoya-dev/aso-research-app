import { z } from "zod";
import {
  charCount,
  type DiffItem,
  FIELDS,
  type FieldKey,
  type Issue,
  type KeywordDiff,
  keywordDiff,
  type MetadataDraft,
  type ScoredKeyword,
  tokens,
  weightedCoverage,
} from "./metadata-check";
import { MAX_DESCRIPTION_REPEATS, policyCheck, type PolicyContext } from "./policy-check";
import type { Store } from "./stores/types";
import { relevanceFactor } from "./suggestions";

/** Bump when the instructions or the output shape change. */
export const LISTING_PROMPT_VERSION = "lst-3";
/**
 * Relevant keywords sent to the model, best first. 150 lines are about 6,000 input tokens: enough for
 * every keyword worth targeting in a well-kept list (lib/relevance KEYWORD_BUDGET is also 150).
 */
export const MAX_PROMPT_KEYWORDS = 150;
/** Covered keywords listed under DO NOT LOSE, most valuable first. */
export const DO_NOT_LOSE_COUNT = 20;
/** Losing a covered keyword with at least this opportunity (0–100) triggers the retry. */
export const LOST_OPPORTUNITY_THRESHOLD = 40;

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
- When the prompt includes PRODUCT FACTS: only describe features listed in PRODUCT FACTS with status shipped (or next_release when the user says the listing is for the next version; the list you get is already filtered for that). The current listing is only a reference for tone and wording; it may be outdated, so drop any feature it mentions that PRODUCT FACTS does not list. Follow every constraint in PRODUCT FACTS.
- Without PRODUCT FACTS: do not promise features the current description does not mention. You may reword and reorder, but do not invent.
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
- description: max 4000 characters. Include the target keyword phrases naturally: the most important ones in the first 167 characters and repeated ${MAX_DESCRIPTION_REPEATS - 1} to ${MAX_DESCRIPTION_REPEATS} times across the text, never more than ${MAX_DESCRIPTION_REPEATS} times each (overlapping phrases count: "pill reminder" inside "daily pill reminder" is one more use). Use short paragraphs and bullet lines.
- Return empty subtitle and keywordField.

Do not lose coverage:
- Each keyword comes with where the current listing covers it today. The new listing must cover at least as much, weighting the title over the subtitle or short description, and those over the keyword field or description. Keep every keyword under DO NOT LOSE covered, ideally in the same field or a stronger one.

Store policies (the result is checked against them):
- Title: no emojis, emoticons, decorative or repeated symbols, and no ALL CAPS except the brand.
- No price, promotion or ranking words in the title, subtitle or short description: free, best, #1, top, new, sale, discount, bonus and their translations. No calls to action such as "download now".
- Description: no keyword lists without sentences, no user testimonials or star ratings, no names of other apps or brands, no prices.
- Health apps: never claim the app diagnoses, cures, treats or prevents a disease, and keep (or add) a sentence saying it is not a medical device and does not replace a doctor's advice.

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
  /** PRODUCT FACTS block from `factsForPrompt`, or null when the owner has not filled in the product sheet. */
  facts: string | null;
  /** Version in the store and its release notes, so the model knows how old the current listing is. */
  version?: string | null;
  releaseNotes?: string | null;
  focus?: string;
};

const num = (n: number | null) => (n == null ? "–" : String(n));
const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** Best targets first: opportunity (already scaled by relevance), then popularity, then the relevance factor (unrated counts as 0.7). */
export function rankKeywords(keywords: PromptKeyword[]): PromptKeyword[] {
  const score = (k: PromptKeyword) => [k.opportunity ?? -1, k.popularity ?? -1, relevanceFactor(k.relevance)];
  return [...keywords].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || a.term.localeCompare(b.term);
  });
}

/** "title, description", "words only" or "not covered": where the current text covers a keyword. */
function coverageNote(item: { fields: FieldKey[]; partial: boolean }): string {
  if (item.fields.length) return item.fields.join(", ");
  return item.partial ? "words only, not the phrase" : "not covered";
}

export function buildListingPrompt(input: ListingPromptInput, feedback?: string[]): string {
  const { current } = input;
  const fields = FIELDS[input.store];
  const ranked = rankKeywords(input.keywords).slice(0, MAX_PROMPT_KEYWORDS);
  const coverage = weightedCoverage(input.store, current, ranked);
  const rows = ranked.map((k, i) => {
    const pos = k.position ?? (k.depth ? `>${k.depth}` : "–");
    return `- ${k.term} | position ${pos} | popularity ${num(k.popularity)} | difficulty ${num(k.difficulty)} | opportunity ${num(k.opportunity)} | relevance ${num(k.relevance)} | today: ${coverageNote(coverage.items[i])}`;
  });
  const keep = coverage.items
    .filter((c) => c.credit > 0)
    .sort((a, b) => b.value - a.value || b.credit - a.credit)
    .slice(0, DO_NOT_LOSE_COUNT)
    .map((c) => `- ${c.term} (today: ${coverageNote(c)})`);
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"}, country: ${input.countryName}, language code: ${input.lang}.`,
    `Developer: ${input.developer}. Category: ${input.category ?? "–"}.`,
    "",
    input.facts,
    input.facts ? "" : null,
    input.version ? `Published version: ${input.version}.${input.releaseNotes ? ` Its release notes: ${clip(input.releaseNotes, 500)}` : ""}` : null,
    input.facts ? "Current listing (reference for tone and wording only; it may be outdated):" : "Current listing:",
    ...fields.map((f) => `${f.key} (${charCount(current[f.key])}/${f.limit}): ${current[f.key] || "(empty)"}`),
    "",
    `Tracked keywords, best targets first (popularity, difficulty and opportunity are 0–100; position ">N" means outside the top N):`,
    ...(rows.length ? rows : ["(none: optimise for the app's category and features)"]),
    "",
    ...(keep.length ? [`DO NOT LOSE (covered today, most valuable first; weighted coverage today ${coverage.score}/100):`, ...keep, ""] : []),
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
  /** Quality lock, set by optimizeListing: weighted coverage (0–100) of the text sent and of the proposal. */
  scoreBefore?: number;
  scoreAfter?: number;
  /** Keywords gained, lost and moved against the text sent. */
  diff?: KeywordDiff;
  /** Still worse than the text sent after the retry (lower score or an important keyword lost, see `isRegression`): shown with a red warning. */
  regression?: boolean;
  /** Calls to the model (2 when the first answer was retried). */
  attempts?: number;
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

// ---------- Quality lock ----------

export type ProposalAssessment = {
  scoreBefore: number;
  scoreAfter: number;
  diff: KeywordDiff;
  /** Lost keywords with opportunity ≥ LOST_OPPORTUNITY_THRESHOLD. */
  lostImportant: DiffItem[];
  /** Policy errors in the proposed listing. */
  policyErrors: Issue[];
  /** Worse than the current text: lower score or an important keyword lost. */
  regressed: boolean;
};

/** Lost keywords worth a warning: those with opportunity ≥ LOST_OPPORTUNITY_THRESHOLD, most valuable first. */
export const importantLosses = (diff: KeywordDiff): DiffItem[] => diff.lost.filter((l) => l.value >= LOST_OPPORTUNITY_THRESHOLD);

/** Worse than the current text: lower weighted score or an important keyword lost. Shared by the server and the editor. */
export const isRegression = (scoreBefore: number, scoreAfter: number, diff: KeywordDiff): boolean =>
  scoreAfter < scoreBefore || importantLosses(diff).length > 0;

/** The listing as it would be with the whole proposal applied. */
export const applyProposal = (current: MetadataDraft, proposal: ListingProposal): MetadataDraft => ({ ...current, ...proposal.fields });

/** Compares a proposal with the current text: weighted coverage, keyword diff and policy errors. */
export function assessProposal(
  store: Store,
  current: MetadataDraft,
  proposal: ListingProposal,
  keywords: ScoredKeyword[],
  policy: PolicyContext = {},
): ProposalAssessment {
  const proposed = applyProposal(current, proposal);
  const before = weightedCoverage(store, current, keywords);
  const after = weightedCoverage(store, proposed, keywords);
  const diff = keywordDiff(before, after);
  const lostImportant = importantLosses(diff);
  const policyErrors = policyCheck(store, proposed, policy).filter((i) => i.level === "error");
  return {
    scoreBefore: before.score,
    scoreAfter: after.score,
    diff,
    lostImportant,
    policyErrors,
    regressed: isRegression(before.score, after.score, diff),
  };
}

/** Concrete feedback for the retry: the score drop, the keywords lost (most valuable first) and the policy errors. */
export function qualityFeedback(a: ProposalAssessment, maxLost = 15): string[] {
  const out: string[] = [];
  if (a.scoreAfter < a.scoreBefore) {
    out.push(`Weighted keyword coverage dropped from ${a.scoreBefore} to ${a.scoreAfter} (0–100). The new listing must cover at least as much as the current one.`);
  }
  if (a.regressed && a.diff.lost.length) {
    const lost = a.diff.lost.slice(0, maxLost).map((l) => `"${l.term}" (was in ${l.from ?? "loose words"})`);
    out.push(`You dropped keywords the current listing covers; bring them back: ${lost.join(", ")}.`);
  }
  for (const e of a.policyErrors) out.push(`Store policy error${e.ruleId ? ` (${e.ruleId})` : ""}: ${e.text}`);
  return out;
}

export type Attempt = { proposal: ListingProposal; assessment: ProposalAssessment };

/** Best attempt: fewer fields over the limit, then fewer policy errors, then higher score; the later one on a tie. */
export function pickBest(attempts: Attempt[]): Attempt {
  return attempts.reduce((best, a) => {
    const d =
      a.proposal.over.length - best.proposal.over.length ||
      a.assessment.policyErrors.length - best.assessment.policyErrors.length ||
      best.assessment.scoreAfter - a.assessment.scoreAfter;
    return d <= 0 ? a : best;
  });
}

/** The proposal to show, with the quality lock fields filled in. Regression: still below the current score or losing an important keyword. */
export function finalizeProposal(best: Attempt, attempts: number): ListingProposal {
  const { assessment } = best;
  return {
    ...best.proposal,
    scoreBefore: assessment.scoreBefore,
    scoreAfter: assessment.scoreAfter,
    diff: assessment.diff,
    regression: assessment.regressed,
    attempts,
  };
}

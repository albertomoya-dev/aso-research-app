import { detectLanguage, wrongLanguage } from "./language-detect";
import { localeLanguage } from "./listing-drafts";
import { charCount, type FieldKey, FIELDS, type MetadataDraft } from "./metadata-check";
import { brandOf, cleanProposal, type ListingOutput, type ListingProposal } from "./listing-optimizer";
import type { Store } from "./stores/types";
import { genericWordsFor, languageStopwords, STOPWORD_LANGS, stopwordsFor, titleCommonWords } from "./stopwords";
import { rootSet } from "./suggestions";
import { fold } from "./text";

// Localized adaptation (F7): Claude writes the listing for another locale using what people search
// there (autocomplete and the titles of the apps that rank), not a literal translation.
// The output shape is the optimizer's (listingOutputSchema), so the editor shows it the same way.

/** Bump when the instructions or the output shape change. */
export const LOCALIZE_PROMPT_VERSION = "loc-4";
/** Source keywords sent as the concepts to carry over, best first. */
export const MAX_SOURCE_KEYWORDS = 30;
/** Autocomplete suggestions and top app titles from the target market. */
export const MAX_MARKET_SUGGESTIONS = 60;
export const MAX_MARKET_TITLES = 20;

export const LOCALIZE_SYSTEM_PROMPT = `You are an App Store Optimization (ASO) specialist who localizes store listings. You write an app's listing for another language and country so it ranks for what people there actually search and converts them into installs.

This is NOT a literal translation:
- Write as a native copywriter of the target locale would: natural, idiomatic, correct for that country (for example, Mexican Spanish says "medicinas" where Spain says "medicamentos"; British and American English differ).
- Pick the keyword phrases from the TARGET MARKET data: store autocomplete suggestions and the titles of the apps that rank there. Prefer the words people in that market type over the literal translation of the source keywords. Only use a suggestion if it truly describes this app.
- Write EVERY field (title, subtitle, shortDescription, keywordField, description) and the targetKeywords only in the target locale's language. Never keep the source language, not even when the market data is missing or the source keywords are in the source language: then write natural wording of the target language.
- Carry over the concepts of the source keywords (what the app is for), not their exact words. When the source is in another language they are only concepts to cover, never keywords to copy.
- Brand: when the prompt gives a declared brand, keep it at the start of the title, exactly as it is, untranslated. When it says the source title starts with what looks like the app's name, keep that name untranslated unless it is a plain description. When it says there is none, the source title is NOT a brand: adapt all of it to the target language.
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
  /** Brand declared in the product sheet, or "" when there is none (the whole title is then adapted). */
  brand: string;
  source: MetadataDraft;
  /** Relevant keywords of the source listing, best first. */
  sourceKeywords: LocalizeKeyword[];
  autocomplete: string[];
  topTitles: string[];
  /** Keywords the owner tracks in the target market (the app followed in that country), when its language matches. */
  marketKeywords?: string[];
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
  const crossLanguage = localeLanguage(input.sourceLocale) !== localeLanguage(input.targetLocale);
  const inferredName = input.brand.trim()
    ? ""
    : inferredAppName(
        input.source.title,
        new Set(input.sourceKeywords.flatMap((k) => wordsOf(k.term))),
        nameContext(input.source, localeLanguage(input.sourceLocale), input.facts),
      );
  const tracked = [...new Set((input.marketKeywords ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SOURCE_KEYWORDS);
  return [
    `Store: ${input.store === "ios" ? "Apple App Store" : "Google Play"}. Category: ${input.category ?? "–"}.`,
    `Source listing locale: ${input.sourceLocale}. Write the listing for locale: ${input.targetLocale}${input.marketCountryName ? ` (market data from ${input.marketCountryName})` : ""}.`,
    crossLanguage
      ? `Write every field in the language of ${input.targetLocale}, not in the language of ${input.sourceLocale}.`
      : null,
    input.brand.trim()
      ? `Declared brand (keep it at the start of the title, untranslated): ${input.brand.trim()}`
      : inferredName
        ? `Declared brand: none. The source title starts with what looks like the app's name «${inferredName}»: keep it unless it is a plain description.`
        : "Declared brand: none. The source title is not a brand: adapt all of it.",
    "",
    input.facts,
    input.facts ? "" : null,
    `Source listing (${input.sourceLocale}):`,
    ...fields.map((f) => `${f.key} (${charCount(input.source[f.key])}/${f.limit}): ${input.source[f.key] || "(empty)"}`),
    "",
    crossLanguage
      ? `Source keywords, in the language of ${input.sourceLocale}, best first. CONCEPTS TO COVER ONLY: they are not keywords for this listing; never copy them, express the idea in the target language (opportunity 0–100):`
      : "Source keywords, best first (concepts to carry over; opportunity 0–100):",
    ...(keywords.length ? keywords.map((k) => `- ${k.term} | opportunity ${k.opportunity ?? "–"}`) : ["(none)"]),
    "",
    ...(tracked.length ? ["TARGET MARKET keywords the owner tracks there (prefer them when they describe the app):", ...tracked.map((k) => `- ${k}`), ""] : []),
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

// ---------- Language check ----------

const displayName = (locale: "en" | "es") => {
  let names: Intl.DisplayNames | null = null;
  return (lang: string) => {
    try {
      names ??= new Intl.DisplayNames([locale], { type: "language" });
      return names.of(lang) ?? lang;
    } catch {
      return lang;
    }
  };
};
const englishName = displayName("en");
const spanishName = displayName("es");
const flat = (s: string) => fold(s).replace(/\s+/g, " ").trim();

export type LanguageIssue = {
  field: FieldKey | "targetKeywords";
  found: string | null;
  /** "mixed": a short field with words of the source listing left untranslated (`words`). */
  reason: "language" | "copied" | "mixed";
  words?: string[];
};

/**
 * Whether an issue makes the proposal unusable: a field in another language, or copied unchanged from the
 * source. Mixed words in a short field and target keywords made of source words are only advisory: cognates
 * («diabetes»), product names («Google Fit») or a keyword the owner tracks in the target language trip them
 * too, so they go back to the model as feedback and, if they persist, to the user as a warning.
 */
export const isBlockingIssue = (issue: LanguageIssue): boolean =>
  issue.reason === "language" || (issue.reason === "copied" && issue.field !== "targetKeywords");

export type LanguageCheckOptions = {
  sourceLocale: string;
  targetLocale: string;
  source: MetadataDraft;
  /** Declared brand, or "" (then a name-like head of the source title still counts as one, or the whole title when it is only a name, see `inferredAppName`). */
  brand: string;
  /** Terms of the source keywords: a short field or target keyword made of them was not adapted. */
  sourceKeywords?: string[];
  /** Target-market phrases (autocomplete, top titles, keywords tracked there): their words are never «source only». */
  marketTerms?: string[];
  /** Product facts text: its lower-case words are ordinary words, never the app's name (`nameContext`). */
  productText?: string | null;
};

const wordsOf = (text: string) => fold(text).split(/[^\p{L}\p{N}'’]+/u).filter((w) => w && !/^\d+$/.test(w));
const rawWordsOf = (text: string) => text.split(/[^\p{L}\p{N}'’]+/u).filter((w) => w && !/^\d+$/.test(w));
/** Source words shorter than this are too often shared by both languages («app», «gps», «pro») to count. */
const MIN_SOURCE_WORD = 4;
/** A short field is mixed with this many source words, or when they are at least half of its words. */
const MIN_MIXED_WORDS = 2;
const MIXED_SHARE = 0.5;

/** Where a new phrase starts inside a field: a word right after one of these is capitalised by grammar, not because it is a name. */
const SEGMENT_BREAK = /[.:;!?¡¿|()[\]"«»“”\n,–—·]|\s-\s/;

/**
 * What tells an ordinary word from a name, beyond the built-in lists: the source language (its function
 * words) and a dictionary of words the owner writes in lower case (`nameContext`).
 */
export type NameContext = { lang?: string; dictionary?: Iterable<string> };

/**
 * Words written in lower case in the source listing and the product facts, folded: plain words of the
 * language («toma», «medicamentos»), never a name, which is written with a capital.
 */
export function nameContext(source: MetadataDraft, lang: string, productText?: string | null): NameContext {
  const texts = [source.title, source.subtitle, source.shortDescription, source.description, productText ?? ""];
  const dictionary = new Set(texts.flatMap((t) => rawWordsOf(t ?? "").filter((w) => /^\p{Ll}+$/u.test(w)).map(fold)));
  return { lang, dictionary };
}

/** Function words of `lang` only, or of every known language when it is unknown. */
const languageOnlyStopwords = (lang?: string): Set<string> =>
  lang ? languageStopwords(lang) : new Set(STOPWORD_LANGS.flatMap((l) => [...languageStopwords(l)]));

/** Common app-title words, words of the source keywords and of the dictionary, matched by root (`rootSet`). */
const ordinaryRoots = (keywordWords: Iterable<string>, ctx: NameContext) =>
  rootSet([...titleCommonWords(), ...keywordWords, ...(ctx.dictionary ?? [])].filter((w) => [...w].length >= 3));

/**
 * An ordinary word, as `competitorBrandGroups` (lib/suggestions.ts) judges it: by root (`sameWord`), a
 * common app-title word («recordatorio», «pills»), a word of the source keywords or of the dictionary
 * (`NameContext`); also a function or generic word of the language or English, a number, or a word of
 * one or two letters.
 */
function ordinaryWords(keywordWords: Iterable<string>, ctx: NameContext): (w: string) => boolean {
  const stop = ctx.lang ? stopwordsFor(ctx.lang) : new Set([...languageOnlyStopwords(), ...stopwordsFor("en")]);
  const generic = genericWordsFor(ctx.lang ?? "en");
  const roots = ordinaryRoots(keywordWords, ctx);
  return (w) => [...w].length < 3 || /^\d+$/.test(w) || stop.has(w) || generic.has(w) || roots.has(w);
}

/**
 * Proper nouns of the source listing, folded: words with a capital inside («iPhone», «WhatsApp») and words
 * always written with a capital, at least once in the middle of a phrase («Sincroniza con Google Fit y Wear
 * OS»), that are not ordinary words by root (common title words, generic words, words of the source
 * keywords or of the dictionary: «Recordar Medicinas» does not make «medicinas» a name; searches are lower
 * case, names are not). Headings in capitals are skipped. They are names of products and platforms, kept
 * as they are in every language.
 */
export function properNouns(source: MetadataDraft, keywordWords: Set<string> = new Set(), ctx: NameContext = {}): Set<string> {
  const capitalisedInside = new Set<string>();
  const lower = new Set<string>();
  const proper = new Set<string>();
  for (const text of [source.title, source.subtitle, source.shortDescription, source.description]) {
    for (const segment of (text ?? "").split(SEGMENT_BREAK)) {
      const ws = rawWordsOf(segment);
      // A heading in capitals («ALARMAS EXACTAS») says nothing about names.
      if (ws.length > 1 && ws.every((w) => w === w.toLocaleUpperCase())) continue;
      ws.forEach((w, i) => {
        const f = fold(w);
        if (/\p{Ll}\p{Lu}/u.test(w)) proper.add(f);
        if (/^\p{Lu}/u.test(w)) {
          if (i > 0) capitalisedInside.add(f);
        } else if (/^\p{Ll}/u.test(w)) lower.add(f);
      });
    }
  }
  const roots = ordinaryRoots(keywordWords, ctx);
  const generic = genericWordsFor(ctx.lang ?? "en");
  for (const f of capitalisedInside) if (!lower.has(f) && !keywordWords.has(f) && !generic.has(f) && !roots.has(f)) proper.add(f);
  return proper;
}

/**
 * Without a declared brand, the head of the source title (`brandOf`) still is one when it looks like a
 * name (`looksLikeName`): «Pill Buddy: recordatorio» or «Medisafe Recordatorio», but not «Recordatorio
 * Pastillas: alarma» nor «Recordatorio De Pastillas: alarma».
 */
export function inferredBrandWords(sourceTitle: string, keywordWords: Set<string> = new Set(), ctx: NameContext = {}): string[] {
  const head = brandOf(sourceTitle);
  return looksLikeName(head, keywordWords, ctx) ? wordsOf(head) : [];
}

/**
 * Every word capitalised and at least one that is not an ordinary word (`ordinaryWords`): «Pill Buddy»,
 * «MediTrack», but not «Recordatorio Medicación» nor «Pastillas Y Medicamentos».
 */
export function looksLikeName(text: string, keywordWords: Set<string> = new Set(), ctx: NameContext = {}): boolean {
  const words = rawWordsOf(text);
  if (words.length === 0 || !words.every((w) => /^\p{Lu}|\p{Ll}\p{Lu}/u.test(w))) return false;
  const ordinary = ordinaryWords(keywordWords, ctx);
  return words.some((w) => !ordinary(fold(w)));
}

/**
 * The app's name as the source title suggests it, without a declared brand: the head of the title when it
 * looks like a name, or the whole title when it is only a name («Pill Buddy», «MediTrack»); "" otherwise.
 * A whole title with a function word of the source language («Toma Tu Medicación», «Mi Botiquín») is a
 * phrase in Title Case, not a name.
 */
export function inferredAppName(sourceTitle: string, keywordWords: Set<string> = new Set(), ctx: NameContext = {}): string {
  if (inferredBrandWords(sourceTitle, keywordWords, ctx).length) return brandOf(sourceTitle);
  const stop = languageOnlyStopwords(ctx.lang);
  if (wordsOf(sourceTitle).some((w) => stop.has(w))) return "";
  return looksLikeName(sourceTitle, keywordWords, ctx) ? sourceTitle.replace(/\s+/g, " ").trim() : "";
}

/**
 * Words of the source keywords that say «source language»: a keyword detected in another language is
 * skipped; an undetected one (most are one to three words) only counts by the words the source listing
 * also uses, so «pill reminder» tracked by a Spanish app is not a Spanish word.
 */
function sourceKeywordWords(keywords: string[], sourceLang: string, target: string, sourceTextWords: Set<string>): string[] {
  const sourceStop = languageStopwords(sourceLang);
  const targetStop = languageStopwords(target);
  return keywords.flatMap((k) => {
    const words = wordsOf(k);
    const guess = detectLanguage(k).lang;
    if (guess === sourceLang) return words;
    if (guess) return [];
    // «reminder for pills»: a function word of the target language and none of the source one.
    const targetOnly = words.some((w) => targetStop.has(w) && !sourceStop.has(w));
    const sourceOnly = words.some((w) => sourceStop.has(w) && !targetStop.has(w));
    if (targetOnly && !sourceOnly) return [];
    return words.filter((w) => sourceTextWords.has(w));
  });
}

/**
 * Words that only the source language would use: those of the source title and short fields and of the
 * source keywords (`sourceKeywordWords`), minus `exclude` (brand, proper nouns, target market words),
 * numbers, short words and the target language's function and generic words.
 */
function sourceOnlyWords(opts: LanguageCheckOptions, sourceLang: string, target: string, exclude: Set<string>): Set<string> {
  const { source } = opts;
  const targetStop = languageStopwords(target);
  const targetGeneric = genericWordsFor(target);
  const sourceTextWords = new Set(wordsOf([source.title, source.subtitle, source.shortDescription, source.description].join(" ")));
  const keywordWords = sourceKeywordWords(opts.sourceKeywords ?? [], sourceLang, target, sourceTextWords);
  const words = [...wordsOf([source.title, source.subtitle, source.shortDescription].join(" ")), ...keywordWords];
  return new Set(words.filter((w) => [...w].length >= MIN_SOURCE_WORD && !exclude.has(w) && !targetStop.has(w) && !targetGeneric.has(w)));
}

/** Source words left in a short field («Pill reminder: Recordatorio pastillas»), or [] when it reads as translated. */
function mixedWords(text: string, sourceOnly: Set<string>, brandWords: Set<string>, target: string): string[] {
  const targetStop = languageStopwords(target);
  const words = wordsOf(text).filter((w) => !brandWords.has(w) && !targetStop.has(w));
  const found = [...new Set(words.filter((w) => sourceOnly.has(w)))];
  if (found.length === 0) return [];
  const share = words.filter((w) => sourceOnly.has(w)).length / words.length;
  return found.length >= MIN_MIXED_WORDS || share >= MIXED_SHARE ? found : [];
}

/**
 * Fields of the proposal not written in the target language (`wrongLanguage`; fields of fewer than
 * MIN_WORDS words without the brand are too short for it), and, when the languages differ:
 * - fields copied unchanged from the source (a title like «Recordatorio pastillas: alarma» has no
 *   function words to detect);
 * - short fields (title, subtitle, short description) that keep words of the source title, short
 *   fields or keywords: «Pill reminder: Recordatorio pastillas» or «Recordatorio pastillas: alarm»
 *   (advisory, see `isBlockingIssue`);
 * - targetKeywords in another language, or copied from the source (copied is advisory).
 * The keyword field is a list, not text: not checked.
 */
export function languageIssues(store: Store, proposal: ListingProposal, opts: LanguageCheckOptions): LanguageIssue[] {
  const target = localeLanguage(opts.targetLocale);
  const sourceLang = localeLanguage(opts.sourceLocale);
  const brand = flat(opts.brand);
  const crossLanguage = sourceLang !== target;
  const keywordWords = new Set((opts.sourceKeywords ?? []).flatMap(wordsOf));
  const ctx = nameContext(opts.source, sourceLang, opts.productText);
  const brandWords = new Set(wordsOf(brand || inferredAppName(opts.source.title, keywordWords, ctx)));
  const names = crossLanguage ? properNouns(opts.source, keywordWords, ctx) : new Set<string>();
  const exclude = crossLanguage
    ? new Set([...brandWords, ...names, ...(opts.marketTerms ?? []).flatMap(wordsOf)])
    : new Set<string>();
  // A field made only of the app's name («MediTrack», «Pill Buddy») is kept, not copied.
  const onlyNames = (text: string) => {
    const ws = wordsOf(text);
    return ws.length > 0 && ws.every((w) => brandWords.has(w) || names.has(w));
  };
  const sourceOnly = crossLanguage ? sourceOnlyWords(opts, sourceLang, target, exclude) : new Set<string>();
  const issues: LanguageIssue[] = [];
  for (const f of FIELDS[store]) {
    const text = (proposal.fields[f.key] ?? "").trim();
    if (!text || f.key === "keywordField") continue;
    if (crossLanguage && flat(text) !== brand && !onlyNames(text) && flat(text) === flat(opts.source[f.key] ?? "")) {
      issues.push({ field: f.key, found: sourceLang, reason: "copied" });
      continue;
    }
    const wrong = wrongLanguage(text, target, { ignore: brand ? [brand] : [], prefer: sourceLang });
    if (wrong) {
      issues.push({ field: f.key, found: wrong.found, reason: "language" });
      continue;
    }
    if (crossLanguage && !f.multiline) {
      const words = mixedWords(text, sourceOnly, brandWords, target);
      if (words.length) issues.push({ field: f.key, found: sourceLang, reason: "mixed", words });
    }
  }

  const keywords = proposal.targetKeywords ?? [];
  if (keywords.length) {
    const wrong = wrongLanguage(keywords.join(", "), target, { ignore: brand ? [brand] : [], prefer: sourceLang });
    if (wrong) {
      issues.push({ field: "targetKeywords", found: wrong.found, reason: "language" });
    } else if (crossLanguage) {
      // A keyword made only of source words was copied, not adapted («recordatorio pastillas» for en-US).
      const copied = keywords.filter((k) => {
        const words = wordsOf(k).filter((w) => !brandWords.has(w) && [...w].length >= MIN_SOURCE_WORD);
        return words.length > 0 && words.every((w) => sourceOnly.has(w));
      });
      if (copied.length >= MIN_MIXED_WORDS || copied.length / keywords.length >= MIXED_SHARE) {
        issues.push({ field: "targetKeywords", found: sourceLang, reason: "copied", words: copied });
      }
    }
  }
  return issues;
}

/** Feedback for the retry, in English like the rest of the prompt. */
export function languageFeedback(issues: LanguageIssue[], targetLocale: string): string[] {
  const want = englishName(localeLanguage(targetLocale));
  return issues.map((i) => {
    const list = i.words?.length ? ` (${i.words.join(", ")})` : "";
    if (i.reason === "mixed")
      return `${i.field} keeps words of the source listing${list}. Write it entirely in ${want} (${targetLocale}), unless they are names or what people there really search.`;
    if (i.reason === "copied" && i.field === "targetKeywords")
      return `targetKeywords are copied from the source listing${list}. Give phrases people search in ${want} (${targetLocale}).`;
    return i.reason === "copied"
      ? `${i.field} is copied unchanged from the source listing. Write it in ${want} (${targetLocale}).`
      : `${i.field} is written in ${englishName(i.found ?? "")}, not in ${want}. Rewrite it entirely in ${want} (${targetLocale}).`;
  });
}

const FIELD_NAMES: Partial<Record<LanguageIssue["field"], string>> = {
  title: "El título",
  subtitle: "El subtítulo",
  shortDescription: "La descripción corta",
};

/** The advisory issues (see `isBlockingIssue`) of the proposal shown, as warnings for the user, in Spanish. */
export function languageWarnings(issues: LanguageIssue[], targetLocale: string): string[] {
  const want = spanishName(localeLanguage(targetLocale));
  return issues
    .filter((i) => !isBlockingIssue(i))
    .map((i) => {
      const list = i.words?.length ? ` (${i.words.join(", ")})` : "";
      return i.field === "targetKeywords"
        ? `Algunas keywords objetivo vienen de la ficha original${list}: comprueba que se buscan así en ${want}.`
        : `${FIELD_NAMES[i.field] ?? i.field} conserva palabras de la ficha original${list}: comprueba si deberían ir en ${want} o si son nombres propios.`;
    });
}

export type LocalizeOutcome = { proposal: ListingProposal; model: string; attempts: number; warnings: string[] } | { error: string };

/**
 * The decision of «Adaptar»: one call, and one more with feedback when the proposal breaks a rule
 * (`problems`: limits, brand, policy) or has a language issue. A proposal with a blocking language issue
 * (`isBlockingIssue`: another language, or a field copied unchanged) is never returned: if the retry has
 * one too, the result is an error. Advisory issues never invalidate a proposal; those of the proposal
 * returned come back as `warnings`. Among the valid ones, the retry wins unless it has more problems
 * (or as many and more advisory issues). `generate` returns null when a call fails in a way worth
 * absorbing (the first valid answer then stands).
 */
export async function localizeWithChecks(
  opts: LanguageCheckOptions & {
    store: Store;
    generate: (feedback?: string[]) => Promise<{ output: ListingOutput; model: string } | null>;
    problems: (proposal: ListingProposal) => string[];
  },
): Promise<LocalizeOutcome> {
  const check = (output: ListingOutput, model: string) => {
    const proposal = cleanLocalizedProposal(opts.store, output);
    const language = languageIssues(opts.store, proposal, opts);
    return {
      proposal,
      model,
      language,
      blocking: language.filter(isBlockingIssue),
      advisory: language.filter((i) => !isBlockingIssue(i)),
      problems: opts.problems(proposal),
    };
  };
  const first = await opts.generate();
  if (!first) return { error: "La IA no respondió. Vuelve a intentarlo." };
  const attempts = [check(first.output, first.model)];
  const feedback = [...languageFeedback(attempts[0].language, opts.targetLocale), ...attempts[0].problems];
  if (feedback.length > 0) {
    const second = await opts.generate(feedback);
    if (second) attempts.push(check(second.output, second.model));
  }
  const valid = attempts.filter((a) => a.blocking.length === 0);
  if (valid.length === 0) {
    const last = attempts[attempts.length - 1].blocking;
    const found = [...new Set(last.map((i) => i.found).filter((l): l is string => Boolean(l)))].map(spanishName);
    const want = spanishName(localeLanguage(opts.targetLocale));
    return {
      error: `La IA escribió la ficha en ${found.join(" y ") || "otro idioma"} en vez de en ${want}${attempts.length > 1 ? ", también al reintentarlo" : ""}. No se muestra la propuesta: vuelve a pulsar «Adaptar a ${opts.targetLocale}» o pide en el enfoque «escribe todo en ${want}».`,
    };
  }
  const best = valid.reduce((a, b) =>
    b.problems.length < a.problems.length || (b.problems.length === a.problems.length && b.advisory.length <= a.advisory.length) ? b : a,
  );
  return { proposal: best.proposal, model: best.model, attempts: attempts.length, warnings: languageWarnings(best.advisory, opts.targetLocale) };
}

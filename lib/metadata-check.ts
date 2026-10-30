import { policyCheck, type PolicyContext } from "./policy-check";
import type { AppMeta, Store } from "./stores/types";
import { fold } from "./text";

export type MetadataDraft = {
  title: string;
  subtitle: string;
  /** App Store only: the hidden 100-character keyword field. */
  keywordField: string;
  shortDescription: string;
  description: string;
};
export type FieldKey = keyof MetadataDraft;

export type FieldSpec = { key: FieldKey; label: string; limit: number; indexed: boolean; multiline?: boolean; hint?: string };

/** Store limits; in the App Store the description is not used for search. */
export const FIELDS: Record<Store, FieldSpec[]> = {
  ios: [
    { key: "title", label: "Nombre", limit: 30, indexed: true },
    { key: "subtitle", label: "Subtítulo", limit: 30, indexed: true },
    {
      key: "keywordField",
      label: "Campo de keywords",
      limit: 100,
      indexed: true,
      hint: "Palabras sueltas separadas por comas, sin espacios. No repitas las del nombre ni el subtítulo.",
    },
    { key: "description", label: "Descripción", limit: 4000, indexed: false, multiline: true, hint: "Apple no la usa para la búsqueda." },
  ],
  android: [
    { key: "title", label: "Título", limit: 30, indexed: true },
    { key: "shortDescription", label: "Descripción corta", limit: 80, indexed: true },
    { key: "description", label: "Descripción", limit: 4000, indexed: true, multiline: true },
  ],
};

export function draftFromMeta(meta: AppMeta): MetadataDraft {
  return {
    title: meta.title,
    subtitle: "",
    keywordField: "",
    shortDescription: meta.shortDescription ?? "",
    description: meta.description ?? "",
  };
}

/** Stores count characters, not UTF-16 units. */
export const charCount = (s: string) => [...s].length;

export const tokens = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
/** True when the words of `phrase` appear together and in order in `text` (folded, ignoring punctuation). */
export const containsPhrase = (text: string, phrase: string) => ` ${tokens(text).join(" ")} `.includes(` ${tokens(phrase).join(" ")} `);

export type Coverage = {
  term: string;
  /** Every word appears somewhere in the indexed fields. */
  covered: boolean;
  /** Strongest field holding the exact phrase, if any. */
  exactIn: FieldKey | null;
  /** Every indexed field holding the exact phrase, strongest first. */
  inFields: FieldKey[];
  missing: string[];
  /** Google Play: times the phrase appears in the description. */
  descriptionCount?: number;
};

export type IssueLevel = "error" | "warn" | "info";
/**
 * One warning in the «Avisos» panel. `error`: the store rejects it or its policy forbids it;
 * `warn`: likely to hurt ranking or review; `info`: worth knowing. Policy issues carry the rule id
 * and the link to the official text (see lib/policy-check.ts).
 */
export type Issue = { level: IssueLevel; text: string; ruleId?: string; link?: string };

export type MetadataReport = {
  fields: (FieldSpec & { length: number; over: boolean })[];
  coverage: Coverage[];
  issues: Issue[];
  /** App Store: words of the tracked keywords missing everywhere, ready for the keyword field. */
  missingWords: string[];
};

/** Times the phrase appears in the text, word by word (folded, ignoring punctuation). */
export function countPhrase(text: string, phrase: string) {
  const hay = tokens(text);
  const needle = tokens(phrase);
  if (needle.length === 0) return 0;
  let n = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) n++;
  }
  return n;
}

/**
 * Limits, coverage and warnings of a listing. Store policy checks (lib/policy-check.ts) run on top;
 * pass `policy` with the store language, category and competitor brands to make them precise.
 */
const LEVEL_ORDER: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };

export function checkMetadata(store: Store, draft: MetadataDraft, keywords: string[], policy: PolicyContext = {}): MetadataReport {
  const specs = FIELDS[store];
  const indexed = specs.filter((f) => f.indexed);
  const fields = specs.map((f) => {
    const length = charCount(draft[f.key]);
    return { ...f, length, over: length > f.limit };
  });
  const indexedWords = new Set(indexed.flatMap((f) => tokens(draft[f.key])));

  const coverage = keywords.map((term): Coverage => {
    const missing = tokens(term).filter((w) => !indexedWords.has(w));
    const inFields = indexed.filter((f) => containsPhrase(draft[f.key], term)).map((f) => f.key);
    return {
      term,
      covered: missing.length === 0,
      exactIn: inFields[0] ?? null,
      inFields,
      missing,
      ...(store === "android" ? { descriptionCount: countPhrase(draft.description, term) } : {}),
    };
  });

  const issues: Issue[] = fields
    .filter((f) => f.over)
    .map((f) => ({ level: "error" as const, text: `${f.label}: ${f.length} de ${f.limit} caracteres, sobran ${f.length - f.limit}.` }));

  if (store === "ios") {
    const field = draft.keywordField;
    const spaces = (field.match(/,\s+|\s+,/g) ?? []).reduce((sum, m) => sum + m.length - 1, 0);
    if (spaces > 0) issues.push({ level: "warn", text: `El campo de keywords gasta ${spaces === 1 ? "1 carácter" : `${spaces} caracteres`} en espacios junto a las comas.` });
    const visible = new Set([...tokens(draft.title), ...tokens(draft.subtitle)]);
    const kwWords = tokens(field);
    const repeated = [...new Set(kwWords.filter((w) => visible.has(w)))];
    if (repeated.length > 0) {
      issues.push({ level: "warn", text: `Ya están en el nombre o el subtítulo, quítalas del campo de keywords: ${repeated.join(", ")}.` });
    }
    const dupes = [...new Set(kwWords.filter((w, i) => kwWords.indexOf(w) !== i))];
    if (dupes.length > 0) issues.push({ level: "warn", text: `Palabras repetidas en el campo de keywords: ${dupes.join(", ")}.` });
  }

  // Store policies: promo words, emojis, keyword density, health claims… (Google Play density lives there too).
  issues.push(...policyCheck(store, draft, { ...policy, keywords: policy.keywords ?? keywords }));
  issues.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  const missingWords = store === "ios" ? [...new Set(coverage.flatMap((c) => c.missing))] : [];
  return { fields, coverage, issues, missingWords };
}

/** Appends words to an App Store keyword field, comma separated with no spaces. */
export function appendToKeywordField(field: string, words: string[]): string {
  const current = field
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  const have = new Set(current.map((w) => fold(w)));
  return [...current, ...words.filter((w) => !have.has(fold(w)))].join(",");
}

// ---------- Weighted coverage (quality lock) ----------

/**
 * How much each indexed field is worth for ranking. The title weighs the most in both stores;
 * Apple does not index the description at all.
 */
export const FIELD_WEIGHTS: Record<Store, Partial<Record<FieldKey, number>>> = {
  android: { title: 3, shortDescription: 2, description: 1 },
  ios: { title: 3, subtitle: 2, keywordField: 1.5, description: 0 },
};
const MAX_WEIGHT = 3;

/**
 * Credit when the words of a keyword are all there but not together. Apple combines words across
 * name, subtitle and keyword field, so scattered words almost work as well as the phrase (0.8);
 * Google Play rewards the exact phrase much more (0.5).
 */
export const PARTIAL_FACTOR: Record<Store, number> = { ios: 0.8, android: 0.5 };

export type ScoredKeyword = { term: string; opportunity: number | null };

export type WeightedItem = {
  term: string;
  /** Opportunity used as the keyword's value (at least 1, so unmeasured keywords still count a little). */
  value: number;
  /** Weight earned, 0–3: the best field with the exact phrase, or the partial credit. */
  credit: number;
  /** Fields holding the exact phrase, strongest first. */
  fields: FieldKey[];
  /** Every word present, but never the whole phrase in one field. */
  partial: boolean;
};

export type WeightedCoverage = {
  /** 0–100: Σ value × credit over Σ value × 3 (every keyword in the title). */
  score: number;
  items: WeightedItem[];
};

const valueOf = (k: ScoredKeyword) => Math.max(1, k.opportunity ?? 0);

/**
 * Coverage weighted by each keyword's opportunity and by the field that holds it:
 * - the exact phrase in a field earns that field's weight (the best one if it is in several);
 * - all its words present across indexed fields, but never together, earn PARTIAL_FACTOR × the
 *   weight of the weakest field needed (the word that is only in the description drags it down);
 * - otherwise 0.
 * Pure and shared by the server (optimizer, draft warning) and the editor, so both show the same number.
 */
export function weightedCoverage(store: Store, draft: MetadataDraft, keywords: ScoredKeyword[]): WeightedCoverage {
  const weights = FIELD_WEIGHTS[store];
  const fields = FIELDS[store]
    .filter((f) => f.indexed && (weights[f.key] ?? 0) > 0)
    .map((f) => ({ key: f.key, weight: weights[f.key] ?? 0, words: new Set(tokens(draft[f.key])) }))
    .sort((a, b) => b.weight - a.weight);
  let earned = 0;
  let possible = 0;
  const items = keywords.map((k): WeightedItem => {
    const value = valueOf(k);
    const inFields = fields.filter((f) => containsPhrase(draft[f.key], k.term)).map((f) => f.key);
    let credit = inFields.length ? (weights[inFields[0]] ?? 0) : 0;
    let partial = false;
    const words = tokens(k.term);
    if (!credit && words.length > 0) {
      const best = words.map((w) => fields.find((f) => f.words.has(w))?.weight ?? 0);
      if (best.every((b) => b > 0)) {
        credit = PARTIAL_FACTOR[store] * Math.min(...best);
        partial = true;
      }
    }
    earned += value * credit;
    possible += value * MAX_WEIGHT;
    return { term: k.term, value, credit, fields: inFields, partial };
  });
  return { score: possible ? Math.round((earned / possible) * 1000) / 10 : 0, items };
}

export type DiffItem = { term: string; value: number; from: FieldKey | null; to: FieldKey | null };
export type KeywordDiff = { gained: DiffItem[]; lost: DiffItem[]; moved: DiffItem[] };

/**
 * What a new listing gains and loses against the old one, most valuable first. Both coverages must
 * come from the same keyword list. `from`/`to` are the strongest field with the exact phrase (null
 * when only the words are there). Moved: covered in both, but the best field changed.
 */
export function keywordDiff(before: WeightedCoverage, after: WeightedCoverage): KeywordDiff {
  const afterByTerm = new Map(after.items.map((i) => [i.term, i]));
  const diff: KeywordDiff = { gained: [], lost: [], moved: [] };
  for (const b of before.items) {
    const a = afterByTerm.get(b.term);
    if (!a) continue;
    const item = { term: b.term, value: b.value, from: b.fields[0] ?? null, to: a.fields[0] ?? null };
    if (b.credit === 0 && a.credit > 0) diff.gained.push(item);
    else if (b.credit > 0 && a.credit === 0) diff.lost.push(item);
    else if (b.credit > 0 && a.credit > 0 && item.from !== item.to) diff.moved.push(item);
  }
  const byValue = (x: DiffItem, y: DiffItem) => y.value - x.value || x.term.localeCompare(y.term);
  diff.gained.sort(byValue);
  diff.lost.sort(byValue);
  diff.moved.sort(byValue);
  return diff;
}

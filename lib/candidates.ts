// Candidate keywords of Keywords › Encontrar (pure: no database, usable from client components and tests).
//
// The three sources (autocomplete, AI ideas, TOP 10) and the review words all end up as the same
// `Candidate`: term, source, estimated relevance and popularity, the reason and a checkbox. AI ideas live
// in `ai_suggestions` (their status and reason come from there); the other sources are computed live and
// only written to `keyword_candidates` when the user acts on them (dismiss, follow, measure) or, for the
// review words, when an analysis brings them.

import type { CandidateSource } from "./candidate-sources";
import { normalizeKeyword, type KeywordSource } from "./keywords";
import { autocompleteScore } from "./popularity";

export { CANDIDATE_SOURCES, type CandidateSource } from "./candidate-sources";

export type Candidate = {
  /** Normalized term: the identity across sources. */
  term: string;
  source: CandidateSource;
  /** Row id in `ai_suggestions` for AI ideas (dismiss and follow go through it). */
  suggestionId?: number;
  /** 1–5 when known: the AI idea's own, or the estimate the user asked for. */
  relevance: number | null;
  /** 0–100 from the autocomplete already read; always labelled «estimada». */
  popularityEstimate: number | null;
  /** 0–100 measured on demand («Medir popularidad»). Wins over the estimate. */
  popularityMeasured: number | null;
  reason: string;
};

export const CANDIDATE_SOURCE_LABEL: Record<CandidateSource, string> = {
  autocomplete: "Autocompletado",
  ai: "Ideas con IA",
  top10: "TOP 10",
  reviews: "Reseñas",
};

/** The `keyword_source` a candidate is followed with. */
export const FOLLOW_SOURCE: Record<CandidateSource, KeywordSource> = {
  autocomplete: "discover",
  ai: "ai",
  top10: "top10",
  reviews: "reviews",
};

/** `?fuente=` of /encontrar. «pendientes» is the tray of candidates waiting for a decision. */
export const FIND_TABS = ["pendientes", "autocompletado", "ia", "top10"] as const;
export type FindTab = (typeof FIND_TABS)[number];

export const FIND_TAB_SOURCE: Record<Exclude<FindTab, "pendientes">, CandidateSource> = {
  autocompletado: "autocomplete",
  ia: "ai",
  top10: "top10",
};

export function isFindTab(value: string | undefined | null): value is FindTab {
  return value != null && (FIND_TABS as readonly string[]).includes(value);
}

/** Most candidates measured per click: each one types up to 16 prefixes in the store. */
export const MAX_MEASURE = 10;

/** One autocomplete answer: what was typed and the list the store returned, in order. */
export type AutocompleteList = { prefix: string; suggestions: string[] };

/**
 * Popularity ESTIMATE from autocomplete lists already read (no new requests): the best
 * `autocompleteScore` among the lists where the term shows up, with the letters typed and its place in
 * the list. Typing «correr» and seeing «correr por la montaña» third gives a lower bound of what the
 * real measure (typing letter by letter) would find. Null when no list has it.
 */
export function estimatePopularity(term: string, lists: readonly AutocompleteList[]): number | null {
  const target = normalizeKeyword(term);
  let best: number | null = null;
  for (const { prefix, suggestions } of lists) {
    const index = suggestions.findIndex((s) => normalizeKeyword(s) === target);
    if (index === -1) continue;
    const score = autocompleteScore(normalizeKeyword(prefix).length, index, target);
    if (best == null || score > best) best = score;
  }
  return best;
}

/**
 * Candidates from the autocomplete lists of a seed: unique terms in the order found, without the seed
 * itself, each with its popularity estimate and the prefix where it first appeared as the reason.
 */
export function autocompleteCandidates(seed: string, lists: readonly AutocompleteList[]): Candidate[] {
  const base = normalizeKeyword(seed);
  const firstPrefix = new Map<string, string>();
  for (const { prefix, suggestions } of lists) {
    for (const raw of suggestions) {
      const term = normalizeKeyword(raw);
      if (term && term !== base && !firstPrefix.has(term)) firstPrefix.set(term, normalizeKeyword(prefix));
    }
  }
  return [...firstPrefix].map(([term, prefix]) => ({
    term,
    source: "autocomplete",
    relevance: null,
    popularityEstimate: estimatePopularity(term, lists),
    popularityMeasured: null,
    reason: `La tienda la sugiere al escribir «${prefix}»`,
  }));
}

/** What a stored candidate row says about a term (any source). */
export type CandidateRow = {
  term: string;
  source: CandidateSource;
  status: "pending" | "followed" | "dismissed";
  reason: string | null;
  relevance: number | null;
  popularityEstimate: number | null;
  popularityMeasured: number | null;
};

export type MergeOptions = {
  /** Terms the market already follows: never shown. */
  followed: Iterable<string>;
  /** Terms dismissed in any source (keyword_candidates and ai_suggestions): never shown again. */
  dismissed: Iterable<string>;
  /** Measured popularity per term, from any stored row. */
  measured?: ReadonlyMap<string, number>;
};

/**
 * One list from several sources: deduplicated by normalized term (the first source listed wins the row;
 * a later one only fills what is missing: relevance, estimate, reason), without followed or dismissed
 * terms, and with the measured popularity of each term when there is one.
 */
export function mergeCandidates(lists: readonly (readonly Candidate[])[], options: MergeOptions): Candidate[] {
  const skip = new Set([...options.followed, ...options.dismissed].map(normalizeKeyword));
  const byTerm = new Map<string, Candidate>();
  for (const list of lists) {
    for (const c of list) {
      const term = normalizeKeyword(c.term);
      if (!term || skip.has(term)) continue;
      const seen = byTerm.get(term);
      if (!seen) {
        byTerm.set(term, { ...c, term });
        continue;
      }
      seen.relevance ??= c.relevance;
      seen.popularityEstimate ??= c.popularityEstimate;
      seen.popularityMeasured ??= c.popularityMeasured;
      seen.suggestionId ??= c.suggestionId;
      if (!seen.reason) seen.reason = c.reason;
    }
  }
  const measured = options.measured;
  return [...byTerm.values()].map((c) => (measured?.has(c.term) ? { ...c, popularityMeasured: measured.get(c.term)! } : c));
}

/** Candidates from stored rows (the pending tray): pending ones only, AI rows excluded (they live in ai_suggestions). */
export function storedCandidates(rows: readonly CandidateRow[]): Candidate[] {
  return rows
    .filter((r) => r.status === "pending" && r.source !== "ai")
    .map((r) => ({
      term: r.term,
      source: r.source,
      relevance: r.relevance,
      popularityEstimate: r.popularityEstimate,
      popularityMeasured: r.popularityMeasured,
      reason: r.reason ?? "",
    }));
}

/** The popularity to show and whether it is an estimate. */
export function candidatePopularity(c: Pick<Candidate, "popularityEstimate" | "popularityMeasured">): { value: number | null; estimated: boolean } {
  if (c.popularityMeasured != null) return { value: c.popularityMeasured, estimated: false };
  return { value: c.popularityEstimate, estimated: c.popularityEstimate != null };
}

/** CSV of candidates (comma separated, quoted when needed), for «Exportar CSV». */
export function candidatesCsv(rows: readonly Candidate[]): string {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["keyword", "fuente", "relevancia", "popularidad", "popularidad_estimada", "motivo"];
  const lines = rows.map((c) =>
    [c.term, CANDIDATE_SOURCE_LABEL[c.source], c.relevance, c.popularityMeasured, c.popularityEstimate, c.reason].map(cell).join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

/** «12 descartadas»: the toast after «Descartar». */
export function dismissedCandidatesMessage(count: number): string {
  if (count === 0) return "No se ha descartado ninguna: ya no estaban pendientes.";
  return count === 1 ? "1 keyword descartada" : `${count} keywords descartadas`;
}

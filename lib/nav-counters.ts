// The sidebar counters computed in TypeScript from the rows of `marketCounters` (lib/nav-queries.ts):
// pure, so the rule is the same one the pages use and it can be tested without a database.

import { getCountry } from "./countries";
import { mainLocale } from "./listing-drafts";
import { draftFromMeta, type MetadataDraft } from "./metadata-check";
import { policyCheck } from "./policy-check";
import { hasNewReviews } from "./review-freshness";
import type { AppMeta, Store } from "./stores/types";

/** One review source of a market: the newest review the store showed and the `stats.to` of its last analysis. */
export type ReviewCheck = { latest: string | Date | null; to: string | null };

/** «Reseñas · N nuevas»: sources whose store shows a review newer than their last analysis (the dot of Reseñas). */
export function countNewReviewSources(checks: readonly ReviewCheck[]): number {
  return checks.filter((c) => hasNewReviews(c.latest, { to: c.to })).length;
}

export type ListingWarningsInput = {
  store: Store;
  country: string;
  meta: AppMeta;
  /** The market's drafts of the main listings (`country` ""), any locale. */
  drafts: readonly { locale: string; draft: MetadataDraft }[];
  /** Terms the market follows, for the keyword density rules. */
  keywords: readonly string[];
};

/**
 * «Ficha · N avisos»: errors and warnings of the store rules on the market's main listing, the saved
 * draft of its main language or else the published one, as the health panel picks it. Only stored data:
 * the rule about other apps' brands needs the TOP results of every keyword and is left out here (the
 * Ficha page still shows it).
 */
export function listingWarningCount({ store, country, meta, drafts, keywords }: ListingWarningsInput): number {
  const main = mainLocale(country);
  const draft = drafts.find((d) => d.locale === main)?.draft ?? draftFromMeta(meta);
  const issues = policyCheck(store, draft, { lang: getCountry(country).lang, category: meta.category, keywords: [...keywords] });
  return issues.filter((i) => i.level === "error" || i.level === "warn").length;
}

/** A json column of a raw query: parsed by the driver, or a string to parse. */
export function jsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

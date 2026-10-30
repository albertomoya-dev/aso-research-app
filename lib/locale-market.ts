import { draftFromMeta, type MetadataDraft } from "./metadata-check";
import { getAdapter } from "./stores";
import type { Store } from "./stores/types";
import { seedWords } from "./suggestions";

/** What people search in another market, for the localized adaptation. */
export type MarketResearch = {
  autocomplete: string[];
  topTitles: string[];
  /** The app's own listing in that market, if the store returns one. */
  existing: MetadataDraft | null;
  category: string | null;
};

// Bounded: 1 listing read, up to 4 autocomplete calls and 2 searches per market. Cached for a few hours
// per server instance, so adapting several times in a row does not hit the stores again.
const MAX_SEEDS = 4;
const MAX_SEARCHES = 2;
const TOP_LIMIT = 10;
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: MarketResearch }>();

/**
 * Autocomplete and top app titles in `country`/`lang`. Seeds come from the app's own listing in that
 * market (localized title and category) when the store has one, else from the source title and
 * category. Every store call may fail on its own: the adaptation then works with less data.
 */
export async function researchMarket(
  app: { store: Store; storeId: string },
  market: { country: string; lang: string },
  fallback: { title: string; category: string | null },
): Promise<MarketResearch> {
  const key = `${app.store}|${app.storeId}|${market.country}|${market.lang}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const adapter = getAdapter(app.store);
  const own = await adapter.getApp(app.storeId, market).catch(() => null);
  const seeds = seedWords(own?.title ?? fallback.title, own?.category ?? fallback.category, MAX_SEEDS);
  const [lists, searches] = await Promise.all([
    Promise.allSettled(seeds.map((seed) => adapter.suggest(seed, market))),
    Promise.allSettled(seeds.slice(0, MAX_SEARCHES).map((seed) => adapter.searchApps(seed, { ...market, limit: TOP_LIMIT }))),
  ]);
  const autocomplete = [...new Set(lists.flatMap((r) => (r.status === "fulfilled" ? r.value : [])))];
  const topTitles = [
    ...new Set(searches.flatMap((r) => (r.status === "fulfilled" ? r.value.filter((a) => a.id !== app.storeId).map((a) => a.title) : []))),
  ];
  // Only Google Play returns the localized text; the App Store lookup gives the storefront's listing.
  const value: MarketResearch = {
    autocomplete,
    topTitles,
    existing: own ? draftFromMeta(own) : null,
    category: own?.category ?? fallback.category,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

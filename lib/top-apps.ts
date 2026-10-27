import { getCountry } from "./countries";
import { getAdapter } from "./stores";
import type { AppMeta, Store } from "./stores/types";
import { TOP_DEPTH } from "./top-keywords";

export type TopApp = AppMeta & {
  /** Best position across the searched keywords, and which keyword gave it. */
  position: number;
  keyword: string;
};

export type TopAppsResult = { apps: TopApp[]; errors: string[] };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The first TOP_DEPTH results of each search with their full listings, without the app
 * itself. An app that ranks for several keywords is read once.
 */
export async function fetchTopApps(app: { store: Store; storeId: string; country: string }, terms: string[]): Promise<TopAppsResult> {
  const adapter = getAdapter(app.store);
  const query = { country: app.country, lang: getCountry(app.country).lang };
  const errors: string[] = [];

  const searches = await Promise.allSettled(terms.map((term) => adapter.searchApps(term, { ...query, limit: TOP_DEPTH })));
  const best = new Map<string, { position: number; keyword: string }>();
  searches.forEach((r, i) => {
    if (r.status === "rejected") {
      errors.push(`«${terms[i]}»: ${message(r.reason)}`);
      return;
    }
    r.value.slice(0, TOP_DEPTH).forEach((summary, index) => {
      if (summary.id === app.storeId) return;
      const prev = best.get(summary.id);
      if (!prev || index + 1 < prev.position) best.set(summary.id, { position: index + 1, keyword: terms[i] });
    });
  });

  const ids = [...best.keys()];
  const listings = await Promise.allSettled(ids.map((id) => adapter.getApp(id, query)));
  const apps: TopApp[] = [];
  listings.forEach((r, i) => {
    if (r.status === "fulfilled") apps.push({ ...r.value, ...best.get(ids[i])! });
    else errors.push(`ficha ${ids[i]}: ${message(r.reason)}`);
  });
  apps.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  return { apps, errors };
}

import gplay, { type IAppItem, type IAppItemFullDetail } from "google-play-scraper";
import { limiters, withRetry } from "./retry";
import { StoreError, type AppMeta, type AppSummary, type StoreAdapter } from "./types";

// google-play-scraper reads Google Play's HTML, so it can break when Google changes
// the page. Keep every call behind this adapter.
const client = gplay.memoized({ maxAge: 6 * 60 * 60 * 1000 });

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return limiters.android(() =>
    withRetry(async () => {
      try {
        return await fn();
      } catch (error) {
        const status = (error as { status?: number }).status;
        const message = error instanceof Error ? error.message : String(error);
        throw new StoreError("android", message, status);
      }
    }),
  );
}

export function toSummary(app: IAppItem): AppSummary {
  return {
    store: "android",
    id: app.appId,
    title: app.title,
    developer: app.developer,
    icon: app.icon,
    rating: app.score || null,
    url: app.url,
  };
}

export function toMeta(app: IAppItemFullDetail, country: string): AppMeta {
  return {
    ...toSummary(app),
    country,
    bundleId: app.appId,
    category: app.genre ?? null,
    ratingsCount: app.ratings ?? null,
    price: app.free ? "Gratis" : app.priceText,
    version: app.version ?? null,
    updatedAt: app.updated ? new Date(app.updated).toISOString() : null,
    shortDescription: app.summary ?? null,
    description: app.description ?? "",
    releaseNotes: app.recentChanges ?? null,
    screenshots: app.screenshots ?? [],
  };
}

export const android: StoreAdapter = {
  store: "android",

  async searchApps(term, { country, lang, limit = 50 }) {
    const results = await wrap(() => client.search({ term, country, lang, num: Math.min(limit, 250) }));
    return results.map(toSummary);
  },

  async getApp(id, { country, lang }) {
    const app = await wrap(() => client.app({ appId: id, country, lang }));
    return toMeta(app, country);
  },
};

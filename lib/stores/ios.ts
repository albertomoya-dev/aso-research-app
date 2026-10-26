import { limiters, withRetry } from "./retry";
import { StoreError, type AppMeta, type AppSummary, type StoreAdapter } from "./types";

const BASE = "https://itunes.apple.com";
const CACHE_SECONDS = 6 * 60 * 60;

/** The fields we use from the iTunes Search/Lookup API. */
export type ItunesApp = {
  trackId: number;
  trackName: string;
  bundleId: string;
  artistName: string;
  artworkUrl512?: string;
  artworkUrl100: string;
  trackViewUrl: string;
  averageUserRating?: number;
  userRatingCount?: number;
  primaryGenreName?: string;
  formattedPrice?: string;
  version?: string;
  currentVersionReleaseDate?: string;
  description?: string;
  releaseNotes?: string;
  screenshotUrls?: string[];
};

async function itunes(path: string, params: Record<string, string>): Promise<ItunesApp[]> {
  const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
  return limiters.ios(() =>
    withRetry(async () => {
      const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
      if (!res.ok) throw new StoreError("ios", `App Store respondió ${res.status}`, res.status);
      const data = (await res.json()) as { results: ItunesApp[] };
      return data.results;
    }),
  );
}

export function toSummary(app: ItunesApp): AppSummary {
  return {
    store: "ios",
    id: String(app.trackId),
    title: app.trackName,
    developer: app.artistName,
    icon: app.artworkUrl512 ?? app.artworkUrl100,
    rating: app.averageUserRating ?? null,
    url: app.trackViewUrl,
  };
}

export function toMeta(app: ItunesApp, country: string): AppMeta {
  return {
    ...toSummary(app),
    country,
    bundleId: app.bundleId,
    category: app.primaryGenreName ?? null,
    ratingsCount: app.userRatingCount ?? null,
    price: app.formattedPrice ?? "",
    version: app.version ?? null,
    updatedAt: app.currentVersionReleaseDate ?? null,
    shortDescription: null,
    description: app.description ?? "",
    releaseNotes: app.releaseNotes ?? null,
    screenshots: app.screenshotUrls ?? [],
  };
}

export const ios: StoreAdapter = {
  store: "ios",

  async searchApps(term, { country, limit = 50 }) {
    const results = await itunes("search", {
      term,
      country,
      entity: "software",
      limit: String(Math.min(limit, 200)),
    });
    return results.map(toSummary);
  },

  async getApp(id, { country }) {
    // Accept either a numeric trackId or a bundle id such as com.example.app.
    const trackId = id.replace(/^id/, "");
    const key = /^\d+$/.test(trackId) ? "id" : "bundleId";
    const [app] = await itunes("lookup", { [key]: key === "id" ? trackId : id, country });
    if (!app) throw new StoreError("ios", `No existe la app ${id} en el App Store de ${country.toUpperCase()}`, 404);
    return toMeta(app, country);
  },
};

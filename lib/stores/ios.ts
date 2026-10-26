import { getCountry } from "../countries";
import { limiters, withRetry } from "./retry";
import { StoreError, type AppMeta, type AppSummary, type Review, type StoreAdapter } from "./types";

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
    ratingsCount: app.userRatingCount ?? null,
    url: app.trackViewUrl,
  };
}

type Label = { label: string };
type RssEntry = {
  id: Label;
  updated: Label;
  title: Label;
  content: Label;
  "im:rating": Label;
  "im:version"?: Label;
};

/** Reviews from the App Store customer-reviews RSS feed (JSON flavour). */
export function parseReviewFeed(data: { feed?: { entry?: RssEntry | RssEntry[] } }): Review[] {
  const entries = data.feed?.entry;
  // A feed with a single review returns an object instead of an array.
  const list = entries ? (Array.isArray(entries) ? entries : [entries]) : [];
  return list
    .filter((e) => e["im:rating"])
    .map((e) => ({
      id: e.id.label,
      rating: Number(e["im:rating"].label),
      title: e.title?.label ?? "",
      text: e.content?.label ?? "",
      date: new Date(e.updated.label).toISOString(),
      version: e["im:version"]?.label ?? null,
    }));
}

/** The feed serves at most 10 pages of 50 reviews. */
const REVIEW_PAGES = 10;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Terms from the plist the App Store hints endpoint returns. */
export function parseHints(xml: string): string[] {
  return [...xml.matchAll(/<key>term<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) =>
    m[1].replace(/&(#\d+|\w+);/g, (_, e: string) => (e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e] ?? `&${e};`))),
  );
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

  async suggest(prefix, { country }) {
    const url = `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?${new URLSearchParams({ clientApplication: "Software", term: prefix })}`;
    return limiters.ios(() =>
      withRetry(async () => {
        const res = await fetch(url, {
          headers: { "X-Apple-Store-Front": `${getCountry(country).storefront},29` },
          next: { revalidate: CACHE_SECONDS },
        });
        if (!res.ok) throw new StoreError("ios", `Autocompletado del App Store respondió ${res.status}`, res.status);
        return parseHints(await res.text());
      }),
    );
  },

  async getReviews(id, { country, limit }) {
    const trackId = id.replace(/^id/, "");
    const reviews: Review[] = [];
    for (let page = 1; page <= REVIEW_PAGES && reviews.length < limit; page++) {
      const url = `${BASE}/${country}/rss/customerreviews/page=${page}/id=${trackId}/sortby=mostrecent/json`;
      const batch = await limiters.ios(() =>
        withRetry(async () => {
          const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
          if (!res.ok) throw new StoreError("ios", `Reseñas del App Store respondieron ${res.status}`, res.status);
          return parseReviewFeed(await res.json());
        }),
      );
      if (batch.length === 0) break;
      reviews.push(...batch);
    }
    return reviews.slice(0, limit);
  },
};

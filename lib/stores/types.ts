export type Store = "ios" | "android";

export const STORES: Store[] = ["ios", "android"];

export const STORE_LABEL: Record<Store, string> = {
  ios: "App Store",
  android: "Google Play",
};

/** What a search result row needs. */
export type AppSummary = {
  store: Store;
  /** App Store trackId or Google Play package name. */
  id: string;
  title: string;
  developer: string;
  icon: string;
  rating: number | null;
  /** Only the App Store returns it in search results. */
  ratingsCount?: number | null;
  url: string;
};

/** The published store listing, normalized across stores. */
export type AppMeta = AppSummary & {
  country: string;
  bundleId: string | null;
  category: string | null;
  ratingsCount: number | null;
  price: string;
  version: string | null;
  updatedAt: string | null;
  /** Google Play short description. The App Store API does not expose the subtitle. */
  shortDescription: string | null;
  description: string;
  releaseNotes: string | null;
  screenshots: string[];
};

export type StoreQuery = { country: string; lang: string };

export type Review = {
  id: string;
  rating: number;
  title: string;
  text: string;
  /** ISO date. */
  date: string;
  version: string | null;
};

export interface StoreAdapter {
  store: Store;
  /** Results in store order, so index + 1 is the (approximate) search position. */
  searchApps(term: string, query: StoreQuery & { limit?: number }): Promise<AppSummary[]>;
  getApp(id: string, query: StoreQuery): Promise<AppMeta>;
  /** Store autocomplete for what the user has typed so far, in the store's order. */
  suggest(prefix: string, query: StoreQuery): Promise<string[]>;
  /** Most recent reviews in the country's store, newest first. */
  getReviews(id: string, query: StoreQuery & { limit: number }): Promise<Review[]>;
}

export class StoreError extends Error {
  constructor(
    public store: Store,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

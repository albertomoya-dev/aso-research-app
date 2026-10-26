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

export interface StoreAdapter {
  store: Store;
  /** Results in store order, so index + 1 is the (approximate) search position. */
  searchApps(term: string, query: StoreQuery & { limit?: number }): Promise<AppSummary[]>;
  getApp(id: string, query: StoreQuery): Promise<AppMeta>;
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

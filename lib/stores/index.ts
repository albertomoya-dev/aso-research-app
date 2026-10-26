import { android } from "./android";
import { ios } from "./ios";
import type { Store, StoreAdapter } from "./types";

export * from "./types";

const adapters: Record<Store, StoreAdapter> = { ios, android };

export function getAdapter(store: Store): StoreAdapter {
  return adapters[store];
}

/** True when the query is an id we can look up directly instead of searching. */
export function looksLikeAppId(store: Store, query: string): boolean {
  const q = query.trim();
  if (store === "ios") return /^(id)?\d{6,}$/.test(q);
  return /^[a-zA-Z][\w]*(\.[\w]+)+$/.test(q);
}

"use client";

import { useParams, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { marketCookieName, pickMarket } from "@/lib/app-nav";
import type { MarketCounters } from "@/lib/nav-queries";

export type NavProduct = { id: number; slug: string; title: string; icon: string; store: "ios" | "android" };
export type NavMarket = { id: number; country: string; url: string };

type AppNav = {
  product: NavProduct;
  markets: NavMarket[];
  /** The market of the URL or, on the app-wide pages, the one the user came from. */
  market: NavMarket;
  /** True on `/a/[app]/[market]/…`, false on the app-wide pages (creativos, ajustes). */
  inMarket: boolean;
  counters: Promise<Record<number, MarketCounters>>;
};

const AppNavContext = createContext<AppNav | null>(null);

/** The app being viewed, or null outside `/a/[app]/…`. */
export function useAppNav(): AppNav | null {
  return useContext(AppNavContext);
}

/**
 * Wraps the app shell. The active market comes from the URL (`/a/[app]/[market]`); on the app-wide
 * pages, from `?m=`, then from the last market seen in this visit, then from the cookie (a reload),
 * then the primary market. Visiting a market stores it in the cookie so the server can use it too.
 */
export function AppNavProvider({
  product,
  markets,
  initialCountry,
  counters,
  children,
}: {
  product: NavProduct;
  markets: NavMarket[];
  initialCountry: string | null;
  counters: Promise<Record<number, MarketCounters>>;
  children: React.ReactNode;
}) {
  const params = useParams<{ market?: string }>();
  const query = useSearchParams();
  const urlCountry = typeof params.market === "string" ? params.market : null;
  const [last, setLast] = useState<string | null>(urlCountry ?? initialCountry);
  const market = pickMarket(markets, urlCountry ?? query.get("m"), last) ?? markets[0];
  // Remember it for the app-wide pages of this visit (state) and for a reload of them (cookie).
  if (market.country !== last) setLast(market.country);

  useEffect(() => {
    document.cookie = `${marketCookieName(product.slug)}=${market.country}; path=/; max-age=31536000; samesite=lax`;
  }, [product.slug, market.country]);

  const value: AppNav = { product, markets, market, inMarket: urlCountry != null, counters };
  return <AppNavContext.Provider value={value}>{children}</AppNavContext.Provider>;
}

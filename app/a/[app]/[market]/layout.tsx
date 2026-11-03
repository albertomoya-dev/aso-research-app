import { loadMarket } from "@/lib/products";

// The shell (sidebar and header) is the app's layout. This one only answers 404 for an unknown
// country, before any page of the market runs.
export default async function MarketLayout({ children, params }: LayoutProps<"/a/[app]/[market]">) {
  const { app, market } = await params;
  await loadMarket(app, market);
  return children;
}

import { AppTabs } from "@/components/app-tabs";
import { loadMarket, marketPath, productPath } from "@/lib/products";

export default async function MarketLayout({ children, params }: LayoutProps<"/a/[app]/[market]">) {
  const { app, market } = await params;
  // 404 here for an unknown app or country, before any page of the market runs.
  const current = await loadMarket(app, market);
  return (
    <div className="flex flex-col gap-6">
      <AppTabs marketBase={marketPath(current)} productBase={productPath(current.productSlug)} />
      {children}
    </div>
  );
}

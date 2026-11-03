import { AppTabs } from "@/components/app-tabs";
import { loadProduct, marketPath, primaryMarket, productPath } from "@/lib/products";

/** Frame of the app-wide pages (`/a/[app]/creativos`, `/a/[app]/ajustes`): the tabs, with the market ones on the primary market. */
export async function ProductLayout({ slug, children }: { slug: string; children: React.ReactNode }) {
  const product = await loadProduct(slug);
  const primary = await primaryMarket(product.id);
  return (
    <div className="flex flex-col gap-6">
      <AppTabs marketBase={marketPath(primary)} productBase={productPath(product.slug)} />
      {children}
    </div>
  );
}

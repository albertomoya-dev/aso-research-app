import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { loadProduct, productPath } from "@/lib/products";

// «Ajustes de la app»: what belongs to the app as a whole, the same in every country. One URL per tab.
export default async function AppSettingsLayout({ children, params }: LayoutProps<"/a/[app]/ajustes">) {
  const product = await loadProduct((await params).app);
  const tabs = [
    { id: "producto", label: "Producto" },
    { id: "mercados", label: "Mercados" },
    { id: "marcas", label: "Marcas" },
    ...(product.store === "android" ? [{ id: "play", label: "Datos de Play Console" }] : []),
    { id: "peligro", label: "Zona de peligro" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ajustes de la app" />
      <SettingsTabs base={productPath(product.slug, "/ajustes")} tabs={tabs}>
        {children}
      </SettingsTabs>
    </div>
  );
}

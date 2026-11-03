import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppNavProvider } from "@/components/nav/app-context";
import { AppHeader } from "@/components/nav/app-header";
import { AllAppsLink, AppNavLinks, AppSettingsLink } from "@/components/nav/app-nav-links";
import { AppSwitcher } from "@/components/nav/app-switcher";
import { PaletteProvider } from "@/components/nav/command-palette";
import { MobileNav } from "@/components/nav/mobile-nav";
import { ShellLayout, SidebarFoot, SidebarFrame } from "@/components/nav/shell";
import { marketCookieName } from "@/lib/app-nav";
import { marketCounters, navProducts, navUnreadAlerts, productNavMarkets } from "@/lib/nav-queries";
import { loadProduct } from "@/lib/products";

// Shell of every page of an app (its markets and its app-wide pages): the app sidebar, the fixed
// header with the market picker and «Actualizar posiciones», the bottom bar on phones and ⌘K. The
// counters of the sidebar and the header's date come from ONE query and stream in (Suspense).
export default async function AppLayout({ children, params }: LayoutProps<"/a/[app]">) {
  const { app: slug } = await params;
  const product = await loadProduct(slug);
  const [markets, jar] = await Promise.all([productNavMarkets(product.id), cookies()]);
  if (markets.length === 0) notFound();
  const navProduct = { id: product.id, slug: product.slug, title: product.title, icon: product.icon, store: product.store };
  const current = { slug: product.slug, country: null };

  return (
    <AppNavProvider
      product={navProduct}
      markets={markets}
      initialCountry={jar.get(marketCookieName(product.slug))?.value ?? null}
      counters={marketCounters(product.id)}
    >
      <PaletteProvider products={navProducts()}>
        <ShellLayout
          sidebar={
            <SidebarFrame label={`Navegación de ${product.title}`}>
              <AllAppsLink />
              <div className="pt-1 pb-3">
                <Suspense fallback={<AppSwitcher products={[]} current={current} currentProduct={navProduct} />}>
                  <SwitcherData current={current} currentProduct={navProduct} />
                </Suspense>
              </div>
              <AppNavLinks collapsible />
              <SidebarFoot>
                <AppSettingsLink collapsible />
              </SidebarFoot>
            </SidebarFrame>
          }
          header={<AppHeader />}
          after={
            <Suspense fallback={<MobileNav products={[]} unread={0} />}>
              <MobileNavData />
            </Suspense>
          }
        >
          {children}
        </ShellLayout>
      </PaletteProvider>
    </AppNavProvider>
  );
}

async function SwitcherData(props: Omit<React.ComponentProps<typeof AppSwitcher>, "products">) {
  return <AppSwitcher products={await navProducts()} {...props} />;
}

async function MobileNavData() {
  const [products, unread] = await Promise.all([navProducts(), navUnreadAlerts()]);
  return <MobileNav products={products} unread={unread} />;
}

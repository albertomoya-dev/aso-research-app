import { Suspense } from "react";
import { PaletteButton, PaletteProvider } from "@/components/nav/command-palette";
import { GlobalNavLinks } from "@/components/nav/global-nav";
import { MobileNav } from "@/components/nav/mobile-nav";
import { Logo, ShellLayout, SidebarFoot, SidebarFrame } from "@/components/nav/shell";
import { navProducts, navUnreadAlerts } from "@/lib/nav-queries";

// Shell of the pages outside an app (Inicio, Actividad, Integraciones, Añadir app): the global
// sidebar, the bottom bar on phones and the ⌘K palette. The app list and the unread count stream in
// behind Suspense, so they never hold back the page.
export default function GlobalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PaletteProvider products={navProducts()}>
      <ShellLayout
        sidebar={
          <SidebarFrame label="Principal">
            <Logo />
            <div className="pt-2 pb-1">
              <PaletteButton className="w-full justify-start sm:max-lg:justify-center" />
            </div>
            <Suspense fallback={<GlobalNavLinks products={[]} unread={0} />}>
              <GlobalNavData />
            </Suspense>
            <SidebarFoot />
          </SidebarFrame>
        }
        after={
          <Suspense fallback={<MobileNav products={[]} unread={0} />}>
            <MobileNavData />
          </Suspense>
        }
      >
        {children}
      </ShellLayout>
    </PaletteProvider>
  );
}

async function GlobalNavData() {
  const [products, unread] = await Promise.all([navProducts(), navUnreadAlerts()]);
  return <GlobalNavLinks products={products} unread={unread} />;
}

async function MobileNavData() {
  const [products, unread] = await Promise.all([navProducts(), navUnreadAlerts()]);
  return <MobileNav products={products} unread={unread} />;
}

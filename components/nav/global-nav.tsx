"use client";

import { Activity, House, Plug } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ProductWithMarkets } from "@/lib/market-path";
import { AppSwitcher } from "./app-switcher";
import { NavCount, SidebarLink } from "./sidebar-link";

const glyph = (Icon: typeof House) => <Icon size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />;

/** The entries of the global sidebar (outside an app): the app picker, Inicio, Actividad and Integraciones. */
export function GlobalNavLinks({ products, unread }: { products: ProductWithMarkets[]; unread: number }) {
  const pathname = usePathname();
  return (
    <>
      <div className="pb-3">
        <AppSwitcher products={products} />
      </div>
      <div className="flex flex-col gap-0.5">
        <SidebarLink href="/" active={pathname === "/"} icon={glyph(House)} label="Inicio" collapsible />
        <SidebarLink
          href="/actividad"
          active={pathname.startsWith("/actividad")}
          icon={glyph(Activity)}
          label="Actividad"
          badge={<NavCount value={unread} label="sin leer" tone="brand" />}
          collapsible
        />
        <SidebarLink href="/integraciones" active={pathname.startsWith("/integraciones")} icon={glyph(Plug)} label="Integraciones" collapsible />
      </div>
    </>
  );
}

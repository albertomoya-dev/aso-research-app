"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export type SettingsTab = { id: string; label: string };

/**
 * The tabs of «Ajustes de la app» (Producto, Mercados, Marcas, Datos de Play Console, Zona de peligro).
 * Each tab has its own URL (`/a/[app]/ajustes/[tab]`), so it can be linked and the server renders only
 * the one open; choosing a tab navigates there, keeping `?m=`. Manual activation: the arrow keys move
 * the focus and Enter opens, so browsing the tabs does not load every page.
 */
export function SettingsTabs({ base, tabs, children }: { base: string; tabs: SettingsTab[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const segment = pathname.slice(base.length).split("/").filter(Boolean)[0];
  const value = tabs.some((t) => t.id === segment) ? segment : tabs[0].id;
  const m = query.get("m");

  return (
    <Tabs
      value={value}
      activationMode="manual"
      onValueChange={(next) => startTransition(() => router.push(`${base}/${next}${m ? `?m=${m}` : ""}`, { scroll: false }))}
    >
      <TabsList aria-label="Ajustes de la app">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* One panel per tab so every tab's aria-controls points somewhere; only the open one has content. */}
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} className="mt-6" aria-busy={t.id === value ? pending : undefined}>
          {t.id === value && <div className={pending ? "opacity-60 transition-opacity" : undefined}>{children}</div>}
        </TabsContent>
      ))}
    </Tabs>
  );
}

"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, use } from "react";
import { activeNavId, NAV_GROUPS, navHref, type NavCounter, type NavEntry, SETTINGS_ENTRY } from "@/lib/app-nav";
import { cn } from "@/lib/cn";
import { useAppNav } from "./app-context";
import { NavIconGlyph } from "./nav-icon";
import { NavCount, SidebarLink } from "./sidebar-link";

const COUNTER_LABEL: Record<NavCounter, string> = { alerts: "avisos sin leer", ideas: "ideas pendientes", pending: "candidatas pendientes" };

/** The count of one entry for the active market; streams in with the layout's aggregated query. */
function EntryCount({ counter }: { counter: NavCounter }) {
  const app = useAppNav()!;
  const counters = use(app.counters);
  const value = counters[app.market.id]?.[counter] ?? 0;
  return <NavCount value={value} label={COUNTER_LABEL[counter]} tone={counter === "alerts" ? "brand" : "neutral"} />;
}

function Entry({ entry, active, collapsible, onNavigate }: { entry: NavEntry; active: boolean; collapsible: boolean; onNavigate?: () => void }) {
  const app = useAppNav()!;
  return (
    <SidebarLink
      href={navHref(entry, { productSlug: app.product.slug, country: app.market.country })}
      active={active}
      icon={<NavIconGlyph icon={entry.icon} />}
      label={entry.label}
      collapsible={collapsible}
      onNavigate={onNavigate}
      badge={
        entry.counter ? (
          <Suspense fallback={null}>
            <EntryCount counter={entry.counter} />
          </Suspense>
        ) : undefined
      }
    />
  );
}

/**
 * The sections of an app: Resumen, then KEYWORDS, MERCADO and OPTIMIZAR (lib/app-nav.ts). In the
 * sidebar (`collapsible`) it shrinks to icons on tablets; the mobile sheet shows it full.
 */
export function AppNavLinks({ collapsible = false, onNavigate }: { collapsible?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeNavId(pathname);
  return (
    <div className="flex flex-col gap-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.id} role="group" aria-label={group.label ?? undefined} className="flex flex-col gap-0.5">
          {group.label && (
            <div aria-hidden="true" className={cn("px-2.5 pb-1 text-label font-medium tracking-wide text-muted uppercase", collapsible && "sm:max-lg:hidden")}>
              {group.label}
            </div>
          )}
          {group.label && collapsible && <div aria-hidden="true" className="mx-2 hidden h-px bg-line sm:max-lg:block" />}
          {group.entries.map((entry) => (
            <Entry key={entry.id} entry={entry} active={active === entry.id} collapsible={collapsible} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** «Ajustes de la app», at the foot of the app sidebar. */
export function AppSettingsLink({ collapsible = false, onNavigate }: { collapsible?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return <Entry entry={SETTINGS_ENTRY} active={activeNavId(pathname) === "ajustes"} collapsible={collapsible} onNavigate={onNavigate} />;
}

/** «← Todas las apps», back to Inicio. */
export function AllAppsLink() {
  return (
    <SidebarLink href="/" active={false} icon={<ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />} label="Todas las apps" collapsible />
  );
}

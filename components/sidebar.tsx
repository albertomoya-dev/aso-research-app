import Link from "next/link";
import { Suspense } from "react";
import { getDb, hasDatabase, schema } from "@/db";
import { unreadAlertCount } from "@/lib/alert-jobs";
import { AppIcon } from "./app-icon";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";

async function unreadAlerts() {
  if (!hasDatabase()) return 0;
  try {
    return await unreadAlertCount();
  } catch {
    return 0;
  }
}

async function followedApps() {
  if (!hasDatabase()) return [];
  try {
    return await getDb()
      .select({ id: schema.apps.id, title: schema.apps.title, icon: schema.apps.icon, store: schema.apps.store })
      .from(schema.apps)
      .orderBy(schema.apps.title);
  } catch {
    return [];
  }
}

// The sidebar's data streams in behind Suspense so it never holds back the page itself.
export function Sidebar() {
  return (
    <nav
      aria-label="Principal"
      className="flex shrink-0 flex-col gap-0.5 border-b border-line px-3 py-3 md:w-56 md:overflow-y-auto md:border-b-0 md:py-4"
    >
      <Link href="/" className="flex items-center gap-2 px-2.5 pb-3 md:pb-4">
        <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true">
          <rect width="28" height="28" rx="7" fill="var(--brand)" />
          <path d="M8 19l5-6 3 3 5-7" stroke="var(--on-brand)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[15px] font-semibold tracking-tight">Rankeo</span>
      </Link>
      <div className="flex gap-0.5 overflow-x-auto md:flex-col">
        <NavLink href="/">
          <Icon d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />
          Panel
        </NavLink>
        <NavLink href="/buscar">
          <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3" />
          Buscar app
        </NavLink>
        <NavLink href="/novedades">
          <Icon d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
          Novedades
          <Suspense>
            <UnreadBadge />
          </Suspense>
        </NavLink>
        <NavLink href="/resumen">
          <Icon d="M3 3v18h18M7 15l4-4 3 3 5-6" />
          Resumen semanal
        </NavLink>
      </div>
      <Suspense>
        <FollowedApps />
      </Suspense>
      <div className="mt-auto hidden pt-4 md:block">
        <ThemeToggle />
      </div>
    </nav>
  );
}

async function UnreadBadge() {
  const unread = await unreadAlerts();
  if (unread === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-brand px-2 py-0.5 font-mono text-xs font-semibold text-on-brand">
      <span className="sr-only">sin leer: </span>
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

async function FollowedApps() {
  const apps = await followedApps();
  if (apps.length === 0) return null;
  return (
    <div className="mt-5 hidden md:block">
      <div className="px-2.5 pb-1 text-xs font-medium text-muted">Mis apps</div>
      {apps.map((app) => (
        <NavLink key={app.id} href={`/apps/${app.id}`}>
          <AppIcon src={app.icon} size={18} />
          <span className="truncate">{app.title}</span>
        </NavLink>
      ))}
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted">
      <path d={d} />
    </svg>
  );
}

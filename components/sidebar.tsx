import Link from "next/link";
import { getDb, hasDatabase, schema } from "@/db";
import { unreadAlertCount } from "@/lib/alert-jobs";
import { AppIcon } from "./app-icon";
import { NavLink } from "./nav-link";

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

export async function Sidebar() {
  const [apps, unread] = await Promise.all([followedApps(), unreadAlerts()]);
  return (
    <nav
      aria-label="Principal"
      className="flex shrink-0 flex-col gap-1 border-b border-line bg-surface px-4 py-4 md:w-60 md:border-r md:border-b-0 md:py-6"
    >
      <Link href="/" className="flex items-center gap-2.5 px-2 pb-3 md:pb-5">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <rect width="28" height="28" rx="7" fill="var(--brand)" />
          <path d="M8 19l5-6 3 3 5-7" stroke="var(--on-brand)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[17px] font-bold">Rankeo</span>
      </Link>
      <div className="flex gap-1 md:flex-col">
        <NavLink href="/">Panel</NavLink>
        <NavLink href="/buscar">Buscar app</NavLink>
        <NavLink href="/novedades">
          Novedades
          {unread > 0 && (
            <span className="ml-auto rounded-full bg-brand px-2 py-0.5 font-mono text-xs font-semibold text-on-brand">
              <span className="sr-only">sin leer: </span>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </NavLink>
        <NavLink href="/resumen">Resumen semanal</NavLink>
      </div>
      {apps.length > 0 && (
        <div className="mt-6 hidden md:block">
          <div className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Mis apps</div>
          {apps.map((app) => (
            <NavLink key={app.id} href={`/apps/${app.id}`}>
              <AppIcon src={app.icon} size={24} />
              <span className="truncate">{app.title}</span>
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}

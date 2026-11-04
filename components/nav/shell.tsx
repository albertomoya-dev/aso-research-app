import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import pkg from "@/package.json";

// Frame shared by the global shell (app/(global)/layout.tsx) and the app shell (app/a/[app]/layout.tsx):
// the sidebar is hidden below 640 px (the bottom bar replaces it), icons only from 640 to 1024 px and
// 240 px wide from 1024 px up. From 640 px up the page scrolls inside <main>, so the sidebar and the header
// stay put. Below 640 px the document itself scrolls (the header sticks to the top), so mobile browsers
// can collapse their address bar.

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2 px-2.5 sm:max-lg:justify-center sm:max-lg:px-0 md:min-h-9" aria-label="Rankeo, inicio">
      <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
        <rect width="28" height="28" rx="7" fill="var(--brand)" />
        <path d="M8 19l5-6 3 3 5-7" stroke="var(--on-brand)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight sm:max-lg:sr-only">Rankeo</span>
    </Link>
  );
}

export function SidebarFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav
      aria-label={label}
      className="hidden shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-2 py-3 sm:flex sm:w-16 lg:w-60 lg:px-3"
    >
      {children}
    </nav>
  );
}

export function SidebarFoot({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
      {children}
      <div className="sm:max-lg:[&_span]:sr-only sm:max-lg:[&_button]:justify-center sm:max-lg:[&_button]:px-0">
        <ThemeToggle />
      </div>
      <p className="px-2.5 pt-1 font-mono text-[11px] text-muted sm:max-lg:sr-only">v{pkg.version}</p>
    </div>
  );
}

/** Sidebar, the content column (with an optional fixed header) and the space the bottom bar takes on phones. */
export function ShellLayout({ sidebar, header, children, after }: { sidebar: React.ReactNode; header?: React.ReactNode; children: React.ReactNode; after?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh sm:h-dvh">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="min-w-0 flex-1 px-4 pt-6 pb-24 sm:overflow-y-auto sm:pb-8 md:px-8">{children}</main>
      </div>
      {after}
    </div>
  );
}

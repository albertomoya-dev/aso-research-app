"use client";

// The label follows <html data-theme> through CSS, so the button needs no state and
// renders the same on server and client.
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    if (next === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted hover:bg-surface-muted hover:text-ink light:hover:bg-line/60 md:min-h-8"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="light:hidden">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="hidden light:block">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <span className="light:hidden">Modo claro</span>
      <span className="hidden light:inline">Modo oscuro</span>
    </button>
  );
}

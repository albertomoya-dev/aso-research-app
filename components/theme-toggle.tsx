"use client";

import { Moon, Sun } from "lucide-react";

// The label follows <html data-theme> through CSS (the `dark:` variant), so the button needs no
// state and renders the same on server and client. Light is the default.
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    if (next === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted hover:bg-surface-muted hover:text-ink md:min-h-8"
    >
      <Moon size={16} strokeWidth={1.8} aria-hidden="true" className="dark:hidden" />
      <Sun size={16} strokeWidth={1.8} aria-hidden="true" className="hidden dark:block" />
      <span className="dark:hidden">Modo oscuro</span>
      <span className="hidden dark:inline">Modo claro</span>
    </button>
  );
}

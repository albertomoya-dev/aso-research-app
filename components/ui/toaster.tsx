"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Sonner's toaster, unstyled and drawn with our tokens, so it follows the theme through the CSS
 * variables instead of Sonner's own light/dark palette. Mounted once in app/layout.tsx; call
 * `toast(...)` from "sonner" anywhere on the client.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-2.5 rounded-card border border-line bg-surface p-3.5 text-[13px] text-ink shadow-float sm:w-[356px]",
          title: "font-medium",
          description: "mt-0.5 text-ink-soft",
          actionButton: "ml-auto shrink-0 rounded-control bg-brand px-2.5 py-1 text-xs font-medium text-on-brand",
          cancelButton: "ml-auto shrink-0 rounded-control bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink",
          closeButton: "border border-line bg-surface text-muted hover:text-ink",
          success: "[&_[data-icon]]:text-up",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warn-fg",
        },
      }}
    />
  );
}

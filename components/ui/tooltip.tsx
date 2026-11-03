"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

// shadcn/ui's Tooltip on our tokens. Radix tooltips open on hover and keyboard focus only, so they
// suit labels of icon buttons. Explanations that must also open with a tap use HelpTip.

export function TooltipProvider({ delayDuration = 200, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

/** Carries its own provider, so it works anywhere without wrapping the app. */
export function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props} />
    </TooltipProvider>
  );
}
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 max-w-64 rounded-control bg-ink px-2.5 py-1.5 text-xs text-surface shadow-float", className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

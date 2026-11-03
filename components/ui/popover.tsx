"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

// shadcn/ui's Popover on our tokens: small floating panels (filters, pickers). Menus use DropdownMenu.

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 w-72 rounded-card border border-line bg-surface p-4 text-sm text-ink shadow-float outline-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

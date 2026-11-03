"use client";

import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

// Side panel (shadcn/ui's Sheet on Radix Dialog). The detail of a row opens here: 480 px from the
// right on desktop, full width on mobile; the table behind stays as it was.

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const SIDE = {
  right: "inset-y-0 right-0 h-full w-full border-l sm:w-[480px]",
  left: "inset-y-0 left-0 h-full w-full border-r sm:w-[480px]",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-card border-t",
} as const;

export function SheetContent({
  className,
  children,
  side = "right",
  closeLabel = "Cerrar",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: keyof typeof SIDE; closeLabel?: string }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay" />
      <SheetPrimitive.Content
        className={cn("fixed z-50 flex flex-col gap-4 overflow-y-auto border-line bg-surface p-5 text-ink shadow-float", SIDE[side], className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          aria-label={closeLabel}
          className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand md:size-8"
        >
          <X size={16} aria-hidden="true" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 pr-10", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("text-card-title font-semibold", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("text-[13px] text-ink-soft", className)} {...props} />;
}

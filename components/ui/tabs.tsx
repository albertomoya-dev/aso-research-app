"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

// shadcn/ui's Tabs on our tokens: switches views inside one panel (Vista previa | Cobertura…).
// Navigation between pages is not tabs: it goes in the sidebar.

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-control bg-surface-muted p-0.5", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium whitespace-nowrap text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-brand data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-[0_0_0_1px_var(--line)] md:min-h-7",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-3 outline-none", className)} {...props} />;
}

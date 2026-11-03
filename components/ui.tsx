import { cn } from "@/lib/cn";
import { buttonVariants } from "./ui/button-variants";

// Shared primitives kept here because about 65 files import them. New components live in
// components/ui/ (see DESIGN.md §5).

export { Skeleton } from "./ui/skeleton";

/** Groups related content. Tables go straight on it, never a card inside a card. */
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-card border border-line bg-surface", className)} {...props} />;
}

/**
 * Page title, an optional line of context (`children`) and the actions on the right: one primary
 * plus a «⋯» menu at most.
 */
export function PageHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-page-title font-semibold text-ink">{title}</h1>
        {children && <p className="mt-1 max-w-3xl text-[13px] text-ink-soft">{children}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const buttonPrimary = buttonVariants({ variant: "primary" });
export const buttonSecondary = buttonVariants({ variant: "secondary" });
export const inputClass =
  "min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-2 focus:outline-brand/40 md:min-h-9";

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">
      {children}
    </p>
  );
}

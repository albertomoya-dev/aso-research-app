export function Card({ className = "", ...props }: React.ComponentProps<"section">) {
  return <section className={`rounded-xl border border-line bg-surface shadow-[inset_0_1px_0_0_var(--edge)] ${className}`} {...props} />;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children && <p className="mt-1 text-[13px] text-muted">{children}</p>}
    </div>
  );
}

export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-brand px-3.5 text-[13px] font-medium md:min-h-8 text-on-brand hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50 disabled:opacity-60";
export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface-muted px-3.5 text-[13px] font-medium md:min-h-8 text-ink hover:border-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50";
export const inputClass =
  "min-h-11 rounded-md border border-line-strong bg-surface px-3 text-sm md:min-h-9 text-ink focus:border-brand focus:outline-2 focus:outline-brand/50";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-muted ${className}`} />;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{children}</p>;
}

export function Card({ className = "", ...props }: React.ComponentProps<"section">) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`} {...props} />;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {children && <p className="mt-1.5 text-sm text-muted">{children}</p>}
    </div>
  );
}

export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] bg-brand px-5 text-sm font-semibold text-on-brand hover:opacity-90 disabled:opacity-60";
export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted";
export const inputClass =
  "min-h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] text-ink focus:border-brand focus:outline-3 focus:outline-brand-soft";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-muted ${className}`} />;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{children}</p>;
}

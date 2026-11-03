import { cn } from "@/lib/cn";

/** ●●●●○: relevance 1–5 as dots, with its value for screen readers. Nothing when unknown. */
export function RelevanceDots({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return null;
  return (
    <span role="img" className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Relevancia ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" className={cn("size-1.5 rounded-full", i <= value ? "bg-brand" : "bg-line-strong")} />
      ))}
    </span>
  );
}

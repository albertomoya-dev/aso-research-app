import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** One sentence. Longer explanations go to a HelpTip or the README. */
  description: string;
  /** Usually one Button: what to do to fill this space. */
  action?: React.ReactNode;
  className?: string;
};

/** Replaces explanatory paragraphs when there is nothing to show yet: icon, title, one sentence, one action. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div data-empty-state className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-surface-muted text-ink-soft">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h3 className="text-card-title font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-[13px] text-ink-soft">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

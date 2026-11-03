import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button classes, usable from server and client code (the `buttonPrimary`… strings of
 * components/ui.tsx come from here). One primary action per screen; the rest are secondary or
 * ghost. Touch targets are 44 px on mobile and shrink to the compact desktop size from `md` up.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-60 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:bg-brand-hover",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
        ghost: "text-ink-soft hover:bg-surface-muted hover:text-ink",
        danger: "bg-danger text-surface hover:opacity-90",
      },
      size: {
        sm: "min-h-11 px-2.5 text-[13px] md:min-h-7",
        md: "min-h-11 px-3.5 text-[13px] md:min-h-8",
        lg: "min-h-11 px-4 text-sm md:min-h-10",
        icon: "size-11 md:size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

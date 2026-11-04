"use client";

import { Slot } from "radix-ui";
import { cn } from "@/lib/cn";
import { buttonVariants, type ButtonVariantProps } from "./button-variants";

export { buttonVariants };

export type ButtonProps = React.ComponentProps<"button"> & ButtonVariantProps & { asChild?: boolean };

/** `<Button variant="primary">`; with `asChild` it styles its child instead (a Link, for instance). */
export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-variant={variant ?? "secondary"}
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  );
}

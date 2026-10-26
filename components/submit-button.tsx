"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  pendingLabel,
  children,
  ...props
}: { pendingLabel: string } & React.ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}

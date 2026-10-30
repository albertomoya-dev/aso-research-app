"use client";

import { useActionState } from "react";
import { ConfirmButton } from "./confirm-button";
import { buttonPrimary } from "./ui";

export type PublishState = { ok?: boolean; message?: string; error?: string } | null;

type Props = {
  action: (prev: PublishState, formData: FormData) => Promise<PublishState>;
  /** Hidden fields: appId, locale, country, draftUpdatedAt… */
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  /** Text of the browser's confirmation dialog: what will change and where. */
  confirmMessage: string;
  /** Extra inputs inside the form (App Store Connect: promotional text and release notes). */
  children?: React.ReactNode;
};

/** The single confirmed write of the publish page. The server checks the confirmation and the write flag again. */
export function PublishForm({ action, fields, label, pendingLabel, confirmMessage, children }: Props) {
  const [state, formAction, pending] = useActionState<PublishState, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="confirm" value="yes" />
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <ConfirmButton message={confirmMessage} disabled={pending || state?.ok} aria-busy={pending} className={buttonPrimary}>
          {pending ? pendingLabel : label}
        </ConfirmButton>
        <span aria-live="polite" className="text-[13px]">
          {state?.error && <span className="text-danger">{state.error}</span>}
          {state?.ok && <span className="text-up">{state.message}</span>}
        </span>
      </div>
    </form>
  );
}

"use client";

import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

/** «¿Publicar…? Google revisará…» → the question as the title and the rest as the description. */
export function splitConfirmMessage(message: string): { title: string; description: string | null } {
  const end = message.indexOf("?");
  if (end < 0 || end === message.length - 1) return { title: message, description: null };
  return { title: message.slice(0, end + 1), description: message.slice(end + 1).trim() || null };
}

type Props = {
  /** The question: «¿Borrar el experimento «X»?». Text after the first «?» goes under it. */
  message: string;
  /** The confirming button of the dialog; «Sí, seguir» by default. */
  confirmLabel?: string;
  /** A deletion: the confirming button is red. */
  destructive?: boolean;
} & React.ComponentProps<"button">;

/**
 * A submit button that asks first, in a `Dialog` (DESIGN.md: never `window.confirm`). It sits in the
 * form like the submit button it replaces: the dialog's confirmation submits the form through a hidden
 * submit button that carries `formAction`, `name`, `value` and `formNoValidate`.
 */
export function ConfirmButton({ message, confirmLabel = "Sí, seguir", destructive, formAction, formNoValidate, name, value, onClick, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const submitter = useRef<HTMLButtonElement>(null);
  const { title, description } = splitConfirmMessage(message);
  return (
    <>
      <button
        {...props}
        type="button"
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) setOpen(true);
        }}
      />
      <button ref={submitter} type="submit" hidden tabIndex={-1} aria-hidden="true" formAction={formAction} formNoValidate={formNoValidate} name={name} value={value} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent {...(description ? {} : { "aria-describedby": undefined })}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button
              variant={destructive ? "danger" : "primary"}
              onClick={() => {
                const button = submitter.current;
                setOpen(false);
                button?.form?.requestSubmit(button);
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

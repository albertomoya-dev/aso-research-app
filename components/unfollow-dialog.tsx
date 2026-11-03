"use client";

import { useState } from "react";
import { unfollowApp } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { inputClass } from "./ui";
import { Button, buttonVariants } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

const normal = (s: string) => s.trim().toLocaleLowerCase("es");

/**
 * «Dejar de seguir <país>» in the danger zone. It deletes the market's keywords and history and cannot
 * be undone, so the dialog asks to type the app's name first. The text is unfollowConfirmation().
 */
export function UnfollowDialog({ appId, title, countryName, message }: { appId: number; title: string; countryName: string; message: string }) {
  const [typed, setTyped] = useState("");
  const ok = normal(typed) === normal(title);
  return (
    <Dialog onOpenChange={(open) => !open && setTyped("")}>
      <DialogTrigger asChild>
        <Button variant="danger">Dejar de seguir {countryName}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dejar de seguir {title} en {countryName}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <form action={unfollowApp} className="flex flex-col gap-4">
          <input type="hidden" name="appId" value={appId} />
          <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
            Escribe «{title}» para confirmar
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className={inputClass} />
          </label>
          <DialogFooter>
            <SubmitButton disabled={!ok} className={buttonVariants({ variant: "danger" })} pendingLabel="Borrando…">
              Dejar de seguir
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

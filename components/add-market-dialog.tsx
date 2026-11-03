"use client";

import { Plus } from "lucide-react";
import { followInCountry } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { buttonPrimary, inputClass } from "./ui";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

type Option = { code: string; label: string };

/**
 * «+ Añadir mercado»: follow the same app in another country's store (followInCountry), optionally
 * copying the keywords of one of its markets. The action opens the new market when it is done.
 */
export function AddMarketDialog({
  available,
  sources,
  defaultCountry,
  defaultSource,
}: {
  available: Option[];
  /** Markets to copy keywords from: value is the market id. */
  sources: { id: number; label: string }[];
  defaultCountry?: string;
  defaultSource: number;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary" disabled={available.length === 0}>
          <Plus size={16} aria-hidden="true" />
          Añadir mercado
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir mercado</DialogTitle>
          <DialogDescription>Sigue la misma app en la tienda de otro país. Sus keywords y posiciones van aparte.</DialogDescription>
        </DialogHeader>
        <form action={followInCountry} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
            País
            <select name="country" defaultValue={defaultCountry} className={inputClass} required>
              {available.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-table font-medium text-ink-soft">
            Copiar las keywords de
            <select name="appId" defaultValue={defaultSource} className={inputClass}>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body text-ink-soft">
            <input type="checkbox" name="copyKeywords" defaultChecked className="size-5 accent-[var(--brand)]" />
            Copiar las keywords (útil si el país comparte idioma)
          </label>
          <DialogFooter>
            <SubmitButton className={buttonPrimary} pendingLabel="Buscando la app…">
              Añadir mercado
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

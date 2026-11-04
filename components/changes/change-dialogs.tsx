"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeAnnotation } from "@/app/actions";
import { AnnotationForm } from "../annotation-form";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

/** «Añadir cambio»: a manual timeline entry (a campaign, a press mention…) in a dialog that closes on save. */
export function AddChangeDialog({ appId, defaultDate }: { appId: number; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus size={16} aria-hidden="true" />
          Añadir cambio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir cambio</DialogTitle>
          <DialogDescription>Lo que la tienda no muestra: una campaña, una mención en prensa, un cambio en otro país.</DialogDescription>
        </DialogHeader>
        <AnnotationForm
          appId={appId}
          defaultDate={defaultDate}
          stacked
          onDone={() => {
            setOpen(false);
            toast("Cambio añadido a la línea de tiempo");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Deletes one entry after a confirmation dialog (DESIGN.md: never `window.confirm`). */
export function DeleteChangeButton({ appId, annotationId, label }: { appId: number; annotationId: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Borrar «${label}»`} className="text-muted hover:text-danger">
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Borrar este cambio?</DialogTitle>
          <DialogDescription>«{label}» desaparece de la línea de tiempo y de los gráficos de posición.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const fd = new FormData();
                fd.set("appId", String(appId));
                fd.set("annotationId", String(annotationId));
                await removeAnnotation(fd);
                setOpen(false);
              })
            }
          >
            {pending ? "Borrando…" : "Borrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

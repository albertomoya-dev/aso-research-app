"use client";

import { Settings } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

/** The gear of Actividad: «Qué avisos quieres recibir», with the per-app forms (server-rendered) inside. */
export function AlertPrefsDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Qué avisos quieres recibir">
          <Settings size={16} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Qué avisos quieres recibir</DialogTitle>
          <DialogDescription>Por app. Se aplica desde la próxima consulta de posiciones; los avisos ya creados no cambian.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

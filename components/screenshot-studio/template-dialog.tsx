"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { type Template, TEMPLATES } from "@/lib/assets/screenshots";
import { customLook, templateWouldOverwrite } from "@/lib/assets/studio-edits";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { THUMB_WIDTH } from "./types";
import type { Previews } from "./use-previews";
import type { Studio } from "./use-studio";

/**
 * The template picker: every template drawn with the first screen. A template that would replace the
 * user's own colours asks first, with «Mantener mis colores» as the default (H23); the AI backdrop is
 * always kept, and the toast after applying offers «Deshacer».
 */
export function TemplateDialog({
  studio,
  previews,
  open,
  onOpenChange,
}: {
  studio: Studio;
  previews: Previews;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { spec, preset, pickTemplate } = studio;
  const [pending, setPending] = useState<Template | null>(null);
  const look = customLook(spec);

  function close() {
    setPending(null);
    onOpenChange(false);
  }
  function choose(t: Template) {
    if (templateWouldOverwrite(spec, t)) {
      setPending(t);
      return;
    }
    pickTemplate(t.id);
    close();
  }
  function apply(keepColors: boolean) {
    if (pending) pickTemplate(pending.id, keepColors);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{pending ? "¿Sustituir tus colores?" : "Plantillas"}</DialogTitle>
          <DialogDescription>
            {pending
              ? `«${pending.label}» trae sus propios colores y cambiaría los tuyos.${look.background ? " Tu fondo con IA se mantiene en los dos casos." : ""}`
              : "Composición completa: adorno, pose del móvil y texto. Después puedes afinar cada ajuste."}
          </DialogDescription>
        </DialogHeader>
        {pending && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Volver
            </Button>
            <Button variant="secondary" onClick={() => apply(false)}>
              Usar los de la plantilla
            </Button>
            <Button variant="primary" onClick={() => apply(true)} autoFocus>
              Mantener mis colores
            </Button>
          </DialogFooter>
        )}
        {/* Hidden, not unmounted, while confirming: the thumbnails stay drawn for «Volver». */}
        <div hidden={pending != null}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TEMPLATES.map((t) => {
                const active = spec.template === t.id;
                return (
                  <li key={t.id} className="relative">
                    <button
                      type="button"
                      onClick={() => choose(t)}
                      aria-pressed={active}
                      aria-describedby={`template-${t.id}-desc`}
                      className={cn(
                        "flex w-full flex-col items-center gap-1.5 rounded-control border-2 p-2 text-[13px]",
                        active ? "border-brand text-ink" : "border-line text-ink-soft hover:border-line-strong",
                      )}
                    >
                      <canvas
                        ref={previews.thumbRef(t.id)}
                        style={{ width: THUMB_WIDTH, aspectRatio: `${preset.width} / ${preset.height}` }}
                        className="block max-w-full rounded-control bg-surface-muted"
                      />
                      <span className="font-medium">{t.label}</span>
                    </button>
                    <span id={`template-${t.id}-desc`} className="sr-only">
                      {t.description}
                    </span>
                  </li>
                );
              })}
            </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

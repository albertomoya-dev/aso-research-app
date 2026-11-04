"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { BackgroundFields } from "./background-fields";
import { CaptureFields } from "./capture-fields";
import { DeviceFields } from "./device-fields";
import { StyleFields } from "./style-fields";
import { TextFields } from "./text-fields";
import type { Ai } from "./use-ai";
import type { Upload } from "./use-upload";
import type { Studio } from "./use-studio";

/** One collapsible block of the inspector: a heading button (aria-expanded) and its panel. */
export function InspectorSection({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-labelledby={`${id}-heading`} className="border-b border-line last:border-b-0">
      <h3 id={`${id}-heading`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-[13px] font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand md:min-h-10"
        >
          {title}
          <ChevronDown size={16} aria-hidden="true" className={cn("text-muted transition-transform", open && "rotate-180")} />
        </button>
      </h3>
      {/* Hidden rather than unmounted: what is typed in a closed section stays. */}
      <div id={`${id}-panel`} hidden={!open} className="px-4 pt-1 pb-4">
        {children}
      </div>
    </section>
  );
}

/** The right column: Texto, Captura, Dispositivo, Estilo and Fondo of the selected screen and of the set. */
export function Inspector({ studio, upload, ai, onOpenTemplates }: { studio: Studio; upload: Upload; ai: Ai; onOpenTemplates: () => void }) {
  const { slide, selected } = studio;
  return (
    <aside aria-label="Inspector" className="min-w-0 self-start rounded-card border border-line bg-surface">
      {slide && (
        <>
          <InspectorSection id="inspector-text" title={`Texto · pantalla ${selected + 1}`} defaultOpen>
            <TextFields studio={studio} ai={ai} slide={slide} />
          </InspectorSection>
          <InspectorSection id="inspector-capture" title="Captura" defaultOpen>
            <CaptureFields studio={studio} upload={upload} slide={slide} />
          </InspectorSection>
        </>
      )}
      <InspectorSection id="inspector-device" title="Dispositivo">
        <DeviceFields studio={studio} />
      </InspectorSection>
      <InspectorSection id="inspector-style" title="Estilo">
        <StyleFields studio={studio} onOpenTemplates={onOpenTemplates} />
      </InspectorSection>
      <InspectorSection id="inspector-background" title="Fondo">
        <BackgroundFields studio={studio} ai={ai} />
      </InspectorSection>
    </aside>
  );
}

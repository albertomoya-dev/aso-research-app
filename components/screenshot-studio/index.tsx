"use client";

import { Monitor } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { CanvasView } from "./canvas-view";
import { Inspector } from "./inspector";
import { SlideList } from "./slide-list";
import { HelpTip } from "../ui/help-tip";
import { staleMessage, staleTitle } from "./stale-message";
import { TemplateDialog } from "./template-dialog";
import { Toolbar } from "./toolbar";
import type { ScreenshotStudioProps } from "./types";
import { useAi } from "./use-ai";
import { useExport } from "./use-export";
import { usePreviews } from "./use-previews";
import { useStudio } from "./use-studio";
import { useUpload } from "./use-upload";

export type { ScreenshotStudioProps } from "./types";

/**
 * The screenshot editor (phase 32), laid out like a design tool: the top bar, the screens on the left
 * (200 px), the large canvas in the middle and the inspector on the right (320 px). Below `xl` the
 * screens become a row above the canvas; on a phone every zone stacks.
 */
export function ScreenshotStudio(props: ScreenshotStudioProps) {
  const studio = useStudio(props);
  const [overview, setOverview] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const previews = usePreviews(studio, `${studio.slide?.id}|${overview}|${templatesOpen}`);
  const upload = useUpload(studio);
  const ai = useAi(studio);
  const exporter = useExport(studio);
  const { selected, stale } = studio;

  return (
    <div
      onDragOver={upload.onDragOver}
      onDragLeave={upload.onDragLeave}
      onDrop={upload.onDrop}
      className={cn("flex min-w-0 flex-col gap-4 rounded-card", upload.dragging && "outline-2 outline-offset-4 outline-brand outline-dashed")}
    >
      <p className="flex items-center gap-2 rounded-control bg-surface-muted px-3 py-2 text-[13px] text-ink-soft lg:hidden">
        <Monitor size={16} aria-hidden="true" className="shrink-0" />
        <span>
          <span className="font-medium text-ink">Mejor en un ordenador.</span> Aquí también funciona, con las zonas una debajo de otra.
        </span>
      </p>
      <Toolbar studio={studio} exporter={exporter} overview={overview} setOverview={setOverview} />
      {upload.dragging && (
        <p className="rounded-control bg-brand-soft px-4 py-3 text-sm text-brand-strong">
          Suelta las capturas (o una carpeta): se colocan por orden de nombre desde la pantalla {selected + 1}.
        </p>
      )}
      {stale.length > 0 && (
        <p className="flex items-center gap-1 rounded-control bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          {staleTitle(stale)}
          <HelpTip label="Capturas antiguas">{staleMessage(stale, props.published.version, props.publishedDate)}</HelpTip>
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[200px_minmax(0,1fr)_320px]">
        <div className="min-w-0 md:col-span-2 xl:col-span-1 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-120px)] xl:self-start xl:overflow-y-auto">
          <SlideList studio={studio} previews={previews} />
        </div>
        <div className="min-w-0 md:sticky md:top-0 md:self-start">
          <CanvasView studio={studio} previews={previews} zoom={zoom} setZoom={setZoom} overview={overview} setOverview={setOverview} />
        </div>
        <Inspector studio={studio} upload={upload} ai={ai} onOpenTemplates={() => setTemplatesOpen(true)} />
      </div>
      <TemplateDialog studio={studio} previews={previews} open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </div>
  );
}

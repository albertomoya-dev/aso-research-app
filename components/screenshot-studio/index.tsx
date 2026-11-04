"use client";

import { AiCopyCard } from "./ai-copy-card";
import { BackgroundCard } from "./background-card";
import { DeviceCard } from "./device-card";
import { PreviewStrip } from "./preview-strip";
import { SaveCard } from "./save-card";
import { SlideEditor } from "./slide-editor";
import { staleMessage } from "./stale-message";
import { StyleCard } from "./style-card";
import { TemplatesCard } from "./templates-card";
import type { ScreenshotStudioProps } from "./types";
import { useAi } from "./use-ai";
import { useExport } from "./use-export";
import { usePreviews } from "./use-previews";
import { useStudio } from "./use-studio";
import { useUpload } from "./use-upload";

export type { ScreenshotStudioProps } from "./types";

export function ScreenshotStudio(props: ScreenshotStudioProps) {
  const studio = useStudio(props);
  const previews = usePreviews(studio);
  const upload = useUpload(studio);
  const ai = useAi(studio);
  const exporter = useExport(studio);
  const { slide, selected, stale } = studio;

  return (
    // Two columns from the top: the preview strip and the slide editor on the left, the settings on the
    // right. On wide screens the strip sticks to the top of its column, so the editor and the settings
    // scroll underneath it and every change stays visible.
    <div
      onDragOver={upload.onDragOver}
      onDragLeave={upload.onDragLeave}
      onDrop={upload.onDrop}
      className={`grid gap-6 rounded-xl lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] ${upload.dragging ? "outline-2 outline-offset-4 outline-brand outline-dashed" : ""}`}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:self-stretch">
        {upload.dragging && (
          <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand-strong">
            Suelta las capturas (o una carpeta): se colocan por orden de nombre desde la pantalla {selected + 1}.
          </p>
        )}
        {stale.length > 0 && (
          <p className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn-fg">{staleMessage(stale, props.published.version, props.publishedDate)}</p>
        )}
        <div className="lg:sticky lg:-top-7 lg:z-10 lg:-mt-7 lg:bg-panel lg:pt-7">
          <PreviewStrip studio={studio} previews={previews} exporter={exporter} />
        </div>
        {slide && <SlideEditor studio={studio} upload={upload} slide={slide} />}
      </div>

      <div className="flex flex-col gap-4">
        {props.aiEnabled && <AiCopyCard ai={ai} />}
        <TemplatesCard studio={studio} previews={previews} />
        <DeviceCard studio={studio} />
        <StyleCard studio={studio} />
        <BackgroundCard studio={studio} ai={ai} />
        <SaveCard studio={studio} exporter={exporter} />
      </div>
    </div>
  );
}

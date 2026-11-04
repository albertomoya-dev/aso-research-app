"use client";

import { useState } from "react";
import { assignImages, isImageFile, MAX_SLIDES, sortByName } from "@/lib/assets/bulk-upload";
import { type DroppedFile, filesFromDrop } from "@/lib/assets/drop-files";
import { shrinkImage } from "@/lib/assets/screenshot-render";
import { blankSlide } from "@/lib/assets/screenshots";
import type { Studio } from "./use-studio";

/** Uploading screenshots: the file picker and dropping files or a folder anywhere on the studio. */
export function useUpload(studio: Studio) {
  const { spec, setSpec, selected, slide, setStatus, props } = studio;
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  /**
   * Several screenshots at once (file picker, drop of files or of a folder): sorted by name and placed
   * on consecutive screens from the selected one, adding screens up to the maximum.
   */
  async function uploadMany(files: DroppedFile[]) {
    const images = sortByName(files.filter((f) => isImageFile(f.file)));
    if (images.length === 0) {
      if (files.length > 0) setStatus({ kind: "error", text: "No hay imágenes entre los archivos." });
      return;
    }
    setStatus(null);
    setUploading(true);
    try {
      const read = [];
      let failed = 0;
      for (const f of images.slice(0, MAX_SLIDES)) {
        try {
          read.push({
            image: await shrinkImage(f.file),
            capturedAt: f.file.lastModified ? new Date(f.file.lastModified).toISOString() : null,
            appVersion: props.published.version,
          });
        } catch {
          failed++;
        }
      }
      const start = Math.min(selected, spec.slides.length - 1);
      const layout = slide?.layout ?? "text-top";
      const result = assignImages(spec.slides, start, read, () => blankSlide(layout));
      setSpec((s) => ({ ...s, slides: result.slides }));
      const dropped = result.dropped + Math.max(0, images.length - MAX_SLIDES);
      const parts: string[] = [];
      if (result.placed) {
        const { from, to } = result.placed;
        parts.push(
          from === to
            ? `Captura colocada en la pantalla ${from + 1}.`
            : `${to - from + 1} capturas colocadas en las pantallas ${from + 1} a ${to + 1}, por orden de nombre.`,
        );
      }
      if (dropped > 0) parts.push(`${dropped} no ${dropped === 1 ? "cabe" : "caben"}: el máximo son ${MAX_SLIDES} pantallas.`);
      if (failed > 0) parts.push(`${failed} no se ${failed === 1 ? "pudo" : "pudieron"} leer.`);
      setStatus({ kind: result.placed ? "ok" : "error", text: parts.join(" ") });
    } finally {
      setUploading(false);
    }
  }

  function onDragOver(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  }
  async function onDrop(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    setDragging(false);
    await uploadMany(await filesFromDrop(e.dataTransfer));
  }

  /** onChange of a file input: every chosen file, then the input is cleared so the same files can be chosen again. */
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].map((file) => ({ file, name: file.name, path: file.name }));
    e.target.value = "";
    void uploadMany(files);
  }

  return { dragging, uploading, onDragOver, onDragLeave, onDrop, onPick };
}

export type Upload = ReturnType<typeof useUpload>;

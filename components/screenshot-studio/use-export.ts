"use client";

import { useState, useTransition } from "react";
import { saveDesign } from "@/app/asset-actions";
import { downloadBlob, slug } from "@/lib/assets/download";
import { renderSlidePng, screenSource } from "@/lib/assets/screenshot-render";
import { buildZip } from "@/lib/assets/zip";
import type { Studio } from "./use-studio";

/** Saving the design and downloading the PNGs (one screen, or all of them in a ZIP). */
export function useExport(studio: Studio) {
  const { spec, slide, selected, preset, font, imageFor, backgroundFor, setStatus, props } = studio;
  const [exporting, setExporting] = useState(false);
  const [saving, startSaving] = useTransition();

  function save() {
    setStatus(null);
    startSaving(async () => {
      const result = await saveDesign(props.appId, "screenshots", spec);
      setStatus(result?.error ? { kind: "error", text: result.error } : { kind: "ok", text: "Guardado." });
    });
  }

  async function exportOne() {
    if (!slide) return;
    setExporting(true);
    try {
      const img = await imageFor(slide.image).catch(() => null);
      const count = spec.slides.length;
      const nextSlide = spec.slides[(selected + 1) % count];
      const pair = spec.pair ? await imageFor(nextSlide?.image ?? null).catch(() => null) : null;
      const blob = await renderSlidePng(
        spec,
        slide,
        screenSource(img, slide.crop),
        { fontFamily: font, background: await backgroundFor() },
        { index: selected, count },
        screenSource(pair, nextSlide?.crop),
      );
      downloadBlob(`${slug(props.appTitle)}-${preset.id}-${selected + 1}.png`, blob);
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "No se pudo exportar." });
    } finally {
      setExporting(false);
    }
  }

  async function exportAll() {
    setExporting(true);
    try {
      const entries = [];
      const count = spec.slides.length;
      const background = await backgroundFor();
      for (const [i, sl] of spec.slides.entries()) {
        const img = await imageFor(sl.image).catch(() => null);
        const nextSlide = spec.slides[(i + 1) % count];
        const pair = spec.pair ? await imageFor(nextSlide?.image ?? null).catch(() => null) : null;
        const blob = await renderSlidePng(
          spec,
          sl,
          screenSource(img, sl.crop),
          { fontFamily: font, background },
          { index: i, count },
          screenSource(pair, nextSlide?.crop),
        );
        entries.push({
          name: `${String(i + 1).padStart(2, "0")}-${preset.id}.png`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }
      downloadBlob(`${slug(props.appTitle)}-${preset.id}.zip`, new Blob([buildZip(entries)], { type: "application/zip" }));
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "No se pudo exportar." });
    } finally {
      setExporting(false);
    }
  }

  return { exporting, saving, save, exportOne, exportAll };
}

export type Exporter = ReturnType<typeof useExport>;

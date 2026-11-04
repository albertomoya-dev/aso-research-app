"use client";

import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { MAX_SLIDES } from "@/lib/assets/bulk-upload";
import { cn } from "@/lib/cn";
import { stripMarks } from "@/lib/assets/screenshots";
import { Button } from "../ui/button";
import { PREVIEW_WIDTH } from "./types";
import type { Previews } from "./use-previews";
import type { Studio } from "./use-studio";

/** Data type of a screen being dragged inside the list (files dropped on the studio carry "Files"). */
const DRAG_TYPE = "application/x-rankeo-slide";

/**
 * The screens as thumbnails: vertical from `xl`, a horizontal row below. Reordered by dragging, with
 * the arrow buttons, or with Alt+↑/↓ on a thumbnail (↑/↓ alone select the previous or next one).
 */
export function SlideList({ studio, previews }: { studio: Studio; previews: Previews }) {
  const { spec, preset, selected, setSelected, addSlide, removeSlide, moveSlideTo } = studio;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const count = spec.slides.length;

  function focusThumb(i: number) {
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-slide-thumb="${i}"]`)?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
    const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
    if (!back && !forward) return;
    e.preventDefault();
    const to = Math.max(0, Math.min(count - 1, i + (back ? -1 : 1)));
    if (e.altKey) moveSlideTo(i, to);
    else setSelected(to);
    focusThumb(to);
  }

  return (
    <section aria-labelledby="slides-title" className="flex min-w-0 flex-col gap-2">
      <h2 id="slides-title" className="text-label font-medium text-ink-soft">
        Pantallas <span className="font-mono text-muted">{count}/{MAX_SLIDES}</span>
      </h2>
      <ol className="relative flex gap-3 overflow-x-auto pb-1 xl:flex-col xl:overflow-x-visible xl:pb-0" aria-describedby="slides-help">
        {spec.slides.map((sl, i) => (
          <li
            key={sl.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, String(i));
              e.dataTransfer.effectAllowed = "move";
              setDragFrom(i);
            }}
            onDragOver={(e) => {
              if (![...e.dataTransfer.types].includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropAt(i);
            }}
            onDragLeave={() => setDropAt((d) => (d === i ? null : d))}
            onDrop={(e) => {
              const from = Number(e.dataTransfer.getData(DRAG_TYPE));
              if (!e.dataTransfer.types.includes(DRAG_TYPE) || Number.isNaN(from)) return;
              e.preventDefault();
              moveSlideTo(from, i);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropAt(null);
            }}
            className={cn(
              "flex shrink-0 items-start gap-1.5 rounded-control p-1",
              dropAt === i && dragFrom !== i && "outline-2 outline-brand outline-dashed",
              dragFrom === i && "opacity-50",
            )}
          >
            <span className="flex flex-col items-center gap-1 pt-1">
              <span className="font-mono text-label text-muted">{i + 1}</span>
              <GripVertical size={14} aria-hidden="true" className="hidden cursor-grab text-muted xl:block" />
            </span>
            <button
              type="button"
              data-slide-thumb={i}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              aria-pressed={i === selected}
              aria-label={`Pantalla ${i + 1}`}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              title={sl.headline ? stripMarks(sl.headline) : "Sin texto"}
              className={cn(
                "block overflow-hidden rounded-control border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                i === selected ? "border-brand" : "border-line hover:border-line-strong",
              )}
            >
              <canvas
                ref={previews.slideRef("list", sl.id, PREVIEW_WIDTH)}
                style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
                className="block h-36 w-auto bg-surface-muted xl:h-auto xl:w-28"
              />
            </button>
            <span className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => moveSlideTo(i, i - 1)}
                disabled={i === 0}
                aria-label={`Subir la pantalla ${i + 1}`}
                title="Subir (Alt+↑)"
              >
                <ArrowUp size={16} aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => moveSlideTo(i, i + 1)}
                disabled={i === count - 1}
                aria-label={`Bajar la pantalla ${i + 1}`}
                title="Bajar (Alt+↓)"
              >
                <ArrowDown size={16} aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSlide(sl.id)}
                disabled={count <= 1}
                aria-label={`Quitar la pantalla ${i + 1}`}
                title="Quitar"
                className="text-muted hover:text-danger"
              >
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ol>
      <p id="slides-help" className="sr-only">
        Arrastra una pantalla para cambiar su orden, o usa Alt y las flechas sobre ella.
      </p>
      <Button variant="secondary" onClick={addSlide} disabled={count >= MAX_SLIDES} className="self-start xl:w-full">
        <Plus size={16} aria-hidden="true" />
        Añadir pantalla
      </Button>
    </section>
  );
}

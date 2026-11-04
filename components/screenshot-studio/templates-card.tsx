"use client";

import { TEMPLATES } from "@/lib/assets/screenshots";
import { Card } from "../ui";
import { THUMB_WIDTH } from "./types";
import type { Previews } from "./use-previews";
import type { Studio } from "./use-studio";

/** The template gallery: each one rendered with the first screen. */
export function TemplatesCard({ studio, previews }: { studio: Studio; previews: Previews }) {
  const { spec, preset, pickTemplate } = studio;
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[15px] font-semibold">Plantillas</h2>
      <p className="mt-1 text-xs text-muted">Aplica una composición completa: fondo, adorno, pose del móvil y texto. Después puedes afinar cada ajuste.</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {TEMPLATES.map((t) => {
          const active = spec.template === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => pickTemplate(t.id)}
                aria-pressed={active}
                title={t.description}
                className={`flex w-full flex-col items-center gap-1.5 rounded-lg border-2 p-1.5 text-xs ${active ? "border-brand text-ink" : "border-line text-ink-soft hover:border-line-strong"}`}
              >
                <canvas
                  ref={previews.thumbRef(t.id)}
                  style={{ width: THUMB_WIDTH, height: Math.round((THUMB_WIDTH * preset.height) / preset.width) }}
                  className="block max-w-full rounded-md bg-surface-muted"
                />
                <span className="truncate">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

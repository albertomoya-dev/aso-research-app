"use client";

import { Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { type BackgroundMode, backgroundMode } from "@/lib/assets/studio-edits";
import { inputClass } from "../ui";
import { Button } from "../ui/button";
import { HelpTip } from "../ui/help-tip";
import { ColorField, RangeField } from "./fields";
import type { Ai } from "./use-ai";
import type { Studio } from "./use-studio";

const MODES: [BackgroundMode, string][] = [
  ["solid", "Liso"],
  ["gradient", "Degradado"],
  ["ai", "IA"],
];

/** Fondo: one colour, a gradient or an AI backdrop (Claude's ideas, the image provider and the generated ones). */
export function BackgroundFields({ studio, ai }: { studio: Studio; ai: Ai }) {
  const { spec, updateTheme, setBackgroundMode } = studio;
  const current = backgroundMode(spec);
  // «IA» can be open before any backdrop exists; the other two follow the design.
  const [aiOpen, setAiOpen] = useState(current === "ai");
  const shown: BackgroundMode = current === "ai" || aiOpen ? "ai" : current;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Tipo de fondo" className="grid grid-cols-3 gap-1 rounded-control border border-line-strong bg-surface-muted p-0.5">
        {MODES.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={shown === mode}
            onClick={() => {
              setAiOpen(mode === "ai");
              if (mode !== "ai") setBackgroundMode(mode);
            }}
            className={cn(
              "min-h-11 rounded text-[13px] font-medium md:min-h-7",
              shown === mode ? "bg-surface text-ink" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {shown !== "ai" && (
        <div className="grid grid-cols-2 gap-3">
          <ColorField label={shown === "gradient" ? "Arriba" : "Color"} value={spec.theme.background} onChange={(v) => updateTheme({ background: v })} />
          {shown === "gradient" && (
            <ColorField label="Abajo" value={spec.theme.background2 ?? spec.theme.background} onChange={(v) => updateTheme({ background2: v })} />
          )}
        </div>
      )}
      {shown === "ai" && <AiBackground studio={studio} ai={ai} />}
    </div>
  );
}

function AiBackground({ studio, ai }: { studio: Studio; ai: Ai }) {
  const { spec, update, appPalette, usePalette, setUsePalette, props } = studio;
  const { providerLabel, aiEnabled } = props;
  return (
    <div className="flex flex-col gap-3">
      {providerLabel ? (
        <>
          <p className="flex items-center gap-1 text-xs text-muted">
            Lo dibuja {providerLabel}, para todas las pantallas.
            <HelpTip label="Fondo con IA">
              {providerLabel} dibuja un fondo vertical según la temática de la app; Claude puede proponer el prompt a partir de la ficha y las keywords.
              El fondo va debajo del adorno y del móvil.
            </HelpTip>
          </p>
          {appPalette.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={usePalette} onChange={(e) => setUsePalette(e.target.checked)} />
              Usar los colores de la app en el fondo
              <span className="flex gap-1" aria-hidden>
                {appPalette.map((c) => (
                  <span key={c} title={c} className="size-4 rounded-full border border-line-strong" style={{ background: c }} />
                ))}
              </span>
            </label>
          )}
          {aiEnabled && <BackgroundIdeas ai={ai} />}
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            Prompt
            <textarea
              value={ai.bgPrompt}
              onChange={(e) => ai.setBgPrompt(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="En inglés: colores, motivos, estilo… Sin texto ni móviles."
              className={`${inputClass} w-full py-2 text-xs font-normal`}
            />
          </label>
          <Button
            onClick={ai.generateBackground}
            disabled={ai.bgGenerating || ai.bgPrompt.trim().length < 10}
            aria-busy={ai.bgGenerating}
            className="w-full"
          >
            {ai.bgGenerating ? "Generando fondo…" : "Generar fondo"}
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted">
          Hace falta un proveedor de imágenes: añade <code className="font-mono">OPENAI_API_KEY</code> o <code className="font-mono">GEMINI_API_KEY</code>{" "}
          en Vercel.
        </p>
      )}
      {ai.backgrounds.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-soft">Fondos generados</span>
          <ul className="flex flex-wrap gap-2">
            {ai.backgrounds.map((b) => {
              const url = `/api/assets/generated/${b.id}`;
              const active = spec.backgroundImage === url;
              return (
                <li key={b.id} className="relative">
                  <button
                    type="button"
                    onClick={() => update({ backgroundImage: active ? null : url })}
                    aria-pressed={active}
                    aria-label={`Fondo: ${b.prompt.slice(0, 60)}`}
                    title={b.prompt}
                    className={cn("block overflow-hidden rounded-control border-2", active ? "border-brand" : "border-line hover:border-line-strong")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-24 w-auto bg-surface-muted object-cover" loading="lazy" />
                  </button>
                  <button
                    type="button"
                    onClick={() => ai.removeBackground(b.id)}
                    aria-label="Borrar este fondo"
                    className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface text-muted hover:text-danger"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {spec.backgroundImage && (
        <div className="flex flex-col gap-2">
          <RangeField
            label="Velo del color de fondo"
            value={Math.round(spec.backgroundDim * 100)}
            min={0}
            max={90}
            onChange={(v) => update({ backgroundDim: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Button variant="ghost" onClick={() => update({ backgroundImage: null })} className="self-start">
            Quitar el fondo
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Claude's backdrop ideas (H23): prompts, not templates. They live in their own group, each with its
 * «Prompt» label and why it fits, and picking one only fills the prompt; nothing changes until «Generar fondo».
 */
function BackgroundIdeas({ ai }: { ai: Ai }) {
  return (
    <section aria-labelledby="bg-ideas-title" className="flex flex-col gap-2 rounded-control border border-dashed border-line-strong p-3">
      <h4 id="bg-ideas-title" className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
        <Lightbulb size={16} aria-hidden="true" className="text-muted" />
        Ideas de fondo
      </h4>
      <input
        value={ai.bgFocus}
        onChange={(e) => ai.setBgFocus(e.target.value)}
        maxLength={200}
        aria-label="Enfoque de las ideas de fondo"
        placeholder="Enfoque (opcional): motivos, ambiente…"
        className={`${inputClass} w-full`}
      />
      <Button size="sm" onClick={ai.proposeBackgrounds} disabled={ai.bgWriting} aria-busy={ai.bgWriting} className="self-start">
        {ai.bgWriting ? "Proponiendo…" : "Proponer ideas con Claude"}
      </Button>
      {ai.bgPrompts.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {ai.bgPrompts.map((p) => {
            const chosen = ai.bgPrompt === p.prompt;
            return (
              <li key={p.name}>
                <button
                  type="button"
                  onClick={() => ai.setBgPrompt(p.prompt)}
                  aria-current={chosen ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-control border px-2.5 py-2 text-left",
                    chosen ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <span className="rounded-full bg-surface-muted px-1.5 py-px font-mono text-[11px] text-ink-soft">Prompt</span>
                    {p.name}
                  </span>
                  {p.rationale && <span className="text-xs text-ink-soft">{p.rationale}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

"use client";

import { LayoutTemplate, Palette } from "lucide-react";
import { DECOR_LABEL, DECORS, getTemplate, type ScreenshotSpec, THEME_PRESETS } from "@/lib/assets/screenshots";
import { inputClass } from "../ui";
import { Button } from "../ui/button";
import { ColorField, fieldLabel, RangeField } from "./fields";
import type { Studio } from "./use-studio";

const swatch = (bg: string, bg2: string | null) => (bg2 ? `linear-gradient(${bg}, ${bg2})` : bg);

/** Estilo: the template (picked in a dialog), colour combinations, the app's colours, the text colours and type. */
export function StyleFields({ studio, onOpenTemplates }: { studio: Studio; onOpenTemplates: () => void }) {
  const { spec, update, updateTheme, paletteTheme } = studio;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] text-ink-soft">
          Plantilla: <span className="font-medium text-ink">{getTemplate(spec.template).label}</span>
        </p>
        <Button size="sm" onClick={onOpenTemplates}>
          <LayoutTemplate size={16} aria-hidden="true" />
          Cambiar plantilla
        </Button>
      </div>
      {paletteTheme && (
        <Button
          onClick={() => updateTheme(paletteTheme)}
          title="Fondo, degradado, titular, subtítulo y acento a partir del icono y las capturas, con el titular siempre legible (contraste AA)"
          className="w-full justify-start"
        >
          <span aria-hidden="true" className="inline-block size-4 rounded-sm border border-line" style={{ background: swatch(paletteTheme.background, paletteTheme.background2) }} />
          <Palette size={16} aria-hidden="true" />
          Colores de la app
        </Button>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-soft">Combinaciones</span>
        <ul className="flex flex-wrap gap-1.5">
          {THEME_PRESETS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => updateTheme(t.theme)}
                className="flex min-h-11 items-center gap-1.5 rounded-control border border-line-strong px-2 text-xs text-ink-soft hover:border-muted md:min-h-7"
              >
                <span aria-hidden="true" className="inline-block size-4 rounded-sm border border-line" style={{ background: swatch(t.theme.background, t.theme.background2) }} />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Titular" value={spec.theme.text} onChange={(v) => updateTheme({ text: v })} />
        <ColorField label="Subtítulo" value={spec.theme.subtext} onChange={(v) => updateTheme({ subtext: v })} />
        <ColorField label="Acento (*resaltado*)" value={spec.theme.accent} onChange={(v) => updateTheme({ accent: v })} />
        <label className={fieldLabel}>
          Peso del titular
          <select
            value={spec.theme.weight}
            onChange={(e) => updateTheme({ weight: Number(e.target.value) as 600 | 700 | 800 })}
            className={`${inputClass} w-full min-w-0`}
          >
            <option value={600}>Semibold</option>
            <option value={700}>Bold</option>
            <option value={800}>Extra bold</option>
          </select>
        </label>
        <label className={fieldLabel}>
          Alineación
          <select value={spec.theme.align} onChange={(e) => updateTheme({ align: e.target.value as "center" | "left" })} className={`${inputClass} w-full min-w-0`}>
            <option value="center">Centrado</option>
            <option value="left">Izquierda</option>
          </select>
        </label>
        <label className={fieldLabel}>
          Adorno
          <select value={spec.decor} onChange={(e) => update({ decor: e.target.value as ScreenshotSpec["decor"] })} className={`${inputClass} w-full min-w-0`}>
            {DECORS.map((d) => (
              <option key={d} value={d}>
                {DECOR_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <RangeField
        label="Tamaño del texto"
        value={Math.round(spec.textScale * 100)}
        min={70}
        max={150}
        onChange={(v) => update({ textScale: v / 100 })}
        format={(v) => `${v}%`}
      />
    </div>
  );
}

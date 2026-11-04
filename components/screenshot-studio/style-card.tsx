"use client";

import { DECOR_LABEL, DECORS, type ScreenshotSpec, THEME_PRESETS } from "@/lib/assets/screenshots";
import { Card, inputClass } from "../ui";
import { ColorField, fieldLabel, RangeField } from "./fields";
import type { Studio } from "./use-studio";

/** Colour presets (and the app's own colours), the five colours, weight, alignment, decor and text size. */
export function StyleCard({ studio }: { studio: Studio }) {
  const { spec, update, updateTheme, paletteTheme } = studio;
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[15px] font-semibold">Estilo</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {THEME_PRESETS.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => updateTheme(t.theme)}
              className="flex items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-xs text-ink-soft hover:border-muted"
            >
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-sm border border-line"
                style={{
                  background: t.theme.background2 ? `linear-gradient(${t.theme.background}, ${t.theme.background2})` : t.theme.background,
                }}
              />
              {t.label}
            </button>
          </li>
        ))}
        {paletteTheme && (
          <li>
            <button
              type="button"
              onClick={() => updateTheme(paletteTheme)}
              title="Fondo, degradado, titular, subtítulo y acento a partir del icono y las capturas, con el titular siempre legible (contraste AA)"
              className="flex items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-xs text-ink-soft hover:border-muted"
            >
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-sm border border-line"
                style={{ background: `linear-gradient(${paletteTheme.background}, ${paletteTheme.background2})` }}
              />
              Colores de la app
            </button>
          </li>
        )}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <ColorField label="Fondo" value={spec.theme.background} onChange={(v) => updateTheme({ background: v })} />
        <ColorField
          label="Fondo (degradado)"
          value={spec.theme.background2 ?? spec.theme.background}
          onChange={(v) => updateTheme({ background2: v })}
          onClear={spec.theme.background2 ? () => updateTheme({ background2: null }) : undefined}
        />
        <ColorField label="Titular" value={spec.theme.text} onChange={(v) => updateTheme({ text: v })} />
        <ColorField label="Subtítulo" value={spec.theme.subtext} onChange={(v) => updateTheme({ subtext: v })} />
        <ColorField label="Acento (*resaltado*)" value={spec.theme.accent} onChange={(v) => updateTheme({ accent: v })} />
        <label className={fieldLabel}>
          Peso del titular
          <select
            value={spec.theme.weight}
            onChange={(e) => updateTheme({ weight: Number(e.target.value) as 600 | 700 | 800 })}
            className={inputClass}
          >
            <option value={600}>Semibold</option>
            <option value={700}>Bold</option>
            <option value={800}>Extra bold</option>
          </select>
        </label>
        <label className={fieldLabel}>
          Alineación
          <select value={spec.theme.align} onChange={(e) => updateTheme({ align: e.target.value as "center" | "left" })} className={inputClass}>
            <option value="center">Centrado</option>
            <option value="left">Izquierda</option>
          </select>
        </label>
        <label className={fieldLabel}>
          Adorno de fondo
          <select value={spec.decor} onChange={(e) => update({ decor: e.target.value as ScreenshotSpec["decor"] })} className={inputClass}>
            {DECORS.map((d) => (
              <option key={d} value={d}>
                {DECOR_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <RangeField
          label="Tamaño del texto"
          value={Math.round(spec.textScale * 100)}
          min={70}
          max={150}
          onChange={(v) => update({ textScale: v / 100 })}
          format={(v) => `${v}%`}
        />
      </div>
    </Card>
  );
}

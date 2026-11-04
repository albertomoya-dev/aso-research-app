"use client";

import { inputClass } from "../ui";
import { CheckField, fieldLabel, RangeField } from "./fields";
import type { Studio } from "./use-studio";

const pct = (v: number) => `${v}%`;

/** Dispositivo: scale, frame, tilt, offsets, alternating side and the paired screen (the store size is in the top bar). */
export function DeviceFields({ studio }: { studio: Studio }) {
  const { spec, update, updateTheme } = studio;
  return (
    <div className="flex flex-col gap-3">
      <RangeField
        label="Tamaño del móvil"
        value={Math.round(spec.deviceScale * 100)}
        min={50}
        max={100}
        onChange={(v) => update({ deviceScale: v / 100 })}
        format={pct}
      />
      <CheckField label="Mostrar el marco del dispositivo" checked={spec.showFrame} onChange={(v) => update({ showFrame: v })} />
      {spec.showFrame && (
        <label className={fieldLabel}>
          Color del marco
          <select value={spec.theme.frame} onChange={(e) => updateTheme({ frame: e.target.value as "dark" | "light" })} className={`${inputClass} w-full min-w-0`}>
            <option value="dark">Oscuro</option>
            <option value="light">Claro</option>
          </select>
        </label>
      )}
      <RangeField label="Inclinación" value={spec.deviceRotate} min={-25} max={25} onChange={(v) => update({ deviceRotate: v })} format={(v) => `${v}°`} />
      <RangeField
        label="Desplazamiento horizontal"
        value={Math.round(spec.deviceOffsetX * 100)}
        min={-50}
        max={50}
        onChange={(v) => update({ deviceOffsetX: v / 100 })}
        format={pct}
      />
      <RangeField
        label="Desplazamiento vertical"
        value={Math.round(spec.deviceOffsetY * 100)}
        min={-50}
        max={50}
        onChange={(v) => update({ deviceOffsetY: v / 100 })}
        format={pct}
      />
      <CheckField label="Alternar el lado en cada pantalla" checked={spec.alternate} onChange={(v) => update({ alternate: v })} />
      <CheckField label="Mostrar la siguiente pantalla detrás" checked={spec.pair} onChange={(v) => update({ pair: v })} />
    </div>
  );
}

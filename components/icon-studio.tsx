"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { generateIconConcepts, type IconConceptResult, saveDesign } from "@/app/asset-actions";
import { downloadBlob, slug } from "@/lib/assets/download";
import { checkIcon, ICON_EXPORTS, type IconSpec, type SymbolName, SYMBOL_NAMES, SYMBOLS } from "@/lib/assets/icon";
import { drawIcon, renderIconPng } from "@/lib/assets/icon-render";
import { pageFontFamily, ensureFonts } from "@/lib/assets/screenshot-render";
import { buttonPrimary, buttonSecondary, Card, inputClass } from "./ui";

type Props = { appId: number; appTitle: string; initial: IconSpec; currentIcon: string; aiEnabled: boolean; savedAt: string | null };

type Concept = { name: string; rationale: string; spec: IconSpec };

export function IconStudio({ appId, appTitle, initial, currentIcon, aiEnabled, savedAt }: Props) {
  const [spec, setSpec] = useState<IconSpec>(initial);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [focus, setFocus] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [saving, startSaving] = useTransition();
  const [thinking, startThinking] = useTransition();
  const font = useMemo(() => pageFontFamily(), []);
  const notes = checkIcon(spec);

  const update = (patch: Partial<IconSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const updateBg = (patch: Partial<IconSpec["background"]>) => setSpec((s) => ({ ...s, background: { ...s.background, ...patch } }));
  const updatePlate = (patch: Partial<IconSpec["plate"]>) => setSpec((s) => ({ ...s, plate: { ...s.plate, ...patch } }));

  function save() {
    setStatus(null);
    startSaving(async () => {
      const result = await saveDesign(appId, "icon", spec);
      setStatus(result?.error ? { kind: "error", text: result.error } : { kind: "ok", text: "Guardado." });
    });
  }

  function propose() {
    setStatus(null);
    startThinking(async () => {
      const result: IconConceptResult = await generateIconConcepts(appId, focus);
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setConcepts(result.concepts);
      setStatus({ kind: "ok", text: `${result.concepts.length} conceptos de ${result.model}.` });
    });
  }

  async function exportPng(size: number, store: "ios" | "android") {
    try {
      downloadBlob(`${slug(appTitle)}-icon-${store}-${size}.png`, await renderIconPng(spec, size, font));
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "No se pudo exportar." });
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Vista previa</h2>
              <p className="mt-0.5 text-xs text-muted">Como se verá en cada tienda y a los tamaños pequeños de los resultados de búsqueda.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ICON_EXPORTS.map((e) => (
                <button key={e.id} type="button" onClick={() => exportPng(e.size, e.store)} className={buttonSecondary} title={e.label}>
                  PNG {e.size}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-8">
            <figure className="flex flex-col items-center gap-2">
              <IconCanvas spec={spec} size={180} font={font} shape="ios" />
              <figcaption className="text-xs text-muted">App Store</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-2">
              <IconCanvas spec={spec} size={180} font={font} shape="android" />
              <figcaption className="text-xs text-muted">Google Play</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-2">
              <div className="flex items-end gap-3">
                <IconCanvas spec={spec} size={64} font={font} shape="ios" />
                <IconCanvas spec={spec} size={40} font={font} shape="ios" />
                <IconCanvas spec={spec} size={29} font={font} shape="ios" />
              </div>
              <figcaption className="text-xs text-muted">Búsqueda, lista y ajustes</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentIcon} alt="" width={64} height={64} className="bg-surface-muted" style={{ borderRadius: 64 * 0.23 }} />
              <figcaption className="text-xs text-muted">Icono actual</figcaption>
            </figure>
          </div>
          {notes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-xs text-warn-fg">
              {notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          )}
        </Card>

        {aiEnabled && (
          <Card className="px-5 py-5">
            <h2 className="text-[15px] font-semibold">Conceptos con IA</h2>
            <p className="mt-1 text-xs text-muted">
              Claude propone cuatro direcciones (paleta, letra o símbolo) a partir de la ficha, la categoría y tus keywords. Elige una y ajústala a la derecha.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                maxLength={200}
                placeholder="Enfoque (opcional): colores de marca, estilo…"
                className={`${inputClass} min-w-0 flex-[1_1_240px]`}
              />
              <button type="button" onClick={propose} disabled={thinking} aria-busy={thinking} className={buttonPrimary}>
                {thinking ? "Pensando…" : "Proponer conceptos"}
              </button>
            </div>
            {concepts.length > 0 && (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {concepts.map((c) => (
                  <li key={c.name} className="flex gap-3 rounded-lg border border-line bg-surface-muted p-3">
                    <IconCanvas spec={c.spec} size={72} font={font} shape="ios" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{c.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{c.rationale}</p>
                      <button type="button" onClick={() => setSpec(c.spec)} className="mt-2 text-xs text-link hover:underline">
                        Usar este concepto
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Fondo</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Tipo
              <select value={spec.background.kind} onChange={(e) => updateBg({ kind: e.target.value as IconSpec["background"]["kind"] })} className={inputClass}>
                <option value="solid">Color liso</option>
                <option value="linear">Degradado lineal</option>
                <option value="radial">Degradado radial</option>
              </select>
            </label>
            <ColorField label="Color" value={spec.background.from} onChange={(v) => updateBg({ from: v })} />
            {spec.background.kind !== "solid" && <ColorField label="Segundo color" value={spec.background.to} onChange={(v) => updateBg({ to: v })} />}
            {spec.background.kind === "linear" && (
              <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                <span className="flex justify-between">
                  Ángulo <span className="font-mono text-xs text-muted">{spec.background.angle}°</span>
                </span>
                <input type="range" min={0} max={360} value={spec.background.angle} onChange={(e) => updateBg({ angle: Number(e.target.value) })} />
              </label>
            )}
            <label className="col-span-2 flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={spec.gloss} onChange={(e) => update({ gloss: e.target.checked })} />
              Brillo suave arriba
            </label>
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Símbolo</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Tipo
              <select
                value={spec.glyph.kind}
                onChange={(e) =>
                  update({
                    glyph:
                      e.target.value === "letter"
                        ? { kind: "letter", text: spec.glyph.kind === "letter" ? spec.glyph.text : appTitle.slice(0, 1).toUpperCase(), weight: 800 }
                        : { kind: "symbol", name: "star" },
                  })
                }
                className={inputClass}
              >
                <option value="letter">Letra</option>
                <option value="symbol">Símbolo</option>
              </select>
            </label>
            {spec.glyph.kind === "letter" ? (
              <>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                  Letras
                  <input
                    value={spec.glyph.text}
                    maxLength={3}
                    onChange={(e) => update({ glyph: { kind: "letter", text: e.target.value || "A", weight: spec.glyph.kind === "letter" ? spec.glyph.weight : 800 } })}
                    className={`${inputClass} font-normal`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                  Peso
                  <select
                    value={spec.glyph.weight}
                    onChange={(e) => update({ glyph: { kind: "letter", text: spec.glyph.kind === "letter" ? spec.glyph.text : "A", weight: Number(e.target.value) as 600 | 700 | 800 } })}
                    className={inputClass}
                  >
                    <option value={600}>Semibold</option>
                    <option value={700}>Bold</option>
                    <option value={800}>Extra bold</option>
                  </select>
                </label>
              </>
            ) : (
              <ul className="col-span-2 grid grid-cols-6 gap-1.5">
                {SYMBOL_NAMES.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => update({ glyph: { kind: "symbol", name } })}
                      aria-label={name}
                      aria-pressed={spec.glyph.kind === "symbol" && spec.glyph.name === name}
                      className={`flex aspect-square w-full items-center justify-center rounded-md border ${
                        spec.glyph.kind === "symbol" && spec.glyph.name === name ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-soft hover:border-line-strong"
                      }`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true">
                        <path d={SYMBOLS[name as SymbolName]} />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <ColorField label="Color" value={spec.glyphColor} onChange={(v) => update({ glyphColor: v })} />
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              <span className="flex justify-between">
                Tamaño <span className="font-mono text-xs text-muted">{Math.round(spec.glyphScale * 100)}%</span>
              </span>
              <input type="range" min={30} max={90} value={Math.round(spec.glyphScale * 100)} onChange={(e) => update({ glyphScale: Number(e.target.value) / 100 })} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={spec.shadow} onChange={(e) => update({ shadow: e.target.checked })} />
              Sombra bajo el símbolo
            </label>
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Placa</h2>
          <p className="mt-1 text-xs text-muted">Una forma detrás del símbolo para darle contraste.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Forma
              <select value={spec.plate.kind} onChange={(e) => updatePlate({ kind: e.target.value as IconSpec["plate"]["kind"] })} className={inputClass}>
                <option value="none">Ninguna</option>
                <option value="circle">Círculo</option>
                <option value="rounded">Cuadrado redondeado</option>
              </select>
            </label>
            {spec.plate.kind !== "none" && (
              <>
                <ColorField label="Color" value={spec.plate.color} onChange={(v) => updatePlate({ color: v })} />
                <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                  <span className="flex justify-between">
                    Tamaño <span className="font-mono text-xs text-muted">{Math.round(spec.plate.scale * 100)}%</span>
                  </span>
                  <input type="range" min={40} max={95} value={Math.round(spec.plate.scale * 100)} onChange={(e) => updatePlate({ scale: Number(e.target.value) / 100 })} />
                </label>
              </>
            )}
          </div>
        </Card>

        <Card className="px-5 py-4">
          <button type="button" onClick={save} disabled={saving} className={`${buttonPrimary} w-full`}>
            {saving ? "Guardando…" : "Guardar diseño"}
          </button>
          <p aria-live="polite" className="mt-2 text-xs">
            {status ? (
              <span className={status.kind === "error" ? "text-danger" : "text-ink-soft"}>{status.text}</span>
            ) : savedAt ? (
              <span className="text-muted">Guardado por última vez el {new Date(savedAt).toLocaleString("es-ES")}.</span>
            ) : (
              <span className="text-muted">Aún no guardado.</span>
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}

/** A live canvas of the icon, masked like the store shows it. */
function IconCanvas({ spec, size, font, shape }: { spec: IconSpec; size: number; font: string; shape: "ios" | "android" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts(font, [600, 700, 800]);
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawIcon(ctx, spec, size, font);
    })();
    return () => {
      cancelled = true;
    };
  }, [spec, size, font]);
  return <canvas ref={ref} style={{ width: size, height: size, borderRadius: shape === "ios" ? size * 0.225 : size / 2 }} className="block bg-surface-muted" />;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
      {label}
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface p-0.5" />
        <span className="font-mono text-xs text-muted">{value}</span>
      </span>
    </label>
  );
}

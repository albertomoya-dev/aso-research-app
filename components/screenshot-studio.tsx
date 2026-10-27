"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { type BackgroundImageResult, type CopyResult, deleteGeneratedImage, generateBackgroundImage, generateBackgroundPrompts, generateScreenshotCopy, type LogoPromptResult, saveDesign } from "@/app/asset-actions";
import { downloadBlob, slug } from "@/lib/assets/download";
import { drawSlide, ensureFonts, loadImage, pageFontFamily, renderSlidePng, shrinkImage } from "@/lib/assets/screenshot-render";
import {
  applyTemplate,
  DECOR_LABEL,
  DECORS,
  getPreset,
  HEADLINE_SOFT_LIMIT,
  MAX_SPEC_BYTES,
  presetsFor,
  type ScreenshotSpec,
  type Slide,
  slideId,
  specBytes,
  stripMarks,
  SUBHEADLINE_SOFT_LIMIT,
  TEMPLATES,
  THEME_PRESETS,
} from "@/lib/assets/screenshots";
import { buildZip } from "@/lib/assets/zip";
import type { Store } from "@/lib/stores/types";
import { buttonPrimary, buttonSecondary, Card, inputClass } from "./ui";

type Props = {
  appId: number;
  appTitle: string;
  store: Store;
  initial: ScreenshotSpec;
  /** Screenshots published in the store, as proxied URLs. */
  storeImages: string[];
  aiEnabled: boolean;
  /** Name of the configured image provider, or null when none is set up. */
  providerLabel: string | null;
  /** Backdrops already generated for this app. */
  backgrounds: { id: number; prompt: string }[];
  savedAt: string | null;
};

const PREVIEW_WIDTH = 230;
const THUMB_WIDTH = 96;

export function ScreenshotStudio({ appId, appTitle, store, initial, storeImages, aiEnabled, providerLabel, backgrounds: initialBackgrounds, savedAt }: Props) {
  const [spec, setSpec] = useState<ScreenshotSpec>(initial);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();
  const [writing, startWriting] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [backgrounds, setBackgrounds] = useState(initialBackgrounds);
  const [bgFocus, setBgFocus] = useState("");
  const [bgPrompts, setBgPrompts] = useState<{ name: string; prompt: string; rationale: string }[]>([]);
  const [bgPrompt, setBgPrompt] = useState("");
  const [bgWriting, startBgWriting] = useTransition();
  const [bgGenerating, startBgGenerating] = useTransition();
  const images = useRef(new Map<string, HTMLImageElement>());
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const thumbs = useRef(new Map<string, HTMLCanvasElement>());
  const font = useMemo(() => pageFontFamily(), []);
  const preset = getPreset(spec.device);
  const slide = spec.slides[Math.min(selected, spec.slides.length - 1)];
  const bytes = specBytes(spec);

  const update = (patch: Partial<ScreenshotSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const updateSlide = (id: string, patch: Partial<Slide>) =>
    setSpec((s) => ({ ...s, slides: s.slides.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)) }));
  const updateTheme = (patch: Partial<ScreenshotSpec["theme"]>) => setSpec((s) => ({ ...s, theme: { ...s.theme, ...patch } }));

  const imageFor = useCallback(async (src: string | null) => {
    if (!src) return null;
    const cached = images.current.get(src);
    if (cached) return cached;
    const img = await loadImage(src);
    images.current.set(src, img);
    return img;
  }, []);

  const backgroundFor = useCallback(async () => (spec.backgroundImage ? imageFor(spec.backgroundImage).catch(() => null) : null), [spec.backgroundImage, imageFor]);

  // Redraw every preview a moment after the spec changes.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      await ensureFonts(font, [500, spec.theme.weight]);
      const count = spec.slides.length;
      const background = await backgroundFor();
      for (const [index, sl] of spec.slides.entries()) {
        const canvas = canvases.current.get(sl.id);
        if (!canvas) continue;
        const img = await imageFor(sl.image).catch(() => null);
        const pair = spec.pair ? await imageFor(spec.slides[(index + 1) % count]?.image ?? null).catch(() => null) : null;
        if (cancelled) return;
        const scale = PREVIEW_WIDTH / preset.width;
        canvas.width = Math.round(preset.width * scale);
        canvas.height = Math.round(preset.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawSlide(ctx, spec, sl, img, { fontFamily: font, background }, undefined, undefined, { index, count }, pair);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [spec, preset, font, imageFor, backgroundFor]);

  // Thumbnails of the gallery: the first slide rendered with each template.
  const first = spec.slides[0];
  const firstImage = first?.image ?? null;
  const secondImage = spec.slides[1]?.image ?? null;
  const firstHeadline = first?.headline ?? "";
  const firstSub = first?.subheadline ?? "";
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      await ensureFonts(font, [500, 600, 700, 800]);
      const img = await imageFor(firstImage).catch(() => null);
      const pair = await imageFor(secondImage ?? firstImage).catch(() => null);
      const background = await backgroundFor();
      if (cancelled) return;
      for (const t of TEMPLATES) {
        const canvas = thumbs.current.get(t.id);
        if (!canvas) continue;
        const base: ScreenshotSpec = {
          ...spec,
          slides: [{ id: "thumb", headline: firstHeadline || "Tu *titular* aquí", subheadline: firstSub, image: firstImage, layout: "text-top", keyword: null, asIs: false }],
        };
        const tspec = applyTemplate(base, t);
        const scale = THUMB_WIDTH / preset.width;
        canvas.width = Math.round(preset.width * scale);
        canvas.height = Math.round(preset.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawSlide(ctx, tspec, tspec.slides[0], img, { fontFamily: font, background }, undefined, undefined, { index: 0, count: 2 }, tspec.pair ? pair : null);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only the inputs that change the thumbnails, not every keystroke on other slides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, font, imageFor, backgroundFor, firstImage, secondImage, firstHeadline, firstSub, spec.device]);

  function pickTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSpec((s) => applyTemplate(s, t));
  }

  function addSlide() {
    const next: Slide = { id: slideId(), headline: "", subheadline: "", image: null, layout: slide?.layout ?? "text-top", keyword: null, asIs: false };
    setSpec((s) => ({ ...s, slides: [...s.slides, next] }));
    setSelected(spec.slides.length);
  }
  function removeSlide(id: string) {
    if (spec.slides.length <= 1) return;
    setSpec((s) => ({ ...s, slides: s.slides.filter((sl) => sl.id !== id) }));
    setSelected((i) => Math.max(0, i - 1));
  }
  function moveSlide(id: string, dir: -1 | 1) {
    setSpec((s) => {
      const i = s.slides.findIndex((sl) => sl.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.slides.length) return s;
      const slides = [...s.slides];
      [slides[i], slides[j]] = [slides[j], slides[i]];
      setSelected(j);
      return { ...s, slides };
    });
  }

  async function upload(file: File | undefined) {
    if (!file || !slide) return;
    try {
      const data = await shrinkImage(file);
      updateSlide(slide.id, { image: data });
    } catch {
      setStatus({ kind: "error", text: "No se pudo leer la imagen." });
    }
  }

  function save() {
    setStatus(null);
    startSaving(async () => {
      const result = await saveDesign(appId, "screenshots", spec);
      setStatus(result?.error ? { kind: "error", text: result.error } : { kind: "ok", text: "Guardado." });
    });
  }

  function writeCopy() {
    setStatus(null);
    startWriting(async () => {
      const result: CopyResult = await generateScreenshotCopy(
        appId,
        spec.slides.map((s) => ({ headline: s.headline, subheadline: s.subheadline })),
        focus,
      );
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setSpec((s) => ({
        ...s,
        slides: s.slides.map((sl, i) => {
          const c = result.slides[i];
          return c ? { ...sl, headline: c.headline, subheadline: c.subheadline, keyword: c.keyword || null } : sl;
        }),
      }));
      setNotes(result.notes);
      setStatus({ kind: "ok", text: `Textos redactados por ${result.model}.` });
    });
  }

  function proposeBackgrounds() {
    setStatus(null);
    startBgWriting(async () => {
      const t = spec.theme;
      const dark = parseInt(t.background.slice(1, 3), 16) * 0.299 + parseInt(t.background.slice(3, 5), 16) * 0.587 + parseInt(t.background.slice(5, 7), 16) * 0.114 < 128;
      const result: LogoPromptResult = await generateBackgroundPrompts(appId, bgFocus, { dark, background: t.background, accent: t.accent });
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setBgPrompts(result.prompts);
      setBgPrompt(result.prompts[0]?.prompt ?? "");
    });
  }

  function generateBackground() {
    setStatus(null);
    startBgGenerating(async () => {
      const result: BackgroundImageResult = await generateBackgroundImage(appId, bgPrompt);
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setBackgrounds((b) => [{ id: result.id, prompt: bgPrompt }, ...b]);
      update({ backgroundImage: result.url });
      setStatus({ kind: "ok", text: `Fondo generado con ${result.provider} (${result.model}).` });
    });
  }

  async function removeBackground(id: number) {
    const url = `/api/assets/generated/${id}`;
    setBackgrounds((b) => b.filter((x) => x.id !== id));
    if (spec.backgroundImage === url) update({ backgroundImage: null });
    await deleteGeneratedImage(appId, id);
  }

  async function exportOne() {
    if (!slide) return;
    setExporting(true);
    try {
      const img = await imageFor(slide.image).catch(() => null);
      const count = spec.slides.length;
      const pair = spec.pair ? await imageFor(spec.slides[(selected + 1) % count]?.image ?? null).catch(() => null) : null;
      const blob = await renderSlidePng(spec, slide, img, { fontFamily: font, background: await backgroundFor() }, { index: selected, count }, pair);
      downloadBlob(`${slug(appTitle)}-${preset.id}-${selected + 1}.png`, blob);
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
        const pair = spec.pair ? await imageFor(spec.slides[(i + 1) % count]?.image ?? null).catch(() => null) : null;
        const blob = await renderSlidePng(spec, sl, img, { fontFamily: font, background }, { index: i, count }, pair);
        entries.push({ name: `${String(i + 1).padStart(2, "0")}-${preset.id}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      downloadBlob(`${slug(appTitle)}-${preset.id}.zip`, new Blob([buildZip(entries)], { type: "application/zip" }));
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "No se pudo exportar." });
    } finally {
      setExporting(false);
    }
  }

  const headLen = slide ? stripMarks(slide.headline).length : 0;
  const previewHeight = Math.round((PREVIEW_WIDTH * preset.height) / preset.width);

  return (
    // On wide screens the studio fills the page height: the preview strip stays put while the slide
    // editor and the settings column scroll on their own, so every change is visible as it happens.
    <div className="grid items-start gap-6 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
      <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
        <Card className="shrink-0 px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Vista previa</h2>
              <p className="mt-0.5 text-xs text-muted">
                {preset.label} · {preset.width}×{preset.height} px · {spec.slides.length} {spec.slides.length === 1 ? "pantalla" : "pantallas"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportOne} disabled={exporting} className={buttonSecondary}>
                Descargar PNG
              </button>
              <button type="button" onClick={exportAll} disabled={exporting} className={buttonSecondary}>
                {exporting ? "Exportando…" : "Descargar todo (ZIP)"}
              </button>
            </div>
          </div>
          <div className="-mx-5 mt-4 overflow-x-auto px-5 pb-2">
            <ul className="flex min-w-max gap-3">
              {spec.slides.map((sl, i) => (
                <li key={sl.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={i === selected}
                    aria-label={`Pantalla ${i + 1}`}
                    className={`block overflow-hidden rounded-lg border-2 ${i === selected ? "border-brand" : "border-line hover:border-line-strong"}`}
                  >
                    <canvas
                      ref={(el) => {
                        if (el) canvases.current.set(sl.id, el);
                        else canvases.current.delete(sl.id);
                      }}
                      style={{ height: `min(${previewHeight}px, 42vh)`, aspectRatio: `${preset.width} / ${preset.height}` }}
                      className="block w-auto bg-surface-muted"
                    />
                  </button>
                  <p className="mt-1.5 text-center font-mono text-xs text-muted">
                    {i + 1}
                    {sl.keyword ? ` · ${sl.keyword}` : ""}
                  </p>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={addSlide}
                  disabled={spec.slides.length >= 10}
                  className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-line-strong px-6 text-[13px] text-muted hover:border-muted hover:text-ink disabled:opacity-50"
                  style={{ height: `min(${previewHeight + 4}px, calc(42vh + 4px))`, width: PREVIEW_WIDTH * 0.8 }}
                >
                  + Añadir pantalla
                </button>
              </li>
            </ul>
          </div>
        </Card>

        {slide && (
          <Card className="px-5 py-5 lg:min-h-0 lg:overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Pantalla {selected + 1}</h2>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => moveSlide(slide.id, -1)} disabled={selected === 0} className={buttonSecondary} aria-label="Mover a la izquierda">
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => moveSlide(slide.id, 1)}
                  disabled={selected === spec.slides.length - 1}
                  className={buttonSecondary}
                  aria-label="Mover a la derecha"
                >
                  →
                </button>
                <button type="button" onClick={() => removeSlide(slide.id)} disabled={spec.slides.length <= 1} className={buttonSecondary}>
                  Quitar
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft md:col-span-2">
                <span className="flex justify-between">
                  Titular
                  <span className={`font-mono text-xs ${headLen > HEADLINE_SOFT_LIMIT ? "text-warn-fg" : "text-muted"}`}>
                    {headLen}/{HEADLINE_SOFT_LIMIT}
                  </span>
                </span>
                <textarea
                  value={slide.headline}
                  onChange={(e) => updateSlide(slide.id, { headline: e.target.value })}
                  rows={2}
                  className={`${inputClass} py-2 font-normal`}
                  placeholder="Corre *sin excusas*"
                />
                <span className="text-xs font-normal text-muted">Pon *asteriscos* alrededor de la palabra que quieras resaltar con el color de acento.</span>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft md:col-span-2">
                <span className="flex justify-between">
                  Subtítulo
                  <span className={`font-mono text-xs ${slide.subheadline.length > SUBHEADLINE_SOFT_LIMIT ? "text-warn-fg" : "text-muted"}`}>
                    {slide.subheadline.length}/{SUBHEADLINE_SOFT_LIMIT}
                  </span>
                </span>
                <input
                  value={slide.subheadline}
                  onChange={(e) => updateSlide(slide.id, { subheadline: e.target.value })}
                  className={`${inputClass} font-normal`}
                  placeholder="Planes de entrenamiento con GPS y métricas en tiempo real"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                Texto
                <select value={slide.layout} onChange={(e) => updateSlide(slide.id, { layout: e.target.value as Slide["layout"] })} className={inputClass}>
                  <option value="text-top">Arriba, móvil abajo</option>
                  <option value="text-bottom">Abajo, móvil arriba</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                Keyword de esta pantalla
                <input
                  value={slide.keyword ?? ""}
                  onChange={(e) => updateSlide(slide.id, { keyword: e.target.value || null })}
                  className={`${inputClass} font-normal`}
                  placeholder="Solo como recordatorio"
                />
              </label>
              <div className="flex flex-col gap-2 md:col-span-2">
                <span className="text-[13px] font-medium text-ink-soft">Captura de pantalla</span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className={`${buttonSecondary} cursor-pointer`}>
                    Subir imagen
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
                  </label>
                  {slide.image && (
                    <button type="button" onClick={() => updateSlide(slide.id, { image: null })} className={buttonSecondary}>
                      Quitar imagen
                    </button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-[13px] font-normal text-ink-soft">
                  <input type="checkbox" checked={slide.asIs} onChange={(e) => updateSlide(slide.id, { asIs: e.target.checked })} />
                  La imagen ya es un montaje terminado: usarla tal cual, sin marco, texto ni fondo
                </label>
                {slide.image && storeImages.includes(slide.image) && !slide.asIs && (
                  <p className="text-xs text-warn-fg">
                    Esta captura viene de la tienda y suele llevar ya su propio texto y su propio móvil, así que dentro del marco se verá un móvil sobre otro. Para
                    las plantillas, sube una captura en bruto de la app, o marca la casilla de arriba para usarla tal cual.
                  </p>
                )}
                {storeImages.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-muted">O usa una de las capturas publicadas en la tienda (montajes ya terminados, mejor tal cual):</p>
                    <ul className="flex flex-wrap gap-2">
                      {storeImages.map((src, i) => (
                        <li key={src}>
                          <button
                            type="button"
                            onClick={() => updateSlide(slide.id, { image: src })}
                            aria-label={`Captura ${i + 1} de la tienda`}
                            className={`block overflow-hidden rounded-md border-2 ${slide.image === src ? "border-brand" : "border-line hover:border-line-strong"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt="" className="h-20 w-auto bg-surface-muted object-cover" loading="lazy" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-2">
        {aiEnabled && (
          <Card className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Textos con IA</h2>
            <p className="mt-1 text-xs text-muted">
              Claude redacta un titular y un subtítulo por pantalla a partir de la ficha y de tus keywords con más oportunidad. Sustituye los textos actuales.
            </p>
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={200}
              placeholder="Enfoque (opcional): tono, público, oferta…"
              className={`${inputClass} mt-3 w-full`}
            />
            <button type="button" onClick={writeCopy} disabled={writing} aria-busy={writing} className={`${buttonPrimary} mt-2 w-full`}>
              {writing ? "Redactando…" : "Redactar textos"}
            </button>
            {notes.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs text-ink-soft">
                {notes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            )}
          </Card>
        )}

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
                      ref={(el) => {
                        if (el) thumbs.current.set(t.id, el);
                        else thumbs.current.delete(t.id);
                      }}
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

        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Dispositivo</h2>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Tamaño
              <select value={spec.device} onChange={(e) => update({ device: e.target.value })} className={inputClass}>
                {presetsFor(store).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.width}×{p.height} · {p.note}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              <span className="flex justify-between">
                Tamaño del móvil <span className="font-mono text-xs text-muted">{Math.round(spec.deviceScale * 100)}%</span>
              </span>
              <input type="range" min={50} max={100} value={Math.round(spec.deviceScale * 100)} onChange={(e) => update({ deviceScale: Number(e.target.value) / 100 })} />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={spec.showFrame} onChange={(e) => update({ showFrame: e.target.checked })} />
              Mostrar el marco del dispositivo
            </label>
            {spec.showFrame && (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                Color del marco
                <select value={spec.theme.frame} onChange={(e) => updateTheme({ frame: e.target.value as "dark" | "light" })} className={inputClass}>
                  <option value="dark">Oscuro</option>
                  <option value="light">Claro</option>
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              <span className="flex justify-between">
                Inclinación <span className="font-mono text-xs text-muted">{spec.deviceRotate}°</span>
              </span>
              <input type="range" min={-25} max={25} value={spec.deviceRotate} onChange={(e) => update({ deviceRotate: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              <span className="flex justify-between">
                Desplazamiento horizontal <span className="font-mono text-xs text-muted">{Math.round(spec.deviceOffsetX * 100)}%</span>
              </span>
              <input type="range" min={-50} max={50} value={Math.round(spec.deviceOffsetX * 100)} onChange={(e) => update({ deviceOffsetX: Number(e.target.value) / 100 })} />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={spec.alternate} onChange={(e) => update({ alternate: e.target.checked })} />
              Alternar el lado en cada pantalla
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={spec.pair} onChange={(e) => update({ pair: e.target.checked })} />
              Mostrar la siguiente pantalla detrás
            </label>
          </div>
        </Card>

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
                    style={{ background: t.theme.background2 ? `linear-gradient(${t.theme.background}, ${t.theme.background2})` : t.theme.background }}
                  />
                  {t.label}
                </button>
              </li>
            ))}
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
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Peso del titular
              <select value={spec.theme.weight} onChange={(e) => updateTheme({ weight: Number(e.target.value) as 600 | 700 | 800 })} className={inputClass}>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
                <option value={800}>Extra bold</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Alineación
              <select value={spec.theme.align} onChange={(e) => updateTheme({ align: e.target.value as "center" | "left" })} className={inputClass}>
                <option value="center">Centrado</option>
                <option value="left">Izquierda</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Adorno de fondo
              <select value={spec.decor} onChange={(e) => update({ decor: e.target.value as ScreenshotSpec["decor"] })} className={inputClass}>
                {DECORS.map((d) => (
                  <option key={d} value={d}>
                    {DECOR_LABEL[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              <span className="flex justify-between">
                Tamaño del texto <span className="font-mono text-xs text-muted">{Math.round(spec.textScale * 100)}%</span>
              </span>
              <input type="range" min={70} max={150} value={Math.round(spec.textScale * 100)} onChange={(e) => update({ textScale: Number(e.target.value) / 100 })} />
            </label>
          </div>
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Fondo con IA</h2>
          {providerLabel ? (
            <>
              <p className="mt-1 text-xs text-muted">
                {providerLabel} dibuja un fondo vertical según la temática de la app; Claude puede proponer el prompt a partir de la ficha y las keywords. El fondo
                se aplica a todas las pantallas, debajo del adorno y del móvil.
              </p>
              {aiEnabled && (
                <>
                  <input
                    value={bgFocus}
                    onChange={(e) => setBgFocus(e.target.value)}
                    maxLength={200}
                    placeholder="Enfoque (opcional): motivos, ambiente, colores…"
                    className={`${inputClass} mt-3 w-full`}
                  />
                  <button type="button" onClick={proposeBackgrounds} disabled={bgWriting} aria-busy={bgWriting} className={`${buttonSecondary} mt-2 w-full`}>
                    {bgWriting ? "Proponiendo…" : "Proponer fondos con Claude"}
                  </button>
                  {bgPrompts.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {bgPrompts.map((p) => (
                        <li key={p.name}>
                          <button
                            type="button"
                            onClick={() => setBgPrompt(p.prompt)}
                            title={p.rationale}
                            aria-pressed={bgPrompt === p.prompt}
                            className={`rounded-md border px-2 py-1 text-xs ${bgPrompt === p.prompt ? "border-brand text-ink" : "border-line-strong text-ink-soft hover:border-muted"}`}
                          >
                            {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <textarea
                value={bgPrompt}
                onChange={(e) => setBgPrompt(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Prompt en inglés para el modelo de imágenes: colores, motivos, estilo… Sin texto ni móviles."
                className={`${inputClass} mt-3 w-full py-2 text-xs`}
              />
              <button type="button" onClick={generateBackground} disabled={bgGenerating || bgPrompt.trim().length < 10} aria-busy={bgGenerating} className={`${buttonPrimary} mt-2 w-full`}>
                {bgGenerating ? "Generando fondo…" : "Generar fondo"}
              </button>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Para generar fondos hace falta un proveedor de imágenes: añade <code className="font-mono">OPENAI_API_KEY</code> o{" "}
              <code className="font-mono">GEMINI_API_KEY</code> en Vercel.
            </p>
          )}
          {backgrounds.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {backgrounds.map((b) => {
                const url = `/api/assets/generated/${b.id}`;
                const active = spec.backgroundImage === url;
                return (
                  <li key={b.id} className="relative">
                    <button
                      type="button"
                      onClick={() => update({ backgroundImage: active ? null : url })}
                      aria-pressed={active}
                      title={b.prompt}
                      className={`block overflow-hidden rounded-md border-2 ${active ? "border-brand" : "border-line hover:border-line-strong"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-24 w-auto bg-surface-muted object-cover" loading="lazy" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBackground(b.id)}
                      aria-label="Borrar este fondo"
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface text-xs text-muted hover:text-danger"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {spec.backgroundImage && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
                <span className="flex justify-between">
                  Velo del color de fondo <span className="font-mono text-xs text-muted">{Math.round(spec.backgroundDim * 100)}%</span>
                </span>
                <input type="range" min={0} max={90} value={Math.round(spec.backgroundDim * 100)} onChange={(e) => update({ backgroundDim: Number(e.target.value) / 100 })} />
              </label>
              <button type="button" onClick={() => update({ backgroundImage: null })} className={buttonSecondary}>
                Quitar el fondo
              </button>
            </div>
          )}
        </Card>

        <Card className="px-5 py-4">
          <button type="button" onClick={save} disabled={saving || bytes > MAX_SPEC_BYTES} className={`${buttonPrimary} w-full`}>
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
          {bytes > MAX_SPEC_BYTES && (
            <p className="mt-1 text-xs text-warn-fg">El conjunto pesa {(bytes / 1_000_000).toFixed(1)} MB; el máximo es 3,5 MB. Quita alguna captura.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange, onClear }: { label: string; value: string; onChange: (v: string) => void; onClear?: () => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
      {label}
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface p-0.5" />
        <span className="font-mono text-xs text-muted">{value}</span>
        {onClear && (
          <button type="button" onClick={onClear} className="text-xs text-link hover:underline">
            Sin degradado
          </button>
        )}
      </span>
    </label>
  );
}

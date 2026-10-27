"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob, slug } from "@/lib/assets/download";
import { ensureFonts, loadImage, pageFontFamily } from "@/lib/assets/screenshot-render";
import type { ScreenshotSpec } from "@/lib/assets/screenshots";
import { DEFAULT_VIDEO_SETTINGS, durationWarning, getVideoPreset, totalDuration, VIDEO_PRESETS, type VideoSettings } from "@/lib/assets/video";
import { canEncodeMp4, drawFrame, encodeVideo, type EncodeResult } from "@/lib/assets/video-encode";
import { buttonPrimary, buttonSecondary, Card, inputClass } from "./ui";

type Props = { appId: number; appTitle: string; spec: ScreenshotSpec | null };

const PREVIEW_HEIGHT = 420;

export function VideoStudio({ appId, appTitle, spec }: Props) {
  const [settings, setSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<(EncodeResult & { url: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const images = useRef(new Map<string, CanvasImageSource>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  const font = useMemo(() => pageFontFamily(), []);
  const preset = getVideoPreset(settings.preset);
  const slideCount = spec?.slides.length ?? 0;
  const seconds = totalDuration(settings, slideCount);
  const warning = durationWarning(settings, slideCount);
  const mp4 = typeof window !== "undefined" && canEncodeMp4();

  // Load every slide image once.
  useEffect(() => {
    if (!spec) return;
    let cancelled = false;
    (async () => {
      await ensureFonts(font, [500, spec.theme.weight]);
      await Promise.all(
        spec.slides.map(async (s) => {
          if (!s.image || images.current.has(s.image)) return;
          try {
            images.current.set(s.image, await loadImage(s.image));
          } catch {}
        }),
      );
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [spec, font]);

  const paint = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !spec) return;
      const scale = PREVIEW_HEIGHT / preset.height;
      const w = Math.round(preset.width * scale);
      const h = PREVIEW_HEIGHT;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawFrame(ctx, t, { spec, images: images.current, settings, opts: { fontFamily: font } }, preset.width, preset.height, scale);
    },
    [spec, settings, preset, font],
  );

  // Preview: either scrubbing or playing in real time.
  useEffect(() => {
    if (!ready) return;
    if (!playing) {
      paint(time);
      return;
    }
    let frame = 0;
    const start = performance.now() - time * 1000;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= seconds) {
        setPlaying(false);
        setTime(0);
        return;
      }
      setTime(t);
      paint(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // `time` drives the scrubber while paused; while playing it is updated from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, paint, seconds, playing ? 0 : time]);

  async function render() {
    if (!spec) return;
    setError(null);
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
    setProgress(0);
    abort.current = new AbortController();
    try {
      const out = await encodeVideo({
        spec,
        images: images.current,
        settings,
        opts: { fontFamily: font },
        onProgress: setProgress,
        signal: abort.current.signal,
      });
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "No se pudo generar el vídeo.");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  if (!spec) {
    return (
      <Card className="px-5 py-5 text-sm">
        <h2 className="font-semibold">Primero guarda un conjunto de screenshots</h2>
        <p className="mt-1.5 text-ink-soft">
          El vídeo anima las pantallas guardadas en{" "}
          <Link href={`/apps/${appId}/creativos`} className="text-link hover:underline">
            Screenshots
          </Link>
          : monta al menos cuatro o cinco, guarda el diseño y vuelve aquí.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Vista previa</h2>
              <p className="mt-0.5 text-xs text-muted">
                {preset.label} · {seconds} s · {slideCount} pantallas · {settings.fps} fps
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPlaying((p) => !p)} disabled={!ready} className={buttonSecondary}>
                {playing ? "Pausar" : "Reproducir"}
              </button>
            </div>
          </div>
          <div className="mt-4 flex justify-center rounded-lg bg-bg p-4">
            <canvas ref={canvasRef} style={{ height: PREVIEW_HEIGHT, width: Math.round((PREVIEW_HEIGHT * preset.width) / preset.height) }} className="rounded-md bg-surface-muted" />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, seconds)}
            step={0.05}
            value={Math.min(time, seconds)}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
            aria-label="Posición"
            className="mt-3 w-full"
          />
        </Card>

        {result && (
          <Card className="px-5 py-5">
            <h2 className="text-[15px] font-semibold">Vídeo generado</h2>
            <p className="mt-0.5 text-xs text-muted">
              {result.extension.toUpperCase()} · {(result.blob.size / 1_000_000).toFixed(1)} MB · {result.seconds} s
              {result.extension === "webm" && " · tu navegador no codifica H.264, así que es WebM; conviértelo a MP4 antes de subirlo a App Store Connect"}
            </p>
            <video src={result.url} controls playsInline className="mt-3 max-h-[420px] rounded-md bg-bg" />
            <button
              type="button"
              onClick={() => downloadBlob(`${slug(appTitle)}-${preset.id}.${result.extension}`, result.blob)}
              className={`${buttonPrimary} mt-3`}
            >
              Descargar {result.extension.toUpperCase()}
            </button>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Ajustes</h2>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Formato
              <select value={settings.preset} onChange={(e) => setSettings((s) => ({ ...s, preset: e.target.value }))} className={inputClass}>
                {VIDEO_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.note}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              <span className="flex justify-between">
                Segundos por pantalla <span className="font-mono text-xs text-muted">{settings.secondsPerSlide.toFixed(1)} s</span>
              </span>
              <input
                type="range"
                min={15}
                max={80}
                value={Math.round(settings.secondsPerSlide * 10)}
                onChange={(e) => setSettings((s) => ({ ...s, secondsPerSlide: Number(e.target.value) / 10 }))}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Transición
              <select value={settings.transition} onChange={(e) => setSettings((s) => ({ ...s, transition: e.target.value as VideoSettings["transition"] }))} className={inputClass}>
                <option value="fade">Fundido</option>
                <option value="slide">Deslizar</option>
                <option value="none">Corte</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              Fotogramas por segundo
              <select value={settings.fps} onChange={(e) => setSettings((s) => ({ ...s, fps: Number(e.target.value) as 24 | 30 }))} className={inputClass}>
                <option value={30}>30 (App Store)</option>
                <option value={24}>24</option>
              </select>
            </label>
            {warning && <p className="text-xs text-warn-fg">{warning}</p>}
          </div>
        </Card>

        <Card className="px-5 py-4">
          {progress == null ? (
            <button type="button" onClick={render} disabled={!ready} className={`${buttonPrimary} w-full`}>
              Generar vídeo
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Codificando… {Math.round(progress * 100)}%</span>
                <button type="button" onClick={() => abort.current?.abort()} className="text-link hover:underline">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            {mp4
              ? "Se codifica en tu navegador como MP4 H.264, el formato que piden App Store Connect y YouTube. Sin sonido."
              : "Tu navegador no tiene WebCodecs: se grabará en WebM a tiempo real. Para MP4 usa Chrome, Edge o Safari 17 o superior."}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

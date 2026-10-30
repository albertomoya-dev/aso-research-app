"use client";

import { useState, useTransition } from "react";
import { deleteGeneratedImage, generateLogoImages, generateLogoPrompts, type LogoImagesResult, type LogoPromptResult } from "@/app/asset-actions";
import { downloadBlob, slug } from "@/lib/assets/download";
import { loadImage } from "@/lib/assets/screenshot-render";
import { buttonPrimary, buttonSecondary, Card, inputClass } from "./ui";

export type GeneratedLogo = { id: number; prompt: string; provider: string; model: string; createdAt: string };

type Props = {
  appId: number;
  appTitle: string;
  images: GeneratedLogo[];
  providerLabel: string | null;
  aiEnabled: boolean;
};

type Suggestion = { name: string; prompt: string; rationale: string };

export function LogoStudio({ appId, appTitle, images, providerLabel, aiEnabled }: Props) {
  const [prompt, setPrompt] = useState("");
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(2);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [writing, startWriting] = useTransition();
  const [generating, startGenerating] = useTransition();
  const [deleting, startDeleting] = useTransition();

  function writePrompts() {
    setStatus(null);
    startWriting(async () => {
      const result: LogoPromptResult = await generateLogoPrompts(appId, focus);
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setSuggestions(result.prompts);
      if (!prompt.trim()) setPrompt(result.prompts[0].prompt);
    });
  }

  function generate() {
    setStatus(null);
    startGenerating(async () => {
      const result: LogoImagesResult = await generateLogoImages(appId, prompt, count);
      if ("error" in result) setStatus({ kind: "error", text: result.error });
      else setStatus({ kind: "ok", text: `${result.ids.length} ${result.ids.length === 1 ? "imagen" : "imágenes"} de ${result.model}.` });
    });
  }

  /** Re-encodes to PNG at the size each store wants; the stored file may be WebP. */
  async function download(image: GeneratedLogo, size: number, label: string) {
    try {
      const img = await loadImage(`/api/assets/generated/${image.id}`);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no disponible");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo exportar"))), "image/png"));
      downloadBlob(`${slug(appTitle)}-logo-${label}-${size}.png`, blob);
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "No se pudo descargar." });
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="px-5 py-5">
          <h2 className="text-[15px] font-semibold">Logos generados</h2>
          <p className="mt-0.5 text-xs text-muted">Se guardan aquí; descárgalos a 1024 px para App Store o 512 px para Google Play (PNG).</p>
          {images.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Todavía no hay ninguno. Escribe un prompt (o pide uno a Claude) y pulsa «Generar».</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {images.map((image) => (
                <li key={image.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-muted p-3">
                  <div className="flex items-end gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/generated/${image.id}`} alt="" width={120} height={120} className="bg-surface" style={{ borderRadius: 120 * 0.225 }} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/generated/${image.id}`} alt="" width={64} height={64} className="rounded-full bg-surface" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/generated/${image.id}`} alt="" width={29} height={29} className="bg-surface" style={{ borderRadius: 29 * 0.225 }} />
                  </div>
                  <p className="line-clamp-3 text-xs text-muted" title={image.prompt}>
                    {image.prompt}
                  </p>
                  <p className="font-mono text-[11px] text-muted">
                    {image.model} · {new Date(image.createdAt).toLocaleDateString("es-ES")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => download(image, 1024, "ios")} className={buttonSecondary}>
                      PNG 1024
                    </button>
                    <button type="button" onClick={() => download(image, 512, "android")} className={buttonSecondary}>
                      PNG 512
                    </button>
                    <button type="button" onClick={() => setPrompt(image.prompt)} className={buttonSecondary}>
                      Reusar prompt
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => {
                        if (window.confirm("¿Borrar esta imagen?")) startDeleting(() => deleteGeneratedImage(appId, image.id));
                      }}
                      className="text-xs text-danger hover:underline"
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {aiEnabled && (
          <Card className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Prompts con Claude</h2>
            <p className="mt-1 text-xs text-muted">Claude escribe tres direcciones visuales a partir de la ficha y tus keywords. Elige una y edítala si quieres.</p>
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={200}
              placeholder="Enfoque (opcional): colores de marca, estilo…"
              className={`${inputClass} mt-3 w-full`}
            />
            <button type="button" onClick={writePrompts} disabled={writing} aria-busy={writing} className={`${buttonSecondary} mt-2 w-full`}>
              {writing ? "Pensando…" : "Pedir prompts a Claude"}
            </button>
            {suggestions.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {suggestions.map((s) => (
                  <li key={s.name} className="rounded-lg border border-line bg-surface-muted p-3">
                    <p className="text-[13px] font-medium">{s.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{s.rationale}</p>
                    <button type="button" onClick={() => setPrompt(s.prompt)} className="mt-1.5 text-xs text-link hover:underline">
                      Usar este prompt
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card className="px-5 py-4">
          <h2 className="text-[15px] font-semibold">Generar</h2>
          {providerLabel ? (
            <p className="mt-1 text-xs text-muted">Con {providerLabel}. Cada imagen tarda entre 10 y 40 segundos y tiene coste en tu cuenta del proveedor.</p>
          ) : (
            <p className="mt-1 text-xs text-warn-fg">
              Falta un proveedor de imágenes. Añade <code className="font-mono">OPENAI_API_KEY</code> o <code className="font-mono">GEMINI_API_KEY</code> en Vercel y vuelve a
              desplegar. El estado de cada integración está en Ajustes.
            </p>
          )}
          <label className="mt-3 flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
            Prompt (en inglés funciona mejor)
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} maxLength={2000} className={`${inputClass} py-2 font-normal`} />
          </label>
          <label className="mt-3 flex items-center justify-between gap-2 text-[13px] font-medium text-ink-soft">
            Imágenes por tirada
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={generate} disabled={generating || !providerLabel || prompt.trim().length < 10} aria-busy={generating} className={`${buttonPrimary} mt-3 w-full`}>
            {generating ? "Generando…" : "Generar"}
          </button>
          <p aria-live="polite" className="mt-2 text-xs">
            {status && <span className={status.kind === "error" ? "text-danger" : "text-ink-soft"}>{status.text}</span>}
          </p>
        </Card>
      </div>
    </div>
  );
}

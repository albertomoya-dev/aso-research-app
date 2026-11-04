"use client";

import type { Slide } from "@/lib/assets/screenshots";
import { CropEditor } from "../crop-editor";
import { buttonSecondary } from "../ui";
import { HelpTip } from "../ui/help-tip";
import type { ImageMode } from "./types";
import type { Upload } from "./use-upload";
import type { Studio } from "./use-studio";

const MODES: [ImageMode, string][] = [
  ["raw", "Captura en bruto, dentro del marco"],
  ["crop", "Recortar la pantalla de un montaje"],
  ["asis", "Tal cual, sin plantilla"],
];

/** The screenshot of the selected screen: upload, how to use it (raw, cropped, as is) and the store's own. */
export function CaptureFields({ studio, upload, slide }: { studio: Studio; upload: Upload; slide: Slide }) {
  const { updateSlide, modeOf, setImageMode, redetect, cropAllStoreImages, pickStoreImage, props } = studio;
  const { storeImages } = props;
  const mode = modeOf(slide);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${buttonSecondary} cursor-pointer`} aria-busy={upload.uploading}>
          {upload.uploading ? "Leyendo…" : "Subir capturas"}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={upload.onPick} />
        </label>
        {slide.image && (
          <button
            type="button"
            onClick={() => updateSlide(slide.id, { image: null, asIs: false, capturedAt: null, appVersion: null })}
            className={buttonSecondary}
          >
            Quitar imagen
          </button>
        )}
      </div>
      {slide.image && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-soft">Cómo usar la imagen</span>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setImageMode(slide, m)}
                aria-pressed={mode === m}
                className={`rounded-md border px-2 py-1 text-xs ${mode === m ? "border-brand text-ink" : "border-line-strong text-ink-soft hover:border-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "crop" && (
            <div className="flex flex-col gap-2">
              <CropEditor src={slide.image} crop={slide.crop} onChange={(crop) => updateSlide(slide.id, { asIs: false, crop })} />
              <p className="text-xs text-muted">
                Solo la zona marcada se usa como pantalla de la app dentro del marco de la plantilla. Arrastra sobre la imagen para ajustarla.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => redetect(slide)} className={buttonSecondary}>
                  Detectar la pantalla
                </button>
                {slide.crop && storeImages.includes(slide.image) && (
                  <button type="button" onClick={() => cropAllStoreImages(slide.crop!)} className={buttonSecondary}>
                    Aplicar este recorte a todas las capturas de la tienda
                  </button>
                )}
              </div>
            </div>
          )}
          {mode === "raw" && storeImages.includes(slide.image) && (
            <p className="text-xs text-warn-fg">
              Esta captura viene de la tienda y ya lleva su propio texto y su propio móvil, así que dentro del marco se verá un móvil sobre otro.
              Elige «Recortar la pantalla de un montaje» para usar solo la pantalla de la app.
            </p>
          )}
          {mode === "asis" && (
            <p className="text-xs text-muted">
              La imagen se muestra entera, sin marco, texto, fondo ni plantilla. Para que la plantilla se aplique, elige «Recortar la pantalla de un
              montaje».
            </p>
          )}
        </div>
      )}
      {storeImages.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs text-muted">
            O usa una de las capturas publicadas en la tienda.
            <HelpTip label="Capturas de la tienda">Son montajes ya terminados: se busca el móvil dentro y se recorta su pantalla para la plantilla.</HelpTip>
          </p>
          <ul className="flex flex-wrap gap-2">
            {storeImages.map((src, i) => (
              <li key={src}>
                <button
                  type="button"
                  onClick={() => pickStoreImage(slide, src)}
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
  );
}

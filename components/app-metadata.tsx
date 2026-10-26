import { formatDate, formatNumber, formatRating } from "@/lib/format";
import type { AppMeta } from "@/lib/stores/types";

type Field = { label: string; value: string | null; limit?: number; note?: string };

function fieldsFor(meta: AppMeta): Field[] {
  const fields: Field[] = [{ label: "Título", value: meta.title, limit: 30 }];
  if (meta.store === "ios") {
    fields.push({ label: "Subtítulo", value: null, limit: 30, note: "La API pública del App Store no devuelve el subtítulo." });
  } else {
    fields.push({ label: "Descripción corta", value: meta.shortDescription, limit: 80 });
  }
  fields.push({ label: "Descripción", value: meta.description, limit: 4000 });
  fields.push({ label: "Novedades", value: meta.releaseNotes });
  return fields;
}

export function AppMetadata({ meta }: { meta: AppMeta }) {
  const stats = [
    { label: "Valoración", value: formatRating(meta.rating) },
    { label: "Valoraciones", value: formatNumber(meta.ratingsCount) },
    { label: "Versión", value: meta.version ? `${meta.version} · ${formatDate(meta.updatedAt)}` : "–" },
    { label: "Precio", value: meta.price || "–" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[10px] bg-surface-muted px-3.5 py-3">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3.5">
        <h3 className="text-[15px] font-semibold">Metadata publicada</h3>
        {fieldsFor(meta).map((f) => (
          <div key={f.label} className="rounded-[10px] border border-line px-3.5 py-3">
            <div className="flex justify-between gap-3 text-xs text-muted">
              <span className="font-semibold tracking-wider uppercase">{f.label}</span>
              {f.limit && f.value != null && <CharCount count={[...f.value].length} limit={f.limit} />}
            </div>
            {f.value ? (
              <p className="mt-1.5 line-clamp-6 text-sm leading-relaxed whitespace-pre-line">{f.value}</p>
            ) : (
              <p className="mt-1.5 text-sm text-muted">{f.note ?? "Sin contenido"}</p>
            )}
          </div>
        ))}
      </div>

      {meta.screenshots.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-[15px] font-semibold">Capturas</h3>
          <div className="flex gap-2.5 overflow-x-auto pb-2">
            {meta.screenshots.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt={`Captura ${i + 1}`}
                loading="lazy"
                className="h-52 w-auto shrink-0 rounded-xl border border-line object-cover"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CharCount({ count, limit }: { count: number; limit: number }) {
  const over = count > limit;
  return (
    <span className={`font-mono ${over ? "font-semibold text-danger" : ""}`}>
      {formatNumber(count)}/{formatNumber(limit)}
      {over && " · supera el límite"}
    </span>
  );
}

import { formatDate } from "@/lib/format";
import { localeLabel } from "@/lib/listing-drafts";
import type { Publication } from "@/lib/publication-queries";
import { PUBLICATION_STATUS_LABEL } from "@/lib/publications";
import { STORE_LABEL } from "@/lib/stores/types";
import { Card } from "./ui";

/** Every publish attempt of the app, newest first (table `publications`). */
export function PublicationHistory({ rows }: { rows: Publication[] }) {
  if (rows.length === 0) return null;
  return (
    <Card aria-label="Historial de publicaciones" className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold">Historial de publicaciones</h2>
        <p className="mt-1 text-[13px] text-muted">Cada envío desde Rankeo queda registrado, también los que fallaron, con los campos que cambiaban.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wider text-muted uppercase">
              <th scope="col" className="px-5 py-2.5 font-semibold">Fecha</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Idioma</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Estado</th>
              <th scope="col" className="px-5 py-2.5 font-semibold">Campos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="px-5 py-2.5 whitespace-nowrap">{formatDate(p.publishedAt)}</td>
                <td className="px-3 py-2.5">
                  {localeLabel(p.locale)} <span className="font-mono text-xs text-muted">{p.storeLocale}</span>
                  <div className="text-xs text-muted">{STORE_LABEL[p.store]}</div>
                </td>
                <td className={`px-3 py-2.5 ${p.status === "failed" ? "text-danger" : ""}`}>
                  {PUBLICATION_STATUS_LABEL[p.status]}
                  {p.error && <div className="max-w-sm text-xs text-muted">{p.error}</div>}
                </td>
                <td className="px-5 py-2.5 text-ink-soft">{p.fields.map((f) => f.label).join(", ") || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

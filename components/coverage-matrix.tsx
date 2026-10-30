import Link from "next/link";
import type { CoverageMatrix as Matrix } from "@/lib/listing-drafts";
import { FIELDS, type FieldKey } from "@/lib/metadata-check";
import type { Store } from "@/lib/stores/types";
import { Card } from "./ui";

type Props = {
  appId: number;
  store: Store;
  matrix: Matrix;
  /** Query string of each column's editor URL, in column order. */
  hrefs: string[];
};

/** Locale × keyword: which listing covers each keyword, and in which field. Server component, no state. */
export function CoverageMatrix({ appId, store, matrix, hrefs }: Props) {
  const labels = Object.fromEntries(FIELDS[store].map((f) => [f.key, f.label])) as Record<FieldKey, string>;
  return (
    <Card aria-label="Cobertura por idioma" className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold">Cobertura por idioma</h2>
        <p className="mt-1 text-[13px] text-muted">
          Tus {matrix.rows.length} keywords relevantes de más oportunidad en cada ficha guardada (y en la publicada, si aún no hay borrador principal). Son
          keywords de este país: en otro idioma lo normal es que salgan vacías. Para medir otro idioma, sigue la app en ese país desde «Otros países».
        </p>
      </div>
      {matrix.rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Aún no hay keywords relevantes que medir.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: `${240 + matrix.columns.length * 120}px` }}>
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5">Keyword</th>
                {matrix.columns.map((c, i) => (
                  <th key={`${c.locale}|${c.country}`} className="px-3 py-2.5 text-right">
                    <Link href={`/apps/${appId}/metadata${hrefs[i]}`} className="text-link normal-case hover:underline">
                      {c.locale}
                      {c.country ? ` · ${c.country.toUpperCase()}` : ""}
                    </Link>
                    {!c.saved && <span className="block font-normal normal-case">publicada</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line bg-surface-muted">
                <td className="px-5 py-2 text-[13px] text-ink-soft">Cobertura ponderada</td>
                {matrix.columns.map((c) => (
                  <td key={`${c.locale}|${c.country}`} className="px-3 py-2 text-right font-mono font-semibold">
                    {c.score}
                  </td>
                ))}
              </tr>
              {matrix.rows.map((r) => (
                <tr key={r.term} className="border-b border-line last:border-0">
                  <td className="px-5 py-2">
                    {r.term} <span className="font-mono text-xs text-muted">{Math.round(r.value)}</span>
                  </td>
                  {r.cells.map((cell, i) => (
                    <td key={i} className="px-3 py-2 text-right text-xs">
                      {cell.field ? (
                        <span className="font-semibold text-up">{labels[cell.field]?.toLowerCase()}</span>
                      ) : cell.partial ? (
                        <span className="text-ink-soft">palabras sueltas</span>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

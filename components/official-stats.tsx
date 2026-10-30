import { formatDay, formatNumber } from "@/lib/format";
import { type OfficialStats, type OfficialTermStats, untrackedTopTerms } from "@/lib/search-terms";
import { SearchTermsImport } from "./search-terms-import";
import { Card } from "./ui";

/** «Oficial · 120 visitantes · 14 instalaciones»: a figure from Play Console, never mixed with the estimates. */
export function OfficialBadge({ stats, period }: { stats: OfficialTermStats; period: string }) {
  return (
    <span
      title={`Dato oficial de Google Play Console (${period}): visitantes de la ficha que llegaron buscando esta keyword y cuántos instalaron.`}
      className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-soft"
    >
      <span className="font-semibold">Oficial</span>
      <span className="font-mono">{formatNumber(stats.visitors)}</span> visitantes ·<span className="font-mono">{formatNumber(stats.acquisitions)}</span>{" "}
      instalaciones
    </span>
  );
}

export const officialPeriod = (stats: NonNullable<OfficialStats>) => `${formatDay(stats.from)} – ${formatDay(stats.to)}`;

/** Import card on the app page, with the searches that bring visitors but are not followed yet. */
export function OfficialStatsCard({ appId, stats, tracked }: { appId: number; stats: OfficialStats; tracked: Set<string> }) {
  const top = untrackedTopTerms(stats, tracked);
  const matched = stats ? [...stats.byTerm.keys()].filter((t) => tracked.has(t)).length : 0;
  return (
    <Card aria-label="Datos oficiales de Google Play" className="flex flex-col gap-4 px-6 py-5">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[17px] font-semibold">Términos de búsqueda reales</h2>
          <span className="rounded-md border border-line-strong px-2 py-0.5 text-xs font-semibold text-ink-soft">Dato oficial · Play Console</span>
        </div>
        <p className="mt-1 text-[13px] text-muted">
          Importa el CSV de Play Console con las búsquedas que llevan a tu ficha: visitantes e instalaciones reales por término. Es la única cifra
          oficial; la popularidad de la tabla es una estimación del autocompletado. Sirve tanto el informe mensual de Cloud Storage
          (<code className="font-mono">store_performance_…_traffic_source.csv</code>, en UTF-16) como la descarga de la pantalla de términos de búsqueda,
          con cabeceras en español o en inglés.
        </p>
        {stats && (
          <p className="mt-2 text-[13px] text-ink-soft">
            Datos del {officialPeriod(stats)}: {stats.byTerm.size} términos, {matched} coinciden con keywords que sigues (marcadas «Oficial» en la
            tabla).
          </p>
        )}
      </div>
      <SearchTermsImport appId={appId} />
      {top.length > 0 && (
        <div className="border-t border-line pt-3">
          <h3 className="text-[13px] font-semibold text-ink-soft">Búsquedas que te traen visitas y no sigues</h3>
          <ul className="mt-2 flex flex-col">
            {top.map((t) => (
              <li key={t.term} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
                <span>{t.term}</span>
                <span className="font-mono text-[13px] text-muted">
                  {formatNumber(t.visitors)} visitantes · {formatNumber(t.acquisitions)} instalaciones
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Añádelas arriba si encajan con tu app: ya sabes que la gente las busca y llega a tu ficha.</p>
        </div>
      )}
    </Card>
  );
}

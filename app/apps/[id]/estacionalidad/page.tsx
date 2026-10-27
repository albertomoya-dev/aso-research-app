import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { getCountry } from "@/lib/countries";
import { MONTH_LONG, MONTH_SHORT, monthlyProfile, nextPeak, peakMonths, seasonalityStrength } from "@/lib/seasonality";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Estacionalidad" };

const ahead = (n: number) => (n === 0 ? "este mes" : n === 1 ? "el mes que viene" : `en ${n} meses`);

export default async function SeasonalityPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const rows = await getDb()
    .select({ id: schema.keywords.id, term: schema.keywords.term, points: schema.keywordTrends.points })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .leftJoin(
      schema.keywordTrends,
      and(eq(schema.keywordTrends.keywordId, schema.keywords.id), eq(schema.keywordTrends.country, app.country)),
    )
    .where(eq(schema.appKeywords.appId, app.id));

  const month = new Date().getUTCMonth();
  const withData = rows
    .flatMap((r) => {
      const profile = r.points ? monthlyProfile(r.points) : null;
      if (!profile) return [];
      return [{ ...r, profile, peaks: new Set(peakMonths(profile)), strength: seasonalityStrength(profile), next: nextPeak(profile, month) }];
    })
    .sort((a, b) => b.strength - a.strength);
  const missing = rows.length - withData.length;
  const upcoming = withData.filter((r) => r.next).sort((a, b) => a.next!.monthsAhead - b.next!.monthsAhead || b.strength - a.strength);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Estacionalidad
      </nav>
      <PageHeader title="Estacionalidad de tus keywords">
        Interés medio en Google por mes en {getCountry(app.country).name}, a partir de Google Trends (últimos 12 meses). Sirve para preparar la
        ficha y las keywords unas semanas antes de cada pico.
      </PageHeader>

      {withData.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-muted">
          Aún no hay datos de Google Trends para estas keywords. Se descargan en la consulta diaria (hasta 20 keywords al día).
        </Card>
      ) : (
        <>
          <Card aria-label="Picos que se acercan" className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Picos que empiezan pronto</h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Ninguna keyword empieza su temporada alta en los próximos dos meses.</p>
            ) : (
              <>
                <p className="mt-1 text-[13px] text-muted">
                  Las tiendas tardan en reindexar: cambia la ficha o las keywords unas 2 a 4 semanas antes de que empiece el pico.
                </p>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {upcoming.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                      <Link href={`/apps/${app.id}/keywords/${r.id}`} className="font-medium hover:underline">
                        {r.term}
                      </Link>
                      <span className="text-ink-soft">
                        sube en {MONTH_LONG[r.next!.month]} ({ahead(r.next!.monthsAhead)}) ·{" "}
                        <span className="font-mono">×{r.strength.toLocaleString("es-ES", { maximumFractionDigits: 1 })}</span> sobre su media
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card aria-label="Interés por mes" className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold">Interés por mes</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                Cada fila va de 0 a 100 respecto a su mejor mes. Ordenadas de más a menos estacionales.
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  0
                  {[0, 25, 50, 75, 100].map((v) => (
                    <span key={v} className="size-3 rounded-sm" style={{ background: cellColor(v) }} />
                  ))}
                  100
                </span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0.5 px-3 py-2 text-[13px]">
                <thead>
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left text-xs font-semibold text-muted">
                      Keyword
                    </th>
                    {MONTH_SHORT.map((m, i) => (
                      <th
                        key={m}
                        scope="col"
                        className={`w-[6.5%] py-1.5 text-center text-xs font-semibold ${i === month ? "text-link" : "text-muted"}`}
                      >
                        {m}
                        {i === month && <span className="sr-only"> (mes actual)</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {withData.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="max-w-[220px] truncate px-2 py-1 text-left font-medium">
                        <Link href={`/apps/${app.id}/keywords/${r.id}`} className="hover:underline">
                          {r.term}
                        </Link>
                      </th>
                      {r.profile.map((v, m) => (
                        <td
                          key={m}
                          title={`${r.term} · ${MONTH_LONG[m]}: ${v}`}
                          className={`h-8 rounded text-center font-mono text-[11px] ${r.peaks.has(m) ? "font-semibold" : ""} ${
                            v >= 60 ? "text-on-brand" : "text-transparent"
                          }`}
                          style={{ background: cellColor(v), outline: m === month ? "1.5px solid var(--ink)" : undefined }}
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missing > 0 && (
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                {missing === 1 ? "1 keyword aún sin datos" : `${missing} keywords aún sin datos`} de Google Trends o con poco volumen.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** One hue from the surface (0) to full series blue (100), so it works in light and dark mode. */
function cellColor(value: number) {
  return `color-mix(in oklab, var(--series-1) ${Math.round(8 + 0.92 * value)}%, var(--surface))`;
}

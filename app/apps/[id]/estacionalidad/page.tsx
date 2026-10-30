import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { getCountry } from "@/lib/countries";
import { isRelevantKeyword } from "@/lib/relevance";
import { analyzeSeasonality, canAnnouncePeak, MIN_POPULARITY, MONTH_LONG, MONTH_SHORT, nextPeak, peakStarts } from "@/lib/seasonality";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Estacionalidad" };

const ahead = (n: number) => (n === 0 ? "este mes" : n === 1 ? "el mes que viene" : `en ${n} meses`);

export default async function SeasonalityPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const lang = getCountry(app.country).lang;
  const rows = await getDb()
    .select({
      id: schema.keywords.id,
      term: schema.keywords.term,
      relevance: schema.appKeywords.relevance,
      intent: schema.appKeywords.intent,
      points: schema.keywordTrends.points,
      popularity: schema.keywordMetrics.popularity,
    })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .leftJoin(
      schema.keywordTrends,
      and(eq(schema.keywordTrends.keywordId, schema.keywords.id), eq(schema.keywordTrends.country, app.country)),
    )
    .leftJoin(
      schema.keywordMetrics,
      and(
        eq(schema.keywordMetrics.keywordId, schema.keywords.id),
        eq(schema.keywordMetrics.store, app.store),
        eq(schema.keywordMetrics.country, app.country),
      ),
    )
    .where(eq(schema.appKeywords.appId, app.id));

  const month = new Date().getUTCMonth();
  const downloaded = rows.filter((r) => r.points && r.points.length > 0);
  const missing = rows.length - downloaded.length;
  const analyzed = downloaded.map((r) => {
    const s = analyzeSeasonality(r.points!);
    // A peak is announced only for relevant keywords people also search in the store.
    const announce = s != null && canAnnouncePeak(r.popularity) && isRelevantKeyword(r, lang);
    return { ...r, s, announce, next: s && announce ? nextPeak(s.peaks, month) : null };
  });
  const withSignal = analyzed.flatMap((r) => (r.s ? [{ ...r, s: r.s }] : [])).sort((a, b) => b.s.strength - a.s.strength);
  const weak = analyzed.filter((r) => !r.s);
  const upcoming = withSignal.filter((r) => r.next).sort((a, b) => a.next!.monthsAhead - b.next!.monthsAhead || b.s.strength - a.s.strength);
  // Annual calendar: which announceable keywords are in season each month.
  const calendar = MONTH_LONG.map((_, m) =>
    withSignal.flatMap((r) => (r.announce && r.s.peaks.includes(m) ? [{ id: r.id, term: r.term, starts: peakStarts(r.s.peaks).includes(m) }] : [])),
  );
  const inCalendar = calendar.some((c) => c.length > 0);

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

      {downloaded.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-muted">
          Aún no hay datos de Google Trends para estas keywords. Se descargan en la consulta diaria (hasta 20 keywords al día).
        </Card>
      ) : (
        <>
          <Card aria-label="Picos que se acercan" className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Picos que empiezan pronto</h2>
            <p className="mt-1 text-[13px] text-muted">
              Solo keywords relevantes, con al menos 3 semanas altas en el mes y popularidad de {MIN_POPULARITY} o más en la tienda. Las tiendas
              tardan en reindexar: cambia la ficha o las keywords unas 2 a 4 semanas antes de que empiece el pico.
            </p>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Ninguna keyword con señal suficiente empieza su temporada alta en los próximos dos meses.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                    <Link href={`/apps/${app.id}/keywords/${r.id}`} className="font-medium hover:underline">
                      {r.term}
                    </Link>
                    <span className="text-ink-soft">
                      sube en {MONTH_LONG[r.next!.month]} ({ahead(r.next!.monthsAhead)}) ·{" "}
                      <span className="font-mono">×{r.s.strength.toLocaleString("es-ES", { maximumFractionDigits: 1 })}</span> sobre su media
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card aria-label="Calendario de picos" className="px-5 py-4">
            <h2 className="text-[15px] font-semibold">Calendario de picos</h2>
            <p className="mt-1 text-[13px] text-muted">
              Meses de temporada alta de esas mismas keywords. «Empieza» marca el primer mes: la ficha debería estar lista el mes anterior.
            </p>
            {!inCalendar ? (
              <p className="mt-3 text-sm text-muted">Ninguna keyword relevante tiene un pico sostenido. Es normal en apps de uso diario.</p>
            ) : (
              <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {calendar.map((items, m) => (
                  <li
                    key={m}
                    className={`rounded-md border p-2.5 ${m === month ? "border-line-strong" : "border-line"} ${items.length ? "" : "bg-surface-muted"}`}
                  >
                    <p className={`text-xs font-semibold ${m === month ? "text-link" : "text-muted"}`}>
                      {MONTH_LONG[m].charAt(0).toUpperCase() + MONTH_LONG[m].slice(1)}
                      {m === month && <span className="font-normal"> · mes actual</span>}
                    </p>
                    {items.length > 0 && (
                      <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
                        {items.map((k) => (
                          <li key={k.id} className="flex min-w-0 items-center gap-1.5">
                            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: "var(--series-1)" }} />
                            <Link href={`/apps/${app.id}/keywords/${k.id}`} className="truncate hover:underline">
                              {k.term}
                            </Link>
                            {k.starts && <span className="shrink-0 text-xs text-muted">empieza</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card aria-label="Interés por mes" className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold">Interés por mes</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                Cada fila va de 0 a 100 respecto a su mejor mes. Ordenadas de más a menos estacionales. El último mes descargado no cuenta hasta
                que termina.
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
                  {withSignal.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="max-w-[220px] truncate px-2 py-1 text-left font-medium">
                        <Link href={`/apps/${app.id}/keywords/${r.id}`} className="hover:underline">
                          {r.term}
                        </Link>
                      </th>
                      {r.s.profile.map((v, m) =>
                        v == null ? (
                          <td
                            key={m}
                            title={`${r.term} · ${MONTH_LONG[m]}: mes en curso, aún sin cerrar`}
                            className="h-8 rounded bg-surface-muted text-center text-[11px] text-muted"
                          >
                            –
                          </td>
                        ) : (
                          <td
                            key={m}
                            title={`${r.term} · ${MONTH_LONG[m]}: ${v}`}
                            className={`h-8 rounded text-center font-mono text-[11px] ${r.s.peaks.includes(m) ? "font-semibold" : ""} ${
                              v >= 60 ? "text-on-brand" : "text-transparent"
                            }`}
                            style={{ background: cellColor(v), outline: m === month ? "1.5px solid var(--ink)" : undefined }}
                          >
                            {v}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                  {weak.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="max-w-[220px] truncate px-2 py-1 text-left font-medium text-muted">
                        <Link href={`/apps/${app.id}/keywords/${r.id}`} className="hover:underline">
                          {r.term}
                        </Link>
                      </th>
                      <td colSpan={12} className="h-8 rounded bg-surface-muted px-3 text-xs text-muted">
                        Sin datos suficientes: Google tiene muy poca señal para esta búsqueda (muchas semanas a 0).
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {missing > 0 && (
              <p className="border-t border-line px-5 py-3 text-xs text-muted">
                {missing === 1 ? "1 keyword aún sin datos" : `${missing} keywords aún sin datos`} de Google Trends: se descargan poco a poco en la
                consulta diaria.
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

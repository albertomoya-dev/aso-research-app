import { and, eq } from "drizzle-orm";
import { CalendarClock, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { prepareSeason } from "@/app/trend-actions";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondary, Card, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { getDb, schema } from "@/db";
import { cn } from "@/lib/cn";
import { getCountry } from "@/lib/countries";
import { nextSeasons } from "@/lib/health";
import { loadMarketParams, marketPath } from "@/lib/products";
import { today } from "@/lib/ranking";
import { isRelevantKeyword } from "@/lib/relevance";
import { analyzeSeasonality, canAnnouncePeak, MIN_POPULARITY, MONTH_LONG, MONTH_SHORT } from "@/lib/seasonality";
import { HEAT_CLASS, heatBucket, startsInLabel, upcomingPeaks } from "@/lib/trends-view";

// Mercado › Tendencias (phase 31, REDISENO_UX §6.7): «Próximos picos» in cards with «Preparar» (an
// annotation and the listing editor with the seasonal focus, no new draft), and the 12-month heatmap on a
// single-hue scale, with the keywords without data folded behind «Mostrar N sin datos».

type Props = { params: Promise<{ app: string; market: string }> };

export const metadata: Metadata = { title: "Tendencias" };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LEGEND = [0, 20, 40, 60, 80] as const;

export default async function TrendsPage({ params }: Props) {
  const app = await loadMarketParams(params);
  const country = getCountry(app.country);
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
    .leftJoin(schema.keywordTrends, and(eq(schema.keywordTrends.keywordId, schema.keywords.id), eq(schema.keywordTrends.country, app.country)))
    .leftJoin(
      schema.keywordMetrics,
      and(eq(schema.keywordMetrics.keywordId, schema.keywords.id), eq(schema.keywordMetrics.store, app.store), eq(schema.keywordMetrics.country, app.country)),
    )
    .where(eq(schema.appKeywords.appId, app.id));

  const month = new Date().getUTCMonth();
  const analyzed = rows.map((r) => {
    const s = r.points && r.points.length > 0 ? analyzeSeasonality(r.points) : null;
    // A peak is announced only for relevant keywords people also search in the store.
    const announce = s != null && canAnnouncePeak(r.popularity) && isRelevantKeyword(r, country.lang);
    return { ...r, s, announce, downloaded: Boolean(r.points && r.points.length > 0) };
  });
  const withSignal = analyzed.flatMap((r) => (r.s ? [{ ...r, s: r.s }] : [])).sort((a, b) => b.s.strength - a.s.strength);
  const noData = analyzed.filter((r) => !r.s).sort((a, b) => Number(b.downloaded) - Number(a.downloaded) || a.term.localeCompare(b.term, "es"));
  const strength = new Map(withSignal.map((r) => [r.id, r.s.strength]));
  const peaks = upcomingPeaks(
    nextSeasons(
      withSignal.filter((r) => r.announce && r.s.peaks.length > 0).map((r) => ({ term: r.term, peaks: r.s.peaks, keywordId: r.id })),
      today(),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tendencias">
        Interés en Google por mes en {country.name}, para preparar la ficha unas semanas antes de cada pico.
      </PageHeader>

      {withSignal.length === 0 && noData.every((r) => !r.downloaded) ? (
        <Card>
          <EmptyState
            icon={TrendingUp}
            title="Aún no hay datos de Google Trends"
            description="Se descargan en la consulta diaria, hasta 20 keywords al día."
          />
        </Card>
      ) : (
        <>
          <section aria-labelledby="peaks-title" className="flex flex-col gap-3">
            <h2 id="peaks-title" className="flex items-center gap-1 text-card-title font-semibold">
              Próximos picos
              <HelpTip label="Próximos picos">
                Keywords relevantes con al menos 3 semanas altas en el mes y popularidad de {MIN_POPULARITY} o más en la tienda. Las tiendas tardan
                en reindexar: «Preparar» deja una anotación tres semanas antes del pico y abre la ficha con ese enfoque, sin crear otro borrador.
              </HelpTip>
            </h2>
            {peaks.length === 0 ? (
              <Card>
                <EmptyState icon={CalendarClock} title="Ningún pico cerca" description="Ninguna keyword con señal suficiente empieza temporada en los próximos tres meses." />
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {peaks.map((p) => (
                  <li key={p.keywordId ?? p.term}>
                    <Card className="flex h-full flex-col gap-2 p-4">
                      <Link href={marketPath(app, `/keywords?k=${p.keywordId}`)} className="truncate text-card-title font-semibold hover:underline">
                        {p.term}
                      </Link>
                      <p className="text-table text-ink-soft">
                        {capital(MONTH_LONG[p.month])} · {startsInLabel(p)}
                        {p.keywordId != null && strength.has(p.keywordId) && (
                          <span className="tabular-nums"> · ×{strength.get(p.keywordId)!.toLocaleString("es-ES", { maximumFractionDigits: 1 })} sobre su media</span>
                        )}
                      </p>
                      {p.keywordId != null && (
                        <form action={prepareSeason} className="mt-auto pt-1">
                          <input type="hidden" name="appId" value={app.id} />
                          <input type="hidden" name="keywordId" value={p.keywordId} />
                          <input type="hidden" name="month" value={p.month} />
                          <input type="hidden" name="days" value={p.days} />
                          <SubmitButton className={buttonSecondary} pendingLabel="Preparando…" aria-label={`Preparar la ficha para la temporada de ${p.term}`}>
                            Preparar
                          </SubmitButton>
                        </form>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Card aria-labelledby="heat-title" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <h2 id="heat-title" className="flex items-center gap-1 text-card-title font-semibold">
                Interés por mes
                <HelpTip label="Interés por mes">
                  Cada fila va de 0 a 100 respecto a su mejor mes, de más a menos estacional. Los meses de pico van en negrita. El mes en curso no
                  cuenta hasta que termina.
                </HelpTip>
              </h2>
              <span className="flex items-center gap-1 text-label text-ink-soft" aria-hidden="true">
                0
                {LEGEND.map((v) => (
                  <span key={v} className={cn("size-3 rounded-sm", HEAT_CLASS[heatBucket(v)])} />
                ))}
                100
              </span>
            </div>
            {withSignal.length > 0 && (
              <div className="relative overflow-x-auto">
                <table aria-label="Interés por mes" className="w-full min-w-[720px] border-separate border-spacing-0.5 px-3 py-2 text-[13px]">
                  <thead>
                    <tr>
                      <th scope="col" className="px-2 py-1.5 text-left text-label font-medium text-ink-soft">
                        Keyword
                      </th>
                      {MONTH_SHORT.map((m, i) => (
                        <th key={m} scope="col" className={cn("w-[6.5%] py-1.5 text-center text-label font-medium", i === month ? "text-brand-strong" : "text-ink-soft")}>
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
                          <Link href={marketPath(app, `/keywords?k=${r.id}`)} className="hover:underline">
                            {r.term}
                          </Link>
                        </th>
                        {r.s.profile.map((v, m) =>
                          v == null ? (
                            <td key={m} title={`${r.term} · ${MONTH_LONG[m]}: mes en curso, aún sin cerrar`} className="h-8 rounded bg-surface-muted text-center text-[11px] text-ink-soft">
                              –
                            </td>
                          ) : (
                            <td
                              key={m}
                              title={`${r.term} · ${MONTH_LONG[m]}: ${v}${r.s.peaks.includes(m) ? " (pico)" : ""}`}
                              className={cn(
                                "h-8 rounded text-center text-[11px] tabular-nums",
                                HEAT_CLASS[heatBucket(v)],
                                r.s.peaks.includes(m) && "font-semibold underline decoration-2 underline-offset-2",
                                m === month && "outline-2 -outline-offset-2 outline-ink",
                              )}
                            >
                              {v}
                              {r.s.peaks.includes(m) && <span className="sr-only"> (pico)</span>}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {noData.length > 0 && (
              <details className="group border-t border-line">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-table font-medium text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:px-5">
                  <span className="group-open:hidden">Mostrar {noData.length} sin datos</span>
                  <span className="hidden group-open:inline">Ocultar {noData.length} sin datos</span>
                </summary>
                <ul aria-label="Keywords sin datos" className="flex flex-col px-4 pb-3 sm:px-5">
                  {noData.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-1.5 text-table last:border-0">
                      <Link href={marketPath(app, `/keywords?k=${r.id}`)} className="min-w-0 truncate hover:underline">
                        {r.term}
                      </Link>
                      <span className="text-label text-ink-soft">{r.downloaded ? "Google tiene muy poca señal" : "Aún sin descargar"}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

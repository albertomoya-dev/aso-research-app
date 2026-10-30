import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeAnnotation } from "@/app/actions";
import { AnnotationForm } from "@/components/annotation-form";
import { AppIcon } from "@/components/app-icon";
import { Position, PositionChange } from "@/components/rank";
import { RankChart } from "@/components/rank-chart";
import { difficultyLabel } from "@/components/scores";
import { TrendChart } from "@/components/trend-chart";
import { StoreBadge } from "@/components/store-badge";
import { Card } from "@/components/ui";
import { loadApp } from "@/lib/apps";
import { dailySeries } from "@/lib/chart-data";
import { getCountry } from "@/lib/countries";
import { formatDate, formatNumber, formatRating } from "@/lib/format";
import { ANNOTATION_WINDOW, getKeywordDetail } from "@/lib/queries";
import { officialPeriod } from "@/components/official-stats";
import { getOfficialStats } from "@/lib/search-term-queries";
import { averagePosition, positionChange, RANK_DEPTH, shiftDate, today } from "@/lib/ranking";
import { completePoints, MIN_POPULARITY, peakMonth, signalQuality } from "@/lib/seasonality";

type Props = {
  params: Promise<{ id: string; keywordId: string }>;
  searchParams: Promise<{ r?: string }>;
};

const RANGES = [30, 90, 180];

async function load({ params, searchParams }: Props) {
  const { id, keywordId } = await params;
  const { r } = await searchParams;
  const days = RANGES.includes(Number(r)) ? Number(r) : RANGES[0];
  const app = await loadApp(id);
  const detail = await getKeywordDetail(app, Number(keywordId), days);
  if (!detail) notFound();
  return { app, days, ...detail };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { keyword, app } = await load(props);
  return { title: `${keyword.term} · ${app.title}` };
}

const fmtAvg = (n: number | null) => (n == null ? "–" : `#${n.toFixed(1).replace(".", ",")}`);

export default async function KeywordPage(props: Props) {
  const { app, days, keyword, since, history, latest, annotations, metrics, trend } = await load(props);
  const official = app.store === "android" ? await getOfficialStats(app.id) : null;
  const officialTerm = official?.byTerm.get(keyword.term) ?? null;
  const peak = trend?.points ? peakMonth(trend.points, metrics.popularity) : null;
  const weakSignal = trend?.points ? !signalQuality(completePoints(trend.points)) : false;
  const end = today();
  const series = dailySeries(history, since, end);
  // Each check keeps its own depth (Google Play returns a different number of results per search);
  // the chart axis only needs the deepest one in the range.
  const depths = series.flatMap((p) => (p.depth != null ? [p.depth] : []));
  const depth = depths.length ? Math.max(...depths) : RANK_DEPTH;
  const weekAgo = latest ? history.find((h) => h.date === shiftDate(latest.date, -7)) : undefined;

  // Oldest first, numbered as they appear on the chart.
  const notes = [...annotations].reverse().map((a, i) => {
    const before = averagePosition(history, shiftDate(a.date, -ANNOTATION_WINDOW), shiftDate(a.date, -1));
    const after = averagePosition(history, shiftDate(a.date, 1), shiftDate(a.date, ANNOTATION_WINDOW));
    return { ...a, index: i + 1, before, after, complete: shiftDate(a.date, ANNOTATION_WINDOW) <= end };
  });

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Keyword
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{keyword.term}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StoreBadge store={app.store} country={app.country} />
            <span>{getCountry(app.country).name}</span>
          </div>
        </div>
        <dl className="flex flex-wrap gap-3">
          <Stat label="Posición hoy">
            <Position position={latest?.position ?? null} depth={latest?.depth ?? null} checked={latest != null} />
          </Stat>
          <Stat label="Cambio 7 días">
            <PositionChange change={positionChange(latest?.position, weekAgo?.position)} />
          </Stat>
          <Stat label="Popularidad (estimada)">
            {metrics.popularity ?? "–"}
          </Stat>
          {official && officialTerm && (
            <>
              <Stat label={`Visitantes · oficial, ${officialPeriod(official)}`}>{formatNumber(officialTerm.visitors)}</Stat>
              <Stat label={`Instalaciones · oficial, ${officialPeriod(official)}`}>{formatNumber(officialTerm.acquisitions)}</Stat>
            </>
          )}
          <Stat label="Dificultad">{metrics.difficulty != null ? `${difficultyLabel(metrics.difficulty)} · ${metrics.difficulty}` : "–"}</Stat>
          <Stat label="Oportunidad">{metrics.opportunity ?? "–"}</Stat>
          <Stat label="Mejor posición del periodo">
            {(() => {
              const best = Math.min(...history.filter((h) => h.date >= since && h.position != null).map((h) => h.position!));
              return Number.isFinite(best) ? `#${best}` : "–";
            })()}
          </Stat>
        </dl>
      </header>

      <Card aria-label="Evolución de la posición" className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">Posición de {app.title}</h2>
            <p className="text-[13px] text-muted">
              Arriba es mejor. Los huecos son días en los que la app no aparecía entre los resultados que devolvió la tienda o no se
              consultó.{" "}
              {app.store === "android"
                ? "Google Play suele devolver unos 30 resultados por búsqueda; la tabla indica cuántos hubo cada día."
                : "App Store devuelve hasta 200 resultados por búsqueda; la tabla indica cuántos hubo cada día."}
            </p>
          </div>
          <nav aria-label="Periodo" className="flex rounded-lg bg-surface-muted p-0.5">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`?r=${r}`}
                scroll={false}
                aria-current={r === days ? "true" : undefined}
                className={`inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-semibold ${
                  r === days ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
                }`}
              >
                {r} días
              </Link>
            ))}
          </nav>
        </div>
        {history.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            Todavía no hay posiciones. Se guardan cada día; pulsa «Actualizar posiciones» en la ficha de la app para la primera.
          </p>
        ) : (
          <>
            <RankChart data={series} markers={notes.filter((n) => n.date >= since).map(({ date, index }) => ({ date, index }))} depth={depth} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted">Ver los datos en tabla</summary>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-muted uppercase">
                      <th scope="col" className="py-1.5">Fecha</th>
                      <th scope="col" className="py-1.5">Posición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series
                      .filter((p) => p.state !== "none")
                      .reverse()
                      .map((p) => (
                        <tr key={p.date} className="border-t border-line">
                          <td className="py-1.5">{formatDate(p.date)}</td>
                          <td className="py-1.5 font-mono">{p.position != null ? `#${p.position}` : `> ${p.depth ?? depth}`}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Card>

      <Card aria-label="Interés en Google" className="p-5">
        <h2 className="text-[17px] font-semibold">Interés en Google · últimos 12 meses</h2>
        <p className="text-[13px] text-muted">
          Google Trends en {getCountry(app.country).name}, de 0 a 100 respecto al pico de esta misma keyword. No sirve para comparar keywords
          entre sí, pero sí para ver la estacionalidad.
          {metrics.prefixLength != null &&
            ` En ${app.store === "ios" ? "App Store" : "Google Play"} aparece en el autocompletado al escribir ${metrics.prefixLength} ${metrics.prefixLength === 1 ? "letra" : "letras"}.`}
        </p>
        {trend?.points && trend.points.length > 0 ? (
          <>
            {peak ? (
              <p className="mt-2 text-sm font-medium">Pico de interés en {peak}: prepara la ficha unas semanas antes.</p>
            ) : weakSignal ? (
              <p className="mt-2 text-sm text-muted">Sin datos suficientes: Google tiene muy poca señal para esta búsqueda, así que no se puede hablar de temporadas.</p>
            ) : metrics.popularity != null && metrics.popularity < MIN_POPULARITY ? (
              <p className="mt-2 text-sm text-muted">
                La popularidad en la tienda es menor de {MIN_POPULARITY}: aunque Google muestre subidas, no compensa preparar la ficha para ellas.
              </p>
            ) : null}
            <div className="mt-3">
              <TrendChart points={trend.points} />
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted">
            {trend?.error ? `Google Trends no respondió (${trend.error}). Se reintentará en la próxima consulta.` : "Se descargará en la próxima consulta diaria."}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-start gap-6">
        <Card aria-label="TOP 5" className="min-w-0 flex-[1_1_320px] overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[17px] font-semibold">TOP 5 {latest ? `del ${formatDate(latest.date)}` : ""}</h2>
          </div>
          {latest && latest.top5.length > 0 ? (
            <ol>
              {latest.top5.map((t, i) => {
                const mine = t.id === app.storeId;
                return (
                  <li key={t.id} className={`flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0 ${mine ? "bg-brand-soft" : ""}`}>
                    <span className="w-6 font-mono text-sm font-semibold text-muted">#{i + 1}</span>
                    <AppIcon src={t.icon} size={40} />
                    <div className="min-w-0 flex-1">
                      <a href={t.url} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:underline">
                        {t.title}
                      </a>
                      <div className="truncate text-[13px] text-muted">
                        {t.developer} · {formatRating(t.rating)}
                      </div>
                    </div>
                    {mine && <span className="text-xs font-semibold text-brand-strong">Tu app</span>}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="px-5 py-8 text-sm text-muted">Sin datos todavía.</p>
          )}
        </Card>

        <Card aria-label="Anotaciones" className="min-w-0 flex-[2_1_480px] p-5">
          <h2 className="text-[17px] font-semibold">Anotaciones</h2>
          <p className="mt-1 text-[13px] text-muted">
            Marca cambios de ficha, versiones o campañas. Comparamos la posición media de los {ANNOTATION_WINDOW} días anteriores y posteriores. Se
            comparten entre todas las keywords de la app.
          </p>
          <div className="mt-4">
            <AnnotationForm appId={app.id} defaultDate={end} />
          </div>
          {notes.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-wider text-muted uppercase">
                    <th scope="col" className="py-2 pr-2 font-semibold">#</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Fecha</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Cambio</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Media antes</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Media después</th>
                    <th scope="col" className="py-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[...notes].reverse().map((n) => (
                    <tr key={n.id} className="border-t border-line">
                      <td className="py-2 pr-2 font-mono font-semibold">{n.index}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(n.date)}</td>
                      <td className="py-2 pr-3">{n.label}</td>
                      <td className="py-2 pr-3 font-mono">{fmtAvg(n.before)}</td>
                      <td className="py-2 pr-3 font-mono">
                        {fmtAvg(n.after)}
                        {n.before != null && n.after != null && (
                          <PositionChange change={Math.round(n.before - n.after)} className="ml-2 text-xs" />
                        )}
                        {!n.complete && <div className="text-xs text-muted">Faltan días</div>}
                      </td>
                      <td className="py-2 text-right">
                        <form action={removeAnnotation}>
                          <input type="hidden" name="appId" value={app.id} />
                          <input type="hidden" name="annotationId" value={n.id} />
                          <button type="submit" aria-label={`Borrar anotación ${n.index}`} className="min-h-11 rounded-lg px-3 text-[13px] text-danger hover:bg-danger-soft">
                            Borrar
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-36 rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-semibold">{children}</dd>
    </div>
  );
}

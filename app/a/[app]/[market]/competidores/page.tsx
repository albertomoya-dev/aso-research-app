import { History, LineChart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { refreshCompetitors } from "@/app/competitor-actions";
import { AppIcon } from "@/components/app-icon";
import { CompetitorTable } from "@/components/competitor-table";
import { ListingChange } from "@/components/listing-change";
import { ShareChart } from "@/components/share-chart";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondary, Card, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { getCompetitorPage, SHARE_RANGES, type ShareDays } from "@/lib/competitor-queries";
import { formatDate } from "@/lib/format";
import { loadMarketParams, marketPath } from "@/lib/products";

// Mercado › Competidores (phase 31, REDISENO_UX §6.5): the share chart (30/90/180 days), the table with the
// share inside each row and the «Vigilar» switch, the competitor's panel and the timeline of listing changes.

type Props = { params: Promise<{ app: string; market: string }>; searchParams: Promise<{ dias?: string }> };

export const metadata: Metadata = { title: "Competidores" };

export default async function CompetitorsPage({ params, searchParams }: Props) {
  const app = await loadMarketParams(params);
  const { dias } = await searchParams;
  const days = (SHARE_RANGES.find((d) => String(d) === dias) ?? 30) as ShareDays;
  const data = await getCompetitorPage(app, { days });
  const basePath = marketPath(app);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Competidores"
        actions={
          data.followed.length > 0 && (
            <form action={refreshCompetitors}>
              <input type="hidden" name="appId" value={app.id} />
              <SubmitButton className={buttonSecondary} pendingLabel="Leyendo fichas…">
                Comprobar fichas ahora
              </SubmitButton>
            </form>
          )
        }
      >
        Quién ocupa el TOP 5 de tus {data.keywordCount} keywords y qué cambia en su ficha.
      </PageHeader>

      <Card aria-labelledby="share-title" className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="share-title" className="flex items-center gap-1 text-card-title font-semibold">
            Cuota de visibilidad en el TOP 5
            <HelpTip label="Cuota de visibilidad">
              Reparte cada keyword, según su popularidad, entre las cinco primeras posiciones, con más peso en las primeras. Tu app y las cuatro
              más fuertes; el resto va a «Otros».
            </HelpTip>
          </h2>
          <nav aria-label="Periodo del gráfico" className="flex rounded-control border border-line-strong p-0.5">
            {SHARE_RANGES.map((d) => (
              <Link
                key={d}
                href={marketPath(app, d === 30 ? "/competidores" : `/competidores?dias=${d}`)}
                scroll={false}
                aria-current={d === days ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-control px-3 text-[13px] font-medium md:min-h-7 ${
                  d === days ? "bg-surface-muted text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {d} días
              </Link>
            ))}
          </nav>
        </div>
        {data.history.length === 0 ? (
          <EmptyState
            icon={LineChart}
            title="Aún no hay posiciones"
            description={`Actualiza las posiciones para ver quién compite contigo en estos ${days} días.`}
          />
        ) : (
          <ShareChart series={data.series} points={data.history} />
        )}
      </Card>

      <section aria-labelledby="table-title" className="flex flex-col gap-3">
        <h2 id="table-title" className="flex items-center gap-1 text-card-title font-semibold">
          Apps en tu TOP 5
          <HelpTip label="Apps en tu TOP 5">
            Con la última posición guardada de cada keyword. Pulsa una fila para ver su ficha, sus cambios y las keywords que comparte contigo.
            «Vigilar» lee su ficha cada día.
          </HelpTip>
        </h2>
        <CompetitorTable appId={app.id} basePath={basePath} rows={data.rows} details={data.details} />
      </section>

      <Card aria-labelledby="changes-title" className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 id="changes-title" className="text-card-title font-semibold">
          Cambios en fichas vigiladas
        </h2>
        {data.followed.length === 0 ? (
          <EmptyState icon={History} title="No vigilas ninguna ficha" description="Activa «Vigilar» en una app de la tabla para ver aquí cada cambio de su ficha." />
        ) : data.changes.length === 0 ? (
          <EmptyState icon={History} title="Sin cambios todavía" description="Aparecerán aquí cuando un competidor vigilado actualice su ficha." />
        ) : (
          <ol aria-label="Línea de tiempo de cambios" className="flex flex-col">
            {data.changes.map((event) => (
              <li key={`${event.competitorId}-${event.date.toISOString()}`} className="relative grid gap-2 border-l border-line pb-5 pl-5 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)]">
                <span aria-hidden="true" className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-surface bg-line-strong" />
                <span className="flex items-start gap-2.5">
                  <AppIcon src={event.icon} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{event.title}</span>
                    <time dateTime={event.date.toISOString()} className="block text-label text-muted">
                      {formatDate(event.date)}
                    </time>
                  </span>
                </span>
                <ul className="flex min-w-0 flex-col gap-2 text-sm">
                  {event.changes.map((change) => (
                    <li key={change.field}>
                      <ListingChange change={change} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

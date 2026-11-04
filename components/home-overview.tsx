import { and, desc, gte, isNull } from "drizzle-orm";
import { Check, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getDb, schema } from "@/db";
import { flag } from "@/lib/app-nav";
import { getCountry } from "@/lib/countries";
import { healthSummary } from "@/lib/health";
import { getHomeOverview, HOME_DAYS, type HomeMarket, marketHealth } from "@/lib/home";
import { marketPath } from "@/lib/products";
import { shiftDate, today } from "@/lib/ranking";
import { whatToDoToday } from "@/lib/today";
import { AppIcon } from "./app-icon";
import { Card, PageHeader } from "./ui";
import { buttonVariants } from "./ui/button-variants";
import { DeltaBadge } from "./ui/delta-badge";
import { HelpTip } from "./ui/help-tip";
import { KpiCard } from "./ui/kpi-card";
import { Skeleton, SkeletonKpi, SkeletonTable, SkeletonText } from "./ui/skeleton";
import { Sparkline } from "./ui/sparkline";
import { StatusDot } from "./ui/status-dot";

// Inicio (phase 28): the KPIs of every market, one row per market and «Qué hacer hoy». The overview is
// one round of queries; each row's health and the task list stream in afterwards.

const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const num1 = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });

function Header({ action = true }: { action?: boolean }) {
  return (
    <PageHeader
      title="Inicio"
      actions={
        action && (
          <Link href="/apps/nueva" className={buttonVariants({ variant: "primary" })}>
            <Plus size={16} aria-hidden="true" /> Añadir app
          </Link>
        )
      }
    >
      Cómo van todas tus apps esta semana.
    </PageHeader>
  );
}

export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando el inicio">
      <Header />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
      <SkeletonTable rows={4} columns={7} />
    </div>
  );
}

export async function HomeOverview() {
  const { markets, kpis } = await getHomeOverview();
  if (markets.length === 0) return <HomeEmpty />;
  const versus = "en 7 días";
  return (
    <div className="flex flex-col gap-6">
      <Header />
      <section aria-label="Cifras de todas las apps" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="En el TOP 10" value={kpis.top10} delta={kpis.top10Change == null ? undefined : { delta: kpis.top10Change, noun: "keywords" }} hint={versus} />
        <KpiCard label="En el TOP 30" value={kpis.top30} delta={kpis.top30Change == null ? undefined : { delta: kpis.top30Change, noun: "keywords" }} hint={versus} />
        <KpiCard
          label="Visibilidad media"
          value={kpis.share == null ? "–" : pct(kpis.share)}
          delta={kpis.shareChange == null ? undefined : { delta: kpis.shareChange, unit: " pp", noun: "puntos" }}
          hint={versus}
          help={<HelpTip label="Visibilidad media">La media de tu cuota del TOP 5 en cada mercado, ponderada por popularidad.</HelpTip>}
        />
        <KpiCard
          label="Avisos sin leer"
          value={kpis.unread}
          hint={
            kpis.unread > 0 ? (
              <Link href="/actividad" className="text-link hover:underline">
                Ver en Actividad
              </Link>
            ) : (
              "Estás al día"
            )
          }
        />
      </section>

      <section aria-labelledby="markets-title" className="flex flex-col gap-3">
        <h2 id="markets-title" className="text-card-title font-semibold">
          Tus apps
        </h2>
        <MarketTable markets={markets} />
        <MarketCards markets={markets} />
      </section>

      <Card aria-labelledby="today-title" className="flex flex-col">
        <h2 id="today-title" className="border-b border-line px-4 py-3 text-card-title font-semibold sm:px-5">
          Qué hacer hoy
        </h2>
        <Suspense
          fallback={
            <div aria-busy="true" aria-label="Cargando las tareas" className="flex flex-col gap-4 p-5">
              {Array.from({ length: 3 }, (_, i) => (
                <SkeletonText key={i} lines={2} />
              ))}
            </div>
          }
        >
          <TodayList />
        </Suspense>
      </Card>
    </div>
  );
}

/* ---------- Markets ---------- */

const sparkLabel = (m: HomeMarket) => {
  const known = m.spark.filter((v): v is number => v != null);
  return known.length ? `Visibilidad de ${pct(known[0])} a ${pct(known.at(-1)!)} en ${HOME_DAYS} días` : "Sin histórico de visibilidad";
};

function TopPosition({ m }: { m: HomeMarket }) {
  const t = m.topPosition;
  if (t.mean == null) return <span className="text-muted">–</span>;
  return (
    <span className="font-mono">
      #{num1(t.mean)}
      {t.known < t.count && <span className="text-muted"> ({t.known}/{t.count})</span>}
    </span>
  );
}

function Rating({ m }: { m: HomeMarket }) {
  if (m.rating == null) return <span className="text-muted">–</span>;
  return (
    <span className="font-mono" aria-label={`Valoración ${num1(m.rating)} de 5`}>
      {m.rating.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ★
    </span>
  );
}

const th = "h-9 px-3 text-label font-medium whitespace-nowrap text-ink-soft first:pl-4 last:pr-4";
const td = "px-3 first:pl-4 last:pr-4";

/** Desktop and tablet: one row per market; the whole row opens its Resumen. */
function MarketTable({ markets }: { markets: HomeMarket[] }) {
  return (
    <div className="hidden overflow-hidden rounded-card border border-line bg-surface sm:block">
      <div className="relative overflow-x-auto">
        <table className="w-full text-table" aria-labelledby="markets-title">
          <thead className="bg-surface-muted">
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>
                App
              </th>
              <th scope="col" className={th}>
                Mercado
              </th>
              <th scope="col" className={th}>
                Visibilidad, {HOME_DAYS} días
              </th>
              <th scope="col" className={`${th} text-right`}>
                TOP 10
              </th>
              <th scope="col" className={`${th} text-right`}>
                TOP 30
              </th>
              <th scope="col" className={`${th} text-right`}>
                <span className="inline-flex items-center gap-0.5">
                  Pos. media
                  <HelpTip label="Posición media" side="bottom">
                    Las 5 keywords relevantes con más oportunidad. Las que están fuera de los resultados no cuentan en la media.
                  </HelpTip>
                </span>
              </th>
              <th scope="col" className={`${th} text-right`}>
                Valoración
              </th>
              <th scope="col" className={th}>
                Salud
              </th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.app.id} className="relative h-12 border-b border-line last:border-0 hover:bg-surface-muted/60" data-testid="home-market-row">
                <td className={td}>
                  <Link
                    href={marketPath(m.app)}
                    className="flex min-w-0 items-center gap-2.5 font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
                  >
                    <AppIcon src={m.productIcon} size={28} />
                    <span className="max-w-56 truncate">{m.productTitle}</span>
                  </Link>
                </td>
                <td className={`${td} whitespace-nowrap text-ink-soft`}>
                  <span aria-hidden="true">{flag(m.app.country)}</span> {getCountry(m.app.country).name}
                </td>
                <td className={td}>
                  <Sparkline values={m.spark} label={sparkLabel(m)} />
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <span className="font-mono">{m.top10}</span> {m.top10Change != null && <DeltaBadge delta={m.top10Change} noun="keywords" />}
                </td>
                <td className={`${td} text-right font-mono`}>{m.top30}</td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <TopPosition m={m} />
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <Rating m={m} />
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <Suspense fallback={<Skeleton className="h-3 w-24" />}>
                    <HealthDots market={m} />
                  </Suspense>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Below 640 px: one card per market. */
function MarketCards({ markets }: { markets: HomeMarket[] }) {
  return (
    <ul className="flex flex-col gap-3 sm:hidden">
      {markets.map((m) => (
        <li key={m.app.id}>
          <Link href={marketPath(m.app)} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 hover:bg-surface-muted/60">
            <span className="flex min-w-0 items-center gap-3">
              <AppIcon src={m.productIcon} size={36} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-ink">{m.productTitle}</span>
                <span className="text-[13px] text-ink-soft">
                  <span aria-hidden="true">{flag(m.app.country)}</span> {getCountry(m.app.country).name}
                </span>
              </span>
              <Sparkline values={m.spark} label={sparkLabel(m)} className="ml-auto shrink-0" />
            </span>
            <span className="grid grid-cols-4 gap-2 text-[13px]">
              <CardStat label="TOP 10">
                <span className="font-mono">{m.top10}</span> {m.top10Change != null && <DeltaBadge delta={m.top10Change} noun="keywords" />}
              </CardStat>
              <CardStat label="TOP 30">
                <span className="font-mono">{m.top30}</span>
              </CardStat>
              <CardStat label="Pos. media">
                <TopPosition m={m} />
              </CardStat>
              <CardStat label="Valoración">
                <Rating m={m} />
              </CardStat>
            </span>
            <Suspense fallback={<Skeleton className="h-3 w-24" />}>
              <HealthDots market={m} />
            </Suspense>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CardStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-label text-muted">{label}</span>
      <span className="truncate whitespace-nowrap">{children}</span>
    </span>
  );
}

/** The row's health in a few words; the reviews line (Google Play) is not asked here. */
async function HealthDots({ market }: { market: HomeMarket }) {
  let counts;
  try {
    counts = healthSummary((await marketHealth(market.app)).items);
  } catch {
    return <StatusDot status="unknown" label="Sin datos" />;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {counts.bad > 0 && <StatusDot status="bad" label={`${counts.bad} por atender`} />}
      {counts.warn > 0 && <StatusDot status="warn" label={`${counts.warn} ${counts.warn === 1 ? "mejorable" : "mejorables"}`} />}
      {counts.bad + counts.warn === 0 && <StatusDot status="good" label="En orden" />}
    </span>
  );
}

/* ---------- Qué hacer hoy ---------- */

async function TodayList() {
  const { markets } = await getHomeOverview();
  const [health, alerts] = await Promise.all([
    Promise.all(markets.map((m) => marketHealth(m.app).catch(() => null))),
    getDb()
      .select({
        appId: schema.alerts.appId,
        kind: schema.alerts.kind,
        tone: schema.alerts.tone,
        title: schema.alerts.title,
        keywordId: schema.alerts.keywordId,
        date: schema.alerts.date,
      })
      .from(schema.alerts)
      .where(and(isNull(schema.alerts.readAt), gte(schema.alerts.date, shiftDate(today(), -14))))
      .orderBy(desc(schema.alerts.date))
      .limit(100)
      // The list is a help, not the page: without alerts it still shows the health tasks.
      .catch(() => []),
  ]);
  const tasks = whatToDoToday({
    markets: markets.flatMap((m, i) =>
      health[i]
        ? [{ market: { id: m.app.id, productSlug: m.productSlug, title: m.productTitle, country: m.app.country }, health: health[i].items, seasons: health[i].seasons }]
        : [],
    ),
    alerts,
  });
  if (tasks.length === 0) {
    return (
      <p className="flex items-center gap-2 px-5 py-6 text-[13px] text-ink-soft">
        <Check size={16} aria-hidden="true" className="text-up" /> Nada urgente hoy.
      </p>
    );
  }
  return (
    <ol className="flex flex-col" data-testid="today-tasks">
      {tasks.map((t) => (
        <li key={t.key} data-severity={t.severity} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-start gap-2.5">
            <StatusDot status={t.severity === "info" ? "unknown" : t.severity} label={<span className="sr-only">{t.severity === "bad" ? "Necesita atención" : "Mejorable"}</span>} className="mt-1" />
            {/* The app on one line, the task on at most two (the whole text in `title`; the button opens the detail). */}
            <div className="min-w-0 text-[13px]">
              <p className="truncate font-medium text-ink">
                {t.market.title} · {t.market.country.toUpperCase()}
              </p>
              <p className="line-clamp-2 text-ink-soft" title={t.text}>
                {t.text}
              </p>
            </div>
          </div>
          <Link href={t.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t.action}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Empty ---------- */

/** No app yet: the search is the whole page. */
function HomeEmpty() {
  return (
    <div className="flex flex-col gap-6">
      <Header action={false} />
      <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface-muted text-ink-soft">
          <Search size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-card-title font-semibold">Empieza por tu app</h2>
          <p className="mt-1 text-[13px] text-ink-soft">Síguela y te diremos cada día cómo va en las búsquedas.</p>
        </div>
        <form action="/apps/nueva" method="get" role="search" className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
          <label htmlFor="home-search" className="sr-only">
            Busca tu app
          </label>
          <input
            id="home-search"
            type="search"
            name="q"
            required
            placeholder="Nombre, paquete o enlace de la tienda"
            className="min-h-12 flex-1 rounded-control border border-line-strong bg-surface px-4 text-body text-ink placeholder:text-muted focus:border-brand focus:outline-2 focus:outline-brand/40"
          />
          <button type="submit" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Buscar
          </button>
        </form>
      </Card>
    </div>
  );
}

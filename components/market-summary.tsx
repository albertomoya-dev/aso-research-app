import { and, desc, eq, gte } from "drizzle-orm";
import { ArrowDown, ArrowUp, Check, ChevronDown, Crown, Flag } from "lucide-react";
import Link from "next/link";
import { cache, Suspense } from "react";
import { getDb, schema } from "@/db";
import { describeMove, type WeekMove, weekPosition } from "@/lib/alerts";
import { getAnnotationsWithImpact } from "@/lib/annotation-queries";
import { getShareHistory, type ShareDays } from "@/lib/competitor-queries";
import type { HealthItem } from "@/lib/health";
import { loadReviewsItem } from "@/lib/health-queries";
import { competitionLine, marketHealth, marketRows, marketWeek, rowSnapshots, shareWeek, sortSteps } from "@/lib/home";
import { formatAggregateImpact } from "@/lib/impact";
import type { MarketApp } from "@/lib/products";
import { marketPath } from "@/lib/products";
import { shiftDate, today } from "@/lib/ranking";
import { firstSentence } from "@/lib/today";
import { Card } from "./ui";
import { buttonVariants } from "./ui/button-variants";
import { DeltaBadge } from "./ui/delta-badge";
import { HelpTip } from "./ui/help-tip";
import { KpiCard } from "./ui/kpi-card";
import { Skeleton, SkeletonChart, SkeletonKpi, SkeletonText } from "./ui/skeleton";
import { StatusDot } from "./ui/status-dot";
import { VisibilityChart } from "./visibility-chart";

// The sections of a market's Resumen (/a/[app]/[market]). Each one streams behind its own Suspense
// boundary; the keyword rows and the share history are loaded once per request and shared.

// share-chart.tsx is a client module: its SERIES_COLORS would arrive here as a reference, not the list.
const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

const shareHistory = cache((app: MarketApp, days: ShareDays) => getShareHistory(app, days));
const weekOf = cache(async (app: MarketApp) => marketWeek(rowSnapshots(await marketRows(app)), today()));

const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const dayFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDay = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

/* ---------- KPIs ---------- */

export function SummaryKpis({ app, days }: { app: MarketApp; days: ShareDays }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Cargando las cifras" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonKpi key={i} />
          ))}
        </div>
      }
    >
      <Kpis app={app} days={days} />
    </Suspense>
  );
}

async function Kpis({ app, days }: { app: MarketApp; days: ShareDays }) {
  const [rows, w, share] = await Promise.all([marketRows(app), weekOf(app), shareHistory(app, days)]);
  const top10 = rows.filter((r) => r.position != null && r.position <= 10).length;
  const top30 = rows.filter((r) => r.position != null && r.position <= 30).length;
  const own = share.keywordCount ? (share.current.find((r) => r.app.id === app.storeId)?.share ?? 0) : null;
  const before = shareWeek(share.history, app.storeId, today()).before;
  const shareDelta = own != null && before != null ? Math.round((own - before) * 10) / 10 : null;
  const versus = w.baselineDate ? `frente al ${shortDay(w.baselineDate)}` : "sin semana con la que comparar";
  const rating = app.meta.rating;
  const ratings = app.meta.ratingsCount;
  return (
    <section aria-label="Cifras de la semana" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label="Visibilidad"
        value={own == null ? "–" : pct(own)}
        delta={shareDelta == null ? undefined : { delta: shareDelta, unit: " pp", noun: "puntos" }}
        hint={versus}
        help={<HelpTip label="Visibilidad">Tu parte de los clics del TOP 5 en tus keywords, ponderada por popularidad.</HelpTip>}
      />
      <KpiCard label="En el TOP 10" value={top10} delta={w.top10Change == null ? undefined : { delta: w.top10Change, noun: "keywords" }} hint={`de ${rows.length} keywords`} />
      <KpiCard label="En el TOP 30" value={top30} delta={w.top30Change == null ? undefined : { delta: w.top30Change, noun: "keywords" }} hint={versus} />
      <KpiCard
        label="Valoración"
        value={rating == null ? "–" : rating.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        hint={ratings ? `${ratings.toLocaleString("es-ES")} valoraciones` : "Sin número de valoraciones"}
      />
    </section>
  );
}

/* ---------- Visibility chart ---------- */

export function VisibilitySection({ app, days, ranges }: { app: MarketApp; days: ShareDays; ranges: readonly ShareDays[] }) {
  return (
    <Card aria-labelledby="visibility-title" className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="visibility-title" className="text-card-title font-semibold">
          Visibilidad
        </h2>
        <nav aria-label="Periodo del gráfico" className="flex rounded-control border border-line-strong p-0.5">
          {ranges.map((d) => (
            <Link
              key={d}
              href={marketPath(app, d === 30 ? "" : `?dias=${d}`)}
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
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Visibility app={app} days={days} />
      </Suspense>
    </Card>
  );
}

async function Visibility({ app, days }: { app: MarketApp; days: ShareDays }) {
  const until = today();
  const from = shiftDate(until, -days);
  const [share, annotations] = await Promise.all([shareHistory(app, days), getAnnotationsWithImpact(app.id)]);
  const points = share.history.map((p) => ({ date: String(p.date), share: Number(p[app.storeId]) || 0 }));
  const markers = annotations
    .filter((a) => a.annotation.date >= from)
    .map((a) => ({ id: a.annotation.id, date: a.annotation.date, title: a.annotation.label, impact: formatAggregateImpact(a.aggregate) }));
  if (points.length === 0) {
    return <p className="py-10 text-center text-[13px] text-ink-soft">Aún no hay posiciones en estos {days} días.</p>;
  }
  const first = points[0].share;
  const last = points.at(-1)!.share;
  return (
    <>
      <VisibilityChart
        points={points}
        markers={markers}
        from={points.length > 1 ? points[0].date : from}
        to={until}
        label={`Tu cuota de visibilidad pasa del ${pct(first)} al ${pct(last)} en ${days} días${markers.length ? `, con ${markers.length} cambios marcados` : ""}.`}
      />
      {markers.length > 0 && (
        <ul aria-label="Cambios en el periodo" className="flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
          {markers.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
              <Flag size={12} aria-hidden="true" className="translate-y-0.5 text-ink-soft" />
              <span className="font-mono text-muted">{shortDay(m.date)}</span>
              <Link href={marketPath(app, "/cambios")} className="text-ink hover:underline">
                {m.title}
              </Link>
              <span className="text-ink-soft">· {m.impact}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- Próximos pasos ---------- */

export function NextSteps({ app }: { app: MarketApp }) {
  return (
    <Card aria-labelledby="steps-title" className="flex flex-col">
      <h2 id="steps-title" className="border-b border-line px-4 py-3 text-card-title font-semibold sm:px-5">
        Próximos pasos
      </h2>
      <Suspense
        fallback={
          <div aria-busy="true" aria-label="Cargando los próximos pasos" className="flex flex-col gap-4 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonText key={i} lines={2} />
            ))}
          </div>
        }
      >
        <Steps app={app} />
      </Suspense>
    </Card>
  );
}

async function Steps({ app }: { app: MarketApp }) {
  const [{ items }, reviews] = await Promise.all([marketHealth(app), loadReviewsItem(app)]);
  const { tasks, fine, noData } = sortSteps([...items, reviews]);
  return (
    <>
      {tasks.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-[13px] text-ink-soft">
          <Check size={16} aria-hidden="true" className="text-up" /> Nada urgente: todo está en orden.
        </p>
      ) : (
        <ol className="flex flex-col">
          {tasks.map((item) => (
            <Step key={item.id} item={item} />
          ))}
        </ol>
      )}
      {fine.length + noData.length > 0 && (
        <details className="group border-t border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[13px] text-ink-soft hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
            <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" />
            {fine.length} en orden{noData.length > 0 && ` · ${noData.length} sin datos`}
          </summary>
          <ul className="flex flex-col pb-2">
            {[...fine, ...noData].map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-1.5 sm:px-5">
                <StatusDot status={item.status} label={item.label} />
                <span className="font-mono text-label text-muted">{item.value}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Step({ item }: { item: HealthItem }) {
  return (
    <li className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <StatusDot status={item.status} label={<span className="font-medium text-ink">{item.label}</span>} />
          <span className="font-mono text-label text-muted">{item.value}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-ink-soft">{firstSentence(item.hint)}.</p>
      </div>
      {item.href && item.action && (
        <Link href={item.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {item.action}
        </Link>
      )}
    </li>
  );
}

/* ---------- Movimientos ---------- */

export function Movements({ app }: { app: MarketApp }) {
  return (
    <Card aria-labelledby="moves-title" className="flex flex-col">
      <h2 id="moves-title" className="border-b border-line px-4 py-3 text-card-title font-semibold sm:px-5">
        Movimientos de la semana
      </h2>
      <Suspense
        fallback={
          <div aria-busy="true" aria-label="Cargando los movimientos" className="grid gap-4 p-5 sm:grid-cols-2">
            <SkeletonText lines={5} />
            <SkeletonText lines={5} />
          </div>
        }
      >
        <MovementLists app={app} />
      </Suspense>
    </Card>
  );
}

const newLeaders = cache((appId: number) =>
  getDb()
    .select({ id: schema.alerts.id, title: schema.alerts.title, detail: schema.alerts.detail, date: schema.alerts.date, tone: schema.alerts.tone, keywordId: schema.alerts.keywordId })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.appId, appId), eq(schema.alerts.kind, "new_leader"), gte(schema.alerts.date, shiftDate(today(), -7))))
    .orderBy(desc(schema.alerts.date), desc(schema.alerts.id))
    .limit(5),
);

async function MovementLists({ app }: { app: MarketApp }) {
  const [w, leaders] = await Promise.all([weekOf(app), newLeaders(app.id)]);
  if (!w.baselineDate) {
    return <p className="px-5 py-6 text-[13px] text-ink-soft">Aún no hay una semana de posiciones con la que comparar.</p>;
  }
  return (
    <div className="flex flex-col">
      <div className="grid sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        <MoveList app={app} title="Suben" icon="up" moves={w.week.gainers} empty="Ninguna sube esta semana." />
        <MoveList app={app} title="Bajan" icon="down" moves={w.week.losers} empty="Ninguna baja esta semana." />
      </div>
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <h3 className="flex items-center gap-1.5 text-label font-medium text-ink-soft">
          <Crown size={14} aria-hidden="true" /> Nuevos nº 1 donde compites
        </h3>
        {leaders.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">Ningún cambio de nº 1 esta semana.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5 text-[13px]">
            {leaders.map((l) => (
              <li key={l.id} className="min-w-0">
                <span className={l.tone === "up" ? "font-medium text-up" : l.tone === "down" ? "font-medium text-down" : "text-ink"}>{l.title}</span>
                <span className="wrap-break-word text-ink-soft"> · {l.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MoveList({ app, title, icon, moves, empty }: { app: MarketApp; title: string; icon: "up" | "down"; moves: WeekMove[]; empty: string }) {
  const Icon = icon === "up" ? ArrowUp : ArrowDown;
  return (
    <div className="flex min-w-0 flex-col px-4 py-3 sm:px-5 even:border-line max-sm:even:border-t sm:max-lg:even:border-l lg:max-2xl:even:border-t 2xl:even:border-l">
      <h3 className="flex items-center gap-1.5 text-label font-medium text-ink-soft">
        <Icon size={14} aria-hidden="true" className={icon === "up" ? "text-up" : "text-down"} /> {title}
      </h3>
      {moves.length === 0 ? (
        <p className="mt-1 text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {moves.map((m) => (
            <li key={m.keywordId} className="flex min-h-9 items-center justify-between gap-3 text-[13px]">
              <Link href={marketPath(app, `/keywords/${m.keywordId}`)} className="min-w-0 truncate text-ink hover:underline">
                {m.term}
              </Link>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-ink-soft" aria-label={describeMove(m)}>
                  {weekPosition(m.before, m.beforeDepth)} → {weekPosition(m.now, m.nowDepth)}
                </span>
                <DeltaBadge delta={m.movement === "move" ? m.change : undefined} status={m.movement === "move" ? undefined : m.movement} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Competencia ---------- */

export function Competition({ app, days }: { app: MarketApp; days: ShareDays }) {
  return (
    <Suspense fallback={<SkeletonChart height={16} />}>
      <CompetitionBar app={app} days={days} />
    </Suspense>
  );
}

async function CompetitionBar({ app, days }: { app: MarketApp; days: ShareDays }) {
  const share = await shareHistory(app, days);
  if (share.keywordCount === 0) return null;
  const { shown, rest } = competitionLine(share.current, app.storeId);
  // The same colour each app has on Competidores: its place in the chart's series.
  const color = (id: string, own: boolean) => {
    if (own) return "var(--series-own)";
    const i = share.series.findIndex((s) => s.id === id);
    return SERIES_COLORS[i >= 0 ? i : SERIES_COLORS.length - 1];
  };
  return (
    <Card aria-labelledby="competition-title" className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="competition-title" className="text-card-title font-semibold">
          Competencia
        </h2>
        <Link href={marketPath(app, "/competidores")} className="text-[13px] text-link hover:underline">
          Ver competidores →
        </Link>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
        {shown.map((s) => (
          <span key={s.id} className="h-full" style={{ width: `${s.share}%`, background: color(s.id, s.own) }} />
        ))}
        {rest > 0 && <span className="h-full bg-line-strong" style={{ width: `${rest}%` }} />}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-soft">
        {shown.map((s) => (
          <span key={s.id} className="inline-flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color(s.id, s.own) }} />
            <span className={`max-w-48 truncate ${s.own ? "font-semibold text-ink" : ""}`}>{s.title}</span>
            <span className="font-mono">{Math.round(s.share)} %</span>
          </span>
        ))}
      </p>
    </Card>
  );
}

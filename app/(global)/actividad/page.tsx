import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { CalendarClock, FileText, Inbox, TrendingDown, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { markAlertsRead, saveAlertPrefs } from "@/app/alert-actions";
import { AlertPrefsDialog } from "@/components/alert-prefs-dialog";
import { AppIcon } from "@/components/app-icon";
import { SendSummaryButton } from "@/components/send-summary-button";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondary, Card, inputClass, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { WeeklyCards, WeeklyCompact } from "@/components/weekly-summary";
import { getDb, hasDatabase, schema } from "@/db";
import {
  ACTIVITY_PERIODS,
  ACTIVITY_TYPES,
  activityDays,
  type ActivityFilters,
  activityHref,
  annotationSourcesForType,
  annotationSummary,
  kindsForType,
  parseActivityFilters,
  periodStart,
  typeOfKind,
} from "@/lib/activity";
import { loadAlertPrefs, prefsFor } from "@/lib/alert-jobs";
import { ALERT_KIND_GROUPS, alertPriority } from "@/lib/alerts";
import { cn } from "@/lib/cn";
import { getCountry } from "@/lib/countries";
import { emailConfigured } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { marketPath } from "@/lib/market-path";
import { today } from "@/lib/ranking";
import { getWeeklySummaries } from "@/lib/summary";

export const metadata: Metadata = { title: "Actividad" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-11 items-center rounded-full border px-3 text-table font-medium md:min-h-8",
    active ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-muted",
  );

function Chips<T>({ label, items, active, href }: { label: string; items: { id: T; label: string }[]; active: T; href: (id: T) => string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link key={String(item.id)} href={href(item.id)} aria-current={item.id === active ? "true" : undefined} className={chip(item.id === active)} scroll={false}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function ActivityPage({ searchParams }: Props) {
  if (!hasDatabase()) return null;
  const filters = parseActivityFilters(await searchParams);
  const db = getDb();
  const apps = await db
    .select({ id: schema.apps.id, title: schema.apps.title, icon: schema.apps.icon, country: schema.apps.country, productSlug: schema.products.slug })
    .from(schema.apps)
    .innerJoin(schema.products, eq(schema.products.id, schema.apps.productId))
    .orderBy(schema.apps.title, schema.apps.id);
  const label = (a: (typeof apps)[number]) => (apps.filter((x) => x.title === a.title).length > 1 ? `${a.title} · ${getCountry(a.country).name}` : a.title);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Actividad"
        actions={
          <>
            {filters.view === "semana" && emailConfigured() && <SendSummaryButton />}
            <Suspense fallback={null}>
              <MarkRead filters={filters} />
            </Suspense>
            {apps.length > 0 && (
              <Suspense fallback={null}>
                <PrefsDialog apps={apps.map((a) => ({ id: a.id, icon: a.icon, label: label(a) }))} />
              </Suspense>
            )}
          </>
        }
      >
        Lo que ha cambiado en tus apps: posiciones, competidores, temporadas y tu ficha.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Chips
          label="Vista"
          items={[
            { id: "feed" as const, label: "Novedades" },
            { id: "semana" as const, label: "Resumen semanal" },
          ]}
          active={filters.view}
          href={(view) => activityHref(filters, { view })}
        />
        {filters.view === "feed" && (
          <>
            <Chips label="Periodo" items={ACTIVITY_PERIODS.map((p) => ({ id: p.id, label: p.label }))} active={filters.period} href={(period) => activityHref(filters, { period })} />
            <Chips
              label="Tipo"
              items={[{ id: null, label: "Todo" }, ...ACTIVITY_TYPES.map((t) => ({ id: t.id as string | null, label: t.label }))]}
              active={filters.type}
              href={(type) => activityHref(filters, { type })}
            />
          </>
        )}
      </div>
      {filters.view === "feed" && apps.length > 1 && (
        <Chips
          label="App"
          items={[{ id: null, label: "Todas las apps" }, ...apps.map((a) => ({ id: a.id as number | null, label: label(a) }))]}
          active={filters.appId}
          href={(appId) => activityHref(filters, { appId })}
        />
      )}

      {filters.view === "semana" ? (
        <Suspense fallback={<SkeletonTable rows={4} />}>
          <WeeklyFull />
        </Suspense>
      ) : (
        <>
          <Suspense fallback={<SkeletonTable rows={3} />}>
            <WeeklyHeader appId={filters.appId} />
          </Suspense>
          <Feed filters={filters} apps={apps} />
        </>
      )}
    </div>
  );
}

async function WeeklyHeader({ appId }: { appId: number | null }) {
  const { apps } = await getWeeklySummaries();
  return <WeeklyCompact apps={appId ? apps.filter((a) => a.app.id === appId) : apps} />;
}

async function WeeklyFull() {
  const { since, until, apps } = await getWeeklySummaries();
  return (
    <>
      <p className="text-table text-ink-soft">
        Del {formatDate(since)} al {formatDate(until)}: última posición de cada keyword frente a la de hace una semana.
      </p>
      {apps.length === 0 ? <EmptyState icon={Inbox} title="Aún no sigues ninguna app" description="Añade una app para ver su resumen de la semana." /> : <WeeklyCards apps={apps} />}
    </>
  );
}

async function MarkRead({ filters }: { filters: ActivityFilters }) {
  const db = getDb();
  const unread = await db.$count(schema.alerts, and(isNull(schema.alerts.readAt), filters.appId ? eq(schema.alerts.appId, filters.appId) : undefined));
  if (unread === 0) return null;
  return (
    <form action={markAlertsRead}>
      {filters.appId && <input type="hidden" name="appId" value={filters.appId} />}
      <SubmitButton className={buttonSecondary} pendingLabel="Marcando…">
        Marcar {unread === 1 ? "1 como leída" : `${unread} como leídas`}
      </SubmitButton>
    </form>
  );
}

async function PrefsDialog({ apps }: { apps: { id: number; icon: string; label: string }[] }) {
  const prefs = await loadAlertPrefs();
  return (
    <AlertPrefsDialog>
      {apps.map((a) => {
        const p = prefsFor(prefs, a.id);
        return (
          <Card key={a.id} className="p-4">
            <form action={saveAlertPrefs} className="flex flex-col gap-3" aria-label={`Avisos de ${a.label}`}>
              <input type="hidden" name="appId" value={a.id} />
              <div className="flex items-center gap-2 font-semibold">
                <AppIcon src={a.icon} size={20} />
                {a.label}
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-label text-muted">Tipos de aviso</legend>
                {ALERT_KIND_GROUPS.map((g) => (
                  <label key={g.id} className="flex min-h-11 items-center gap-2.5 text-table md:min-h-8">
                    <input type="checkbox" name="group" value={g.id} defaultChecked={g.kinds.some((k) => p.kinds.includes(k))} className="size-5 accent-[var(--brand)]" />
                    {g.label}
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-col gap-1.5">
                <span className="text-label text-muted">Movimientos solo en keywords con relevancia desde</span>
                <select name="minRelevance" defaultValue={p.minRelevance} className={inputClass}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "1 (todas)" : n}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton className={`${buttonSecondary} self-start`} pendingLabel="Guardando…">
                Guardar
              </SubmitButton>
            </form>
          </Card>
        );
      })}
    </AlertPrefsDialog>
  );
}

const TYPE_ICON = { posicion: TrendingUp, competidor: Users, temporada: CalendarClock, ficha: FileText } as const;
const typeLabel = (type: string) => ACTIVITY_TYPES.find((t) => t.id === type)?.label;

async function Feed({ filters, apps }: { filters: ActivityFilters; apps: { id: number; title: string; icon: string; country: string; productSlug: string }[] }) {
  const kinds = kindsForType(filters.type);
  const sources = annotationSourcesForType(filters.type);
  const since = periodStart(filters.period, today());
  const db = getDb();
  const [rows, notes] = await Promise.all([
    kinds?.length === 0
      ? []
      : db
          .select()
          .from(schema.alerts)
          .where(
            and(
              gte(schema.alerts.date, since),
              filters.appId ? eq(schema.alerts.appId, filters.appId) : undefined,
              kinds ? inArray(schema.alerts.kind, kinds) : undefined,
            ),
          )
          .orderBy(desc(schema.alerts.date), desc(schema.alerts.id))
          .limit(300),
    // «Ficha»: the own listing changed in the store or was published from Rankeo (automatic annotations).
    sources.length === 0
      ? []
      : db
          .select({ id: schema.annotations.id, appId: schema.annotations.appId, date: schema.annotations.date, label: schema.annotations.label, source: schema.annotations.source, detail: schema.annotations.detail })
          .from(schema.annotations)
          .where(
            and(
              gte(schema.annotations.date, since),
              filters.appId ? eq(schema.annotations.appId, filters.appId) : undefined,
              inArray(schema.annotations.source, sources),
            ),
          )
          .orderBy(desc(schema.annotations.date), desc(schema.annotations.id))
          .limit(100),
  ]);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const byDate = activityDays(rows, notes, alertPriority);

  if (byDate.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="Nada en este periodo"
          description="Los avisos se crean cada día al consultar las posiciones, y los cambios de tu ficha al leerla de la tienda."
        />
      </Card>
    );
  }
  return byDate.map(([date, items]) => (
    <section key={date} aria-label={formatDate(date)}>
      <h2 className="mb-2 text-table font-semibold text-muted">{formatDate(date)}</h2>
      <Card className="overflow-hidden">
        <ul>
          {items.map((item) => {
            if (item.type === "annotation") {
              const note = item.annotation;
              const app = appById.get(note.appId);
              return (
                <li key={`n${note.id}`} className="border-b border-line last:border-0">
                  <Link href={app ? marketPath(app, "/cambios") : "/actividad"} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-muted">
                    <FileText size={16} role="img" aria-label={typeLabel("ficha")} className="mt-0.5 shrink-0 text-link" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-ink-soft">{note.label}</span>
                      <span className="block text-table text-muted">{annotationSummary(note.source, note.detail)}</span>
                    </span>
                    {app && (
                      <span className="hidden shrink-0 items-center gap-2 text-table text-muted sm:flex">
                        <AppIcon src={app.icon} size={20} />
                        {app.title} · {app.country.toUpperCase()}
                      </span>
                    )}
                  </Link>
                </li>
              );
            }
            const alert = item.alert;
            const app = appById.get(alert.appId);
            const type = typeOfKind(alert.kind);
            const Icon = type === "posicion" && alert.tone === "down" ? TrendingDown : TYPE_ICON[type as keyof typeof TYPE_ICON];
            const tone = alert.tone === "up" ? "text-up" : alert.tone === "down" ? "text-down" : "text-link";
            const href = !app
              ? "/actividad"
              : alert.keywordId
                ? marketPath(app, `/keywords/${alert.keywordId}`)
                : alert.competitorId
                  ? marketPath(app, "/competidores")
                  : marketPath(app);
            return (
              <li key={alert.id} className="border-b border-line last:border-0">
                <Link href={href} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-muted">
                  <Icon size={16} role="img" aria-label={typeLabel(type)} className={cn("mt-0.5 shrink-0", tone)} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-body", alert.readAt ? "text-ink-soft" : "font-semibold")}>{alert.title}</span>
                    <span className="block text-table text-muted">{alert.detail}</span>
                  </span>
                  {app && (
                    <span className="hidden shrink-0 items-center gap-2 text-table text-muted sm:flex">
                      <AppIcon src={app.icon} size={20} />
                      {app.title} · {app.country.toUpperCase()}
                    </span>
                  )}
                  {!alert.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" role="img" aria-label="Sin leer" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  ));
}

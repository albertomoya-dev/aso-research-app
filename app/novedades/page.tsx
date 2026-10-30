import { and, desc, eq, gte } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { markAlertsRead, saveAlertPrefs } from "@/app/alert-actions";
import { AppIcon } from "@/components/app-icon";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondary, Card, inputClass, PageHeader } from "@/components/ui";
import { getDb, hasDatabase, schema } from "@/db";
import { loadAlertPrefs, prefsFor } from "@/lib/alert-jobs";
import { ALERT_KIND_GROUPS, alertPriority } from "@/lib/alerts";
import { formatDate } from "@/lib/format";
import { shiftDate, today } from "@/lib/ranking";

export const metadata: Metadata = { title: "Novedades" };
export const dynamic = "force-dynamic";

const DAYS = 30;
const TONE = {
  up: { icon: "▲", label: "Mejora", className: "text-up" },
  down: { icon: "▼", label: "Empeora", className: "text-down" },
  info: { icon: "●", label: "Aviso", className: "text-link" },
} as const;

type Props = { searchParams: Promise<{ app?: string }> };

export default async function AlertsPage({ searchParams }: Props) {
  if (!hasDatabase()) return null;
  const appFilter = Number((await searchParams).app) || null;
  const db = getDb();
  const [apps, rows, prefs] = await Promise.all([
    db.select({ id: schema.apps.id, title: schema.apps.title, icon: schema.apps.icon }).from(schema.apps).orderBy(schema.apps.title),
    db
      .select()
      .from(schema.alerts)
      .where(and(gte(schema.alerts.date, shiftDate(today(), -DAYS)), appFilter ? eq(schema.alerts.appId, appFilter) : undefined))
      .orderBy(desc(schema.alerts.date), desc(schema.alerts.id))
      .limit(300),
    loadAlertPrefs(),
  ]);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const unread = rows.filter((r) => !r.readAt).length;
  // Within a day, what happened to our app goes first; rows arrive newest day first.
  const byDate = new Map(
    [...Map.groupBy(rows, (r) => r.date)].map(([date, items]) => [date, items.toSorted((a, b) => alertPriority(a) - alertPriority(b) || b.id - a.id)]),
  );
  const prefApps = appFilter ? apps.filter((a) => a.id === appFilter) : apps;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Novedades">
          Primero lo que le pasa a tu app (entra o sale del TOP 10, sube o baja 5 puestos o más, deja de aparecer); después los cambios de
          nº 1 donde compites (estás entre los 30 primeros o el nº 1 es un competidor vigilado), agrupados en un aviso por día, y los cambios
          en las fichas que vigilas. Las keywords de relevancia baja solo avisan de entradas y salidas del TOP 10. Últimos {DAYS} días.
        </PageHeader>
        {unread > 0 && (
          <form action={markAlertsRead}>
            {appFilter && <input type="hidden" name="appId" value={appFilter} />}
            <SubmitButton className={buttonSecondary} pendingLabel="Marcando…">
              Marcar {unread === 1 ? "1 como leída" : `${unread} como leídas`}
            </SubmitButton>
          </form>
        )}
      </div>

      {apps.length > 1 && (
        <nav aria-label="Filtrar por app" className="flex flex-wrap gap-2">
          {[{ id: null, title: "Todas" }, ...apps].map((a) => {
            const active = a.id === appFilter;
            return (
              <Link
                key={a.id ?? "all"}
                href={a.id ? `/novedades?app=${a.id}` : "/novedades"}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-medium ${
                  active ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-muted"
                }`}
              >
                {a.title}
              </Link>
            );
          })}
        </nav>
      )}

      {prefApps.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Qué avisos quieres recibir</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {prefApps.map((a) => {
              const p = prefsFor(prefs, a.id);
              return (
                <Card key={a.id} className="p-5">
                  <form action={saveAlertPrefs} className="flex flex-col gap-3" aria-label={`Avisos de ${a.title}`}>
                    <input type="hidden" name="appId" value={a.id} />
                    <div className="flex items-center gap-2 font-semibold">
                      <AppIcon src={a.icon} size={20} />
                      {a.title}
                    </div>
                    <fieldset className="flex flex-col gap-1.5">
                      <legend className="mb-1.5 text-xs text-muted">Tipos de aviso</legend>
                      {ALERT_KIND_GROUPS.map((g) => (
                        <label key={g.id} className="flex min-h-11 items-center gap-2.5 md:min-h-8">
                          <input
                            type="checkbox"
                            name="group"
                            value={g.id}
                            defaultChecked={g.kinds.some((k) => p.kinds.includes(k))}
                            className="size-5 accent-[var(--brand)]"
                          />
                          {g.label}
                        </label>
                      ))}
                    </fieldset>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted">
                        Subidas, bajadas, salidas de los resultados y cambios de nº 1 solo en keywords con relevancia desde (las que aún no tienen relevancia cuentan)
                      </span>
                      <select name="minRelevance" defaultValue={p.minRelevance} className={inputClass}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? "1 (todas)" : n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-xs text-muted">Se aplica desde la próxima consulta de posiciones; los avisos ya creados no cambian.</p>
                    <SubmitButton className={`${buttonSecondary} self-start`} pendingLabel="Guardando…">
                      Guardar
                    </SubmitButton>
                  </form>
                </Card>
              );
            })}
          </div>
        </details>
      )}

      {rows.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-muted">
          Sin novedades. Se generan cada día al consultar las posiciones, comparando con la consulta anterior.
        </Card>
      ) : (
        [...byDate].map(([date, items]) => (
          <section key={date} aria-label={formatDate(date)}>
            <h2 className="mb-2 text-sm font-semibold text-muted">{formatDate(date)}</h2>
            <Card className="overflow-hidden">
              <ul>
                {items.map((alert) => {
                  const app = appById.get(alert.appId);
                  const tone = TONE[alert.tone];
                  const href = alert.keywordId
                    ? `/apps/${alert.appId}/keywords/${alert.keywordId}`
                    : alert.competitorId
                      ? `/apps/${alert.appId}/competidores`
                      : `/apps/${alert.appId}`;
                  return (
                    <li key={alert.id} className="border-b border-line last:border-0">
                      <Link href={href} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-muted/60">
                        <span className={`mt-0.5 w-4 shrink-0 text-center text-sm ${tone.className}`} aria-label={tone.label}>
                          {tone.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${alert.readAt ? "text-ink-soft" : "font-semibold"}`}>{alert.title}</span>
                          <span className="block text-[13px] text-muted">{alert.detail}</span>
                        </span>
                        {app && (
                          <span className="hidden shrink-0 items-center gap-2 text-[13px] text-muted sm:flex">
                            <AppIcon src={app.icon} size={20} />
                            {app.title}
                          </span>
                        )}
                        {!alert.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Sin leer" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

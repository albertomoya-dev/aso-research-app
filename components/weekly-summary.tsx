import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { StoreBadge } from "@/components/store-badge";
import { Card } from "@/components/ui";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { describeMove, weekPosition } from "@/lib/alerts";
import { getCountry } from "@/lib/countries";
import { formatDay } from "@/lib/format";
import { marketPath } from "@/lib/market-path";
import { type AppWeek, competitorChanges } from "@/lib/summary";

// The weekly summary of every market (lib/summary.ts), shown on /actividad: compact as its header,
// full with `?vista=semana` (the old /resumen page).

const pct = (v: number | null) => (v == null ? "–" : `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-control bg-surface-muted px-3.5 py-2.5">
      <div className="text-label text-muted">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
      {sub && <div className="text-label text-muted">{sub}</div>}
    </div>
  );
}

/** One row per market: what moved this week, in a table that scrolls inside its card on phones. */
export function WeeklyCompact({ apps }: { apps: AppWeek[] }) {
  if (apps.length === 0) return null;
  return (
    <Card aria-label="Resumen de la semana" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-table">
          <caption className="sr-only">Resumen de la semana por app</caption>
          <thead>
            <tr className="border-b border-line bg-surface-muted text-left text-label text-muted">
              <th scope="col" className="px-4 py-2 font-medium">App</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Suben / bajan</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">TOP 10</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Cuota</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Competidores</th>
            </tr>
          </thead>
          <tbody>
            {apps.map(({ app, week, baselineDate, share, shareBefore, alerts }) => {
              const shareDelta = share != null && shareBefore != null ? Math.round((share - shareBefore) * 10) / 10 : null;
              return (
                <tr key={app.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <Link href={marketPath(app)} className="flex min-h-9 items-center gap-2 hover:underline">
                      <AppIcon src={app.icon} size={20} />
                      <span className="truncate font-medium">{app.title}</span>
                      <span className="text-muted">· {getCountry(app.country).name}</span>
                    </Link>
                  </th>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className="text-up">▲{week.improved}</span> <span className="text-down">▼{week.worsened}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {week.top10}
                    {baselineDate && <span className="text-muted"> (antes {week.top10Before})</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {pct(share)} {shareDelta != null && <DeltaBadge delta={shareDelta} noun="puntos" />}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{competitorChanges(alerts).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** The full weekly summary: one card per market with its numbers and the keywords that moved most. */
export function WeeklyCards({ apps }: { apps: AppWeek[] }) {
  return (
    <>
      {apps.map(({ app, week, baselineDate, share, shareBefore, alerts }) => {
        const shareDelta = share != null && shareBefore != null ? share - shareBefore : null;
        const changes = competitorChanges(alerts).length;
        return (
          <Card key={app.id} aria-label={`${app.title} · ${getCountry(app.country).name}`} className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href={marketPath(app)} className="flex items-center gap-3 hover:underline">
                <AppIcon src={app.icon} size={36} />
                <span className="text-card-title font-semibold">{app.title}</span>
                <span className="text-muted">· {getCountry(app.country).name}</span>
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-muted">
                  {baselineDate ? `Frente al ${formatDay(baselineDate)}` : "Aún no hay una consulta anterior con la que comparar"}
                </span>
                <StoreBadge store={app.store} country={app.country} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat
                label="Suben / bajan"
                value={`${week.improved} / ${week.worsened}`}
                sub={
                  week.noBaseline > 0
                    ? `de ${week.tracked} keywords; ${week.noBaseline} ${week.noBaseline === 1 ? "nueva" : "nuevas"} sin comparación`
                    : `de ${week.tracked} keywords`
                }
              />
              <Stat label="En el TOP 10" value={String(week.top10)} sub={baselineDate ? `antes ${week.top10Before}` : undefined} />
              <Stat
                label="Cuota de visibilidad"
                value={pct(share)}
                sub={
                  shareDelta == null ? (
                    "sin una consulta anterior"
                  ) : (
                    <span className={shareDelta > 0 ? "text-up" : shareDelta < 0 ? "text-down" : ""}>
                      {shareDelta > 0 ? "+" : ""}
                      {shareDelta.toLocaleString("es-ES", { maximumFractionDigits: 1 })} puntos
                    </span>
                  )
                }
              />
              <Stat label="Cambios de competidores" value={String(changes)} />
            </div>
            {(week.gainers.length > 0 || week.losers.length > 0) && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  { title: "Más suben", rows: week.gainers, className: "text-up", icon: "▲" },
                  { title: "Más bajan", rows: week.losers, className: "text-down", icon: "▼" },
                ].map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-1.5 text-[13px] font-semibold text-ink-soft">{group.title}</h3>
                    {group.rows.length === 0 ? (
                      <p className="text-[13px] text-muted">Ninguna.</p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-sm">
                        {group.rows.map((r) => (
                          <li key={r.keywordId} className="flex items-center justify-between gap-3">
                            <Link href={marketPath(app, `/keywords/${r.keywordId}`)} className="truncate hover:underline">
                              {r.term}
                            </Link>
                            <span className="shrink-0 font-mono text-[13px]">
                              {weekPosition(r.before, r.beforeDepth)} → {weekPosition(r.now, r.nowDepth)}{" "}
                              <span className={group.className}>
                                {group.icon}
                                {r.movement === "move" ? ` ${Math.abs(r.change)}` : <span className="font-sans"> {describeMove(r)}</span>}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

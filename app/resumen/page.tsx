import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { SendSummaryButton } from "@/components/send-summary-button";
import { StoreBadge } from "@/components/store-badge";
import { Card, PageHeader } from "@/components/ui";
import { hasDatabase } from "@/db";
import { emailConfigured } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { getWeeklySummaries } from "@/lib/summary";

export const metadata: Metadata = { title: "Resumen semanal" };
export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "–" : `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`);
const position = (p: number | null) => (p == null ? "fuera" : `#${p}`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-muted px-3.5 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default async function SummaryPage() {
  if (!hasDatabase()) return null;
  const { since, until, apps } = await getWeeklySummaries();
  const email = emailConfigured();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Resumen semanal">
          Del {formatDate(since)} al {formatDate(until)}: última posición de cada keyword frente a la de hace una semana.
          {email ? " Te llega por email cada lunes." : " Para recibirlo por email cada lunes, configura RESEND_API_KEY y ALERT_EMAIL."}
        </PageHeader>
        {email && <SendSummaryButton />}
      </div>

      {apps.length === 0 && <Card className="px-5 py-10 text-center text-sm text-muted">Aún no sigues ninguna app.</Card>}

      {apps.map(({ app, week, share, shareBefore, alerts }) => {
        const shareDelta = share != null && shareBefore != null ? share - shareBefore : null;
        const competitorChanges = alerts.filter((a) => a.tone === "info").length;
        return (
          <Card key={app.id} aria-label={app.title} className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href={`/apps/${app.id}`} className="flex items-center gap-3 hover:underline">
                <AppIcon src={app.icon} size={36} />
                <span className="text-[17px] font-semibold">{app.title}</span>
              </Link>
              <StoreBadge store={app.store} country={app.country} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Suben / bajan" value={`${week.improved} / ${week.worsened}`} sub={`de ${week.tracked} keywords`} />
              <Stat label="En el TOP 10" value={String(week.top10)} sub={`antes ${week.top10Before}`} />
              <Stat
                label="Cuota de visibilidad"
                value={pct(share)}
                sub={
                  shareDelta == null ? (
                    "sin datos de hace una semana"
                  ) : (
                    <span className={shareDelta > 0 ? "text-up" : shareDelta < 0 ? "text-down" : ""}>
                      {shareDelta > 0 ? "+" : ""}
                      {shareDelta.toLocaleString("es-ES", { maximumFractionDigits: 1 })} puntos
                    </span>
                  )
                }
              />
              <Stat label="Cambios de competidores" value={String(competitorChanges)} />
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
                            <Link href={`/apps/${app.id}/keywords/${r.keywordId}`} className="truncate hover:underline">
                              {r.term}
                            </Link>
                            <span className="shrink-0 font-mono text-[13px]">
                              {position(r.before)} → {position(r.now)}{" "}
                              <span className={group.className}>
                                {group.icon}
                                {r.before != null && r.now != null && ` ${Math.abs(r.change)}`}
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
    </div>
  );
}

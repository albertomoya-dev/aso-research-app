import type { Metadata } from "next";
import Link from "next/link";
import { followCompetitor, refreshCompetitors, unfollowCompetitor } from "@/app/competitor-actions";
import { AppIcon } from "@/components/app-icon";
import { ConfirmButton } from "@/components/confirm-button";
import { SERIES_COLORS, ShareChart } from "@/components/share-chart";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondary, Card, PageHeader } from "@/components/ui";
import { loadApp } from "@/lib/apps";
import { getCompetitorPage } from "@/lib/competitor-queries";
import { formatDate, formatNumber, formatRating } from "@/lib/format";
import type { ListingChange } from "@/lib/listing-diff";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Competidores" };

const percent = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`;
const MAX_WORDS = 12;

function WordList({ words, sign }: { words: string[]; sign: "+" | "−" }) {
  if (words.length === 0) return null;
  const shown = words.slice(0, MAX_WORDS);
  return (
    <span className={sign === "+" ? "text-up" : "text-down"}>
      {sign} {shown.join(", ")}
      {words.length > shown.length && ` y ${words.length - shown.length} más`}
    </span>
  );
}

function Change({ change }: { change: ListingChange }) {
  switch (change.kind) {
    case "text":
      return (
        <>
          <span className="font-medium">{change.label}</span>
          {change.field === "title" || change.field === "shortDescription" ? (
            <span className="block text-ink-soft">
              «{change.before || "–"}» → «{change.after || "–"}»
            </span>
          ) : (
            <span className="block text-ink-soft">
              {change.after.length - change.before.length >= 0 ? "+" : ""}
              {change.after.length - change.before.length} caracteres
            </span>
          )}
          <span className="flex flex-col text-[13px]">
            <WordList words={change.added} sign="+" />
            <WordList words={change.removed} sign="−" />
          </span>
        </>
      );
    case "value":
      return (
        <>
          <span className="font-medium">{change.label}</span>{" "}
          <span className="text-ink-soft">
            {change.before || "–"} → {change.after || "–"}
          </span>
        </>
      );
    case "image":
      return (
        <span className="flex items-center gap-2">
          <span className="font-medium">Icono nuevo</span>
          <AppIcon src={change.before} size={28} />→<AppIcon src={change.after} size={28} />
        </span>
      );
    case "count":
      return (
        <>
          <span className="font-medium">Capturas cambiadas</span>{" "}
          <span className="text-ink-soft">
            ({change.before} → {change.after})
          </span>
        </>
      );
  }
}

export default async function CompetitorsPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const data = await getCompetitorPage(app);
  const colorOf = new Map(data.series.map((s, i) => [s.id, SERIES_COLORS[i]]));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Competidores
      </nav>
      <PageHeader title={`Competidores de ${app.title}`}>
        Quién ocupa el TOP 5 de tus keywords y qué cambian en su ficha. La cuota de visibilidad reparte cada keyword (según su popularidad)
        entre las cinco primeras posiciones, dando más peso a las primeras.
      </PageHeader>

      {data.current.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-muted">
          Aún no hay posiciones guardadas. Añade keywords y actualiza las posiciones para ver quién compite contigo.
        </Card>
      ) : (
        <>
          <Card aria-label="Evolución de la cuota de visibilidad" className="px-5 py-4">
            <h2 className="text-[17px] font-semibold">Cuota de visibilidad en el TOP 5</h2>
            <p className="mt-1 mb-4 text-[13px] text-muted">Últimos 30 días, en {data.keywordCount} keywords.</p>
            <ShareChart series={data.series} points={data.history} />
          </Card>

          <Card aria-label="Apps en tu TOP 5" className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[17px] font-semibold">Apps en el TOP 5 de tus keywords</h2>
              <p className="mt-1 text-[13px] text-muted">Con la última posición guardada de cada keyword.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-muted uppercase">
                    <th className="px-5 py-2.5">App</th>
                    <th className="px-3 py-2.5 text-right">Cuota</th>
                    <th className="px-3 py-2.5 text-right">Keywords en TOP 5</th>
                    <th className="px-3 py-2.5 text-right">Mejor posición</th>
                    <th className="px-5 py-2.5">
                      <span className="sr-only">Seguir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.current.slice(0, 25).map((row) => {
                    const own = row.app.id === app.storeId;
                    const color = colorOf.get(row.app.id);
                    return (
                      <tr key={row.app.id} className={`border-b border-line last:border-0 ${own ? "bg-brand-soft/40" : ""}`}>
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-3">
                            <AppIcon src={row.app.icon} size={32} />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 font-medium">
                                {color && <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
                                <a href={row.app.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                                  {row.app.title}
                                </a>
                                {own && <span className="text-xs font-semibold text-link">Tu app</span>}
                              </span>
                              <span className="block truncate text-xs text-muted">{row.app.developer}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{percent(row.share)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{row.keywords}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{row.bestPosition}</td>
                        <td className="px-5 py-2.5 text-right">
                          {own ? null : data.followedIds.has(row.app.id) ? (
                            <span className="text-[13px] text-muted">Siguiendo</span>
                          ) : (
                            <form action={followCompetitor}>
                              <input type="hidden" name="appId" value={app.id} />
                              <input type="hidden" name="storeId" value={row.app.id} />
                              <input type="hidden" name="title" value={row.app.title} />
                              <input type="hidden" name="developer" value={row.app.developer} />
                              <input type="hidden" name="icon" value={row.app.icon} />
                              <input type="hidden" name="url" value={row.app.url} />
                              <SubmitButton className={`${buttonSecondary} min-h-10`} pendingLabel="Leyendo ficha…">
                                Vigilar ficha
                              </SubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card aria-label="Competidores vigilados" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold">Fichas vigiladas ({data.followed.length})</h2>
            <p className="mt-1 text-[13px] text-muted">Se leen cada día y se guarda una copia cuando cambian.</p>
          </div>
          {data.followed.length > 0 && (
            <form action={refreshCompetitors}>
              <input type="hidden" name="appId" value={app.id} />
              <SubmitButton className={buttonSecondary} pendingLabel="Leyendo fichas…">
                Comprobar ahora
              </SubmitButton>
            </form>
          )}
        </div>
        {data.followed.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Pulsa «Vigilar ficha» en una app de la tabla para seguir sus cambios.</p>
        ) : (
          <ul>
            {data.followed.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className="flex min-w-0 items-center gap-3">
                  <AppIcon src={c.icon} size={32} />
                  <span className="min-w-0">
                    <a href={c.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
                      {c.title}
                    </a>
                    <span className="block text-xs text-muted">
                      {c.rating != null && `${formatRating(c.rating)} · `}
                      {c.ratingsCount != null && `${formatNumber(c.ratingsCount)} valoraciones · `}
                      {c.checkedAt ? `comprobada el ${formatDate(c.checkedAt)}` : "sin comprobar"}
                    </span>
                    {c.error && <span className="block text-xs text-danger">Último error: {c.error}</span>}
                  </span>
                </span>
                <form action={unfollowCompetitor}>
                  <input type="hidden" name="appId" value={app.id} />
                  <input type="hidden" name="competitorId" value={c.id} />
                  <ConfirmButton message={`¿Dejar de vigilar ${c.title}? Se borrará su historial de cambios.`} className="min-h-10 rounded-lg px-2.5 text-[13px] font-medium text-muted hover:bg-surface-muted hover:text-danger">
                    Dejar de vigilar
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.followed.length > 0 && (
        <Card aria-label="Cambios en fichas" className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[17px] font-semibold">Cambios detectados</h2>
          </div>
          {data.changes.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Sin cambios todavía. Aparecerán aquí cuando un competidor actualice su ficha.</p>
          ) : (
            <ol>
              {data.changes.map((event) => (
                <li key={`${event.competitorId}-${event.date.toISOString()}`} className="grid gap-2 border-b border-line px-5 py-3.5 last:border-0 sm:grid-cols-[200px_1fr]">
                  <span className="flex items-start gap-2.5">
                    <AppIcon src={event.icon} size={28} />
                    <span>
                      <span className="block font-medium">{event.title}</span>
                      <span className="block text-xs text-muted">{formatDate(event.date)}</span>
                    </span>
                  </span>
                  <ul className="flex flex-col gap-2 text-sm">
                    {event.changes.map((change) => (
                      <li key={change.field}>
                        <Change change={change} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}

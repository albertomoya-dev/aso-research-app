import type { Metadata } from "next";
import Link from "next/link";
import { refreshAppMeta, refreshRankings, removeKeyword, unfollowApp } from "@/app/actions";
import { AppIcon } from "@/components/app-icon";
import { AppMetadata } from "@/components/app-metadata";
import { ConfirmButton } from "@/components/confirm-button";
import { CountriesCard } from "@/components/countries-card";
import { HealthPanel } from "@/components/health-panel";
import { KeywordForm } from "@/components/keyword-form";
import { OfficialBadge, officialPeriod, OfficialStatsCard } from "@/components/official-stats";
import { BulkRemoveBar, KeywordSelection, RowCheckbox, SelectAllCheckbox } from "@/components/keyword-selection";
import { Position, PositionChange, Sparkline } from "@/components/rank";
import { RecalculateRelevance, RelevanceSelect } from "@/components/relevance-select";
import { Difficulty, OpportunityBadge, PopularityBar } from "@/components/scores";
import { StoreBadge } from "@/components/store-badge";
import { SubmitButton } from "@/components/submit-button";
import { buttonPrimary, buttonSecondary, Card } from "@/components/ui";
import { loadApp } from "@/lib/apps";
import { watchedStoreIds } from "@/lib/competitor-queries";
import { getCountry } from "@/lib/countries";
import { formatDate } from "@/lib/format";
import { isKeywordSort, KEYWORD_SORTS, sortKeywordRows, type KeywordSort, type SortDir } from "@/lib/keyword-sort";
import { SOURCE_LABEL } from "@/lib/keywords";
import { getKeywordRows, type KeywordRow } from "@/lib/queries";
import { rankStatus } from "@/lib/ranking";
import { isLikelyIrrelevant, KEYWORD_BUDGET, noiseReason } from "@/lib/relevance";
import { hasAnthropicKey } from "@/lib/claude";
import { getOfficialStats } from "@/lib/search-term-queries";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; s?: string; d?: string }> };

const FILTERS: { id: string; label: string; test: (r: KeywordRow, lang: string) => boolean }[] = [
  { id: "all", label: "Todas", test: () => true },
  { id: "top10", label: "TOP 10", test: (r) => rankStatus(r.position) === "top10" },
  { id: "reach", label: "Al alcance (11–30)", test: (r) => rankStatus(r.position) === "within-reach" },
  { id: "down", label: "Bajando", test: (r) => (r.changeWeek ?? 0) < 0 },
  // Relevance 2 or less, a search for another kind of app, or a filler word.
  { id: "noise", label: "Probablemente irrelevantes", test: (r, lang) => isLikelyIrrelevant(r, lang) },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await loadApp((await params).id);
  return { title: app.title };
}

// The checkbox and keyword columns stay put while the table scrolls sideways inside its card (mobile
// and narrow windows). Opaque background so scrolled cells pass underneath; the inset shadow is the
// divider (cell borders do not travel with sticky cells in a collapsed table).
const STICKY_CHECK = "sticky left-0 z-10 w-12 min-w-12 max-w-12 bg-surface";
const STICKY_TERM = "sticky left-12 z-10 min-w-44 bg-surface shadow-[inset_-1px_0_0_var(--line)]";
const TOP5_RING = { own: "ring-brand", watched: "ring-watched" } as const;

export default async function AppPage({ params, searchParams }: Props) {
  const app = await loadApp((await params).id);
  const { f, s, d } = await searchParams;
  const filter = FILTERS.find((x) => x.id === f) ?? FILTERS[0];
  const sort: KeywordSort = isKeywordSort(s) ? s : "opportunity";
  const dir: SortDir = d === "asc" || d === "desc" ? d : KEYWORD_SORTS[sort].dir;
  const { lang } = getCountry(app.country);
  const [rows, official, watched] = await Promise.all([
    getKeywordRows(app),
    app.store === "android" ? getOfficialStats(app.id) : null,
    watchedStoreIds(app.id),
  ]);
  const top5HasWatched = rows.some((r) => r.top5.some((t) => watched.has(t.id)));
  const visible = sortKeywordRows(rows.filter((r) => filter.test(r, lang)), sort, dir);
  const unratedByUser = rows.filter((r) => r.relevanceSource !== "user").length;
  const unrated = rows.filter((r) => r.relevance == null).length;
  const href = (params: { f?: string; s?: string; d?: string }) => {
    const q = new URLSearchParams({ f: filter.id, s: sort, d: dir, ...params });
    if (q.get("f") === "all") q.delete("f");
    if (q.get("d") === KEYWORD_SORTS[q.get("s") as KeywordSort].dir) q.delete("d");
    if (q.get("s") === "opportunity") q.delete("s");
    return `/apps/${app.id}${q.size ? `?${q}` : ""}`;
  };
  // Clicking the active column flips its direction; another column starts in its natural one.
  const sortHeader = (id: KeywordSort, label: string, className?: string) => {
    const active = sort === id;
    const next = active ? (dir === "asc" ? "desc" : "asc") : KEYWORD_SORTS[id].dir;
    return <SortHeader label={label} active={active} dir={dir} href={href({ s: id, d: next })} className={className} />;
  };
  const lastCheck = rows.map((r) => r.checkedOn).filter(Boolean).sort().at(-1);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <AppIcon src={app.icon} size={56} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold break-words">{app.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <StoreBadge store={app.store} country={app.country} />
              <span>{getCountry(app.country).name}</span>
              <span>· Posiciones del {lastCheck ? formatDate(lastCheck) : "– (aún sin consultar)"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <form action={refreshRankings}>
            <input type="hidden" name="appId" value={app.id} />
            <SubmitButton className={buttonPrimary} pendingLabel="Consultando la tienda…">
              Actualizar posiciones
            </SubmitButton>
          </form>
          <form action={refreshAppMeta}>
            <input type="hidden" name="appId" value={app.id} />
            <SubmitButton className={buttonSecondary} pendingLabel="Leyendo ficha…">
              Actualizar ficha
            </SubmitButton>
          </form>
          <form action={unfollowApp}>
            <input type="hidden" name="appId" value={app.id} />
            <ConfirmButton
              message={`¿Dejar de seguir ${app.title}? Se borrarán sus keywords y su histórico.`}
              className={`${buttonSecondary} text-danger`}
            >
              Dejar de seguir
            </ConfirmButton>
          </form>
        </div>
      </header>

      <HealthPanel app={app} rows={rows} />

      <Card aria-label="Añadir keywords" className="px-6 py-5">
        <KeywordForm appId={app.id} />
      </Card>

      <Card aria-label="Keywords" className="overflow-hidden">
        <KeywordSelection>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-[17px] font-semibold">Keywords ({rows.length})</h2>
              {unrated > 0 && <span className="text-[13px] text-muted">{unrated} sin valorar</span>}
            </div>
            {hasAnthropicKey() && rows.length > 0 && <RecalculateRelevance appId={app.id} pendingCount={unratedByUser} />}
          </div>
          {rows.length > KEYWORD_BUDGET && (
            <p role="note" className="border-b border-line bg-warn-bg px-5 py-3 text-[13px] text-warn-fg">
              Sigues {rows.length} keywords. Por encima de {KEYWORD_BUDGET}, las alertas y la cuota de visibilidad pierden precisión porque se
              mezclan con búsquedas que no son tuyas. Revisa las de{" "}
              <Link href={href({ f: "noise" })} scroll={false} className="font-medium underline">
                relevancia baja
              </Link>{" "}
              y quita las que no te aporten.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <nav aria-label="Filtrar keywords" className="flex flex-wrap gap-2">
              {FILTERS.map((x) => {
                const active = x.id === filter.id;
                return (
                  <Link
                    key={x.id}
                    href={href({ f: x.id })}
                    aria-current={active ? "true" : undefined}
                    scroll={false}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium ${
                      active ? "border-ink bg-ink text-bg" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-muted"
                    }`}
                  >
                    {x.label} <span className="opacity-75">{rows.filter((r) => x.test(r, lang)).length}</span>
                  </Link>
                );
              })}
            </nav>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted md:ml-auto">
              <span>TOP 5:</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-[3px] ring-2 ring-brand" />
                Tu app
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 rounded-[3px] ring-2 ring-watched" />
                Competidor vigilado
              </span>
            </p>
          </div>
          {filter.id === "noise" && visible.length > 0 && (
            <p className="border-b border-line px-5 py-3 text-[13px] text-muted">
              Propuestas para quitar: relevancia 2 o menos, búsquedas en las que la gente quiere otro tipo de app (lo estima la IA mirando el TOP 5)
              o palabras vacías como «ahora» o «datos». Revisa antes de quitar; puedes subir la relevancia de las que sí te interesen.
            </p>
          )}
          <BulkRemoveBar appId={app.id} terms={Object.fromEntries(visible.map((k) => [k.id, k.term]))} />
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Aún no hay keywords. Añade las primeras arriba.</p>
          ) : visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Ninguna keyword cumple este filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1380px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-wider text-muted uppercase">
                    <th scope="col" className={`${STICKY_CHECK} py-3 pl-5`}>
                      <SelectAllCheckbox ids={visible.map((k) => k.id)} />
                    </th>
                    {sortHeader("term", "Keyword", `${STICKY_TERM} px-3`)}
                    {sortHeader("position", "Posición")}
                    {sortHeader("day", "vs ayer")}
                    {sortHeader("week", "7 días")}
                    {sortHeader("trend", "Evolución 30 d")}
                    {sortHeader("popularity", "Popularidad")}
                    {sortHeader("difficulty", "Dificultad")}
                    {sortHeader("opportunity", "Oportunidad")}
                    {sortHeader("relevance", "Relevancia")}
                    <th scope="col" className="px-3 py-3 font-semibold">TOP 5</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((k) => (
                    <tr key={k.id} className="border-t border-line">
                      <td className={`${STICKY_CHECK} py-3 pl-5`}>
                        <RowCheckbox id={k.id} term={k.term} />
                      </td>
                      <td className={`${STICKY_TERM} px-3 py-3`}>
                        <Link href={`/apps/${app.id}/keywords/${k.id}`} className="font-semibold hover:text-link hover:underline">
                          {k.term}
                        </Link>
                        {rankStatus(k.position) === "within-reach" && (
                          <span className="ml-2 rounded-md bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn-fg">Al alcance</span>
                        )}
                        <div className="mt-0.5 text-xs text-muted">{SOURCE_LABEL[k.source]}</div>
                        {official?.byTerm.has(k.term) && <OfficialBadge stats={official.byTerm.get(k.term)!} period={officialPeriod(official)} />}
                      </td>
                      <td className="px-3 py-3 font-mono text-base font-medium">
                        <Position position={k.position} depth={k.depth} checked={k.checkedOn != null} />
                      </td>
                      <td className="px-3 py-3"><PositionChange change={k.changeDay} /></td>
                      <td className="px-3 py-3"><PositionChange change={k.changeWeek} /></td>
                      <td className="px-3 py-3"><Sparkline points={k.history} /></td>
                      <td className="px-3 py-3"><PopularityBar value={k.popularity} /></td>
                      <td className="px-3 py-3"><Difficulty value={k.difficulty} /></td>
                      <td className="px-3 py-3"><OpportunityBadge value={k.opportunity} /></td>
                      <td className="px-3 py-3">
                        <RelevanceSelect
                          appId={app.id}
                          keywordId={k.id}
                          term={k.term}
                          value={k.relevance}
                          source={k.relevanceSource}
                          reason={noiseReason(k, lang)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {k.top5.length > 0 ? (
                          <ol className="flex items-center gap-1" aria-label={`TOP 5 de ${k.term}`}>
                            {k.top5.map((t, i) => {
                              const role = t.id === app.storeId ? "own" : watched.has(t.id) ? "watched" : null;
                              const name = `${i + 1}. ${t.title}${role === "own" ? " (tu app)" : role === "watched" ? " (competidor vigilado)" : ""}`;
                              return (
                                <li key={t.id} title={name} className={role ? `rounded-[7px] ring-2 ${TOP5_RING[role]}` : undefined}>
                                  <AppIcon src={t.icon} size={26} alt={name} />
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <form action={removeKeyword}>
                          <input type="hidden" name="appId" value={app.id} />
                          <input type="hidden" name="keywordId" value={k.id} />
                          <button
                            type="submit"
                            aria-label={`Quitar ${k.term}`}
                            className="min-h-11 rounded-lg px-3 text-[13px] font-medium text-danger hover:bg-danger-soft"
                          >
                            Quitar
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-line px-5 py-3.5 text-[13px] text-muted">
            Posición en los resultados de búsqueda de la tienda para {getCountry(app.country).name}, consultada cada día.
            {app.store === "ios" && " En App Store es aproximada: la API pública no siempre ordena igual que la app de la tienda."} «&gt; N»
            significa que la app no aparece entre los N resultados que devuelve la tienda para esa búsqueda (cada búsqueda
            devuelve un número distinto: hasta 200 en App Store; Google Play suele devolver unos 30). Popularidad
            (0–100): estimada con el autocompletado de la tienda, se actualiza cada semana. Dificultad (0–100): fuerza del TOP 10.
            Oportunidad: popularidad descontada por la dificultad y multiplicada por la relevancia (de 0,6 con relevancia 1 a 1 con
            relevancia 5; una keyword sin valorar cuenta como 0,7). Relevancia (1–5): la estima la IA con tu ficha de producto o la fijas tú;
            la IA nunca cambia la que has puesto tú.
            {" "}TOP 5: tu app lleva un borde lavanda y los competidores vigilados uno naranja
            {top5HasWatched ? "" : " (aún no vigilas a ninguno de los que salen; se eligen en la pestaña Competidores)"}. El nombre de cada app sale al pasar
            el cursor y lo leen los lectores de pantalla.
            {official &&
              ` «Oficial»: visitantes e instalaciones reales de Google Play Console del ${officialPeriod(official)}, importados del CSV; no son estimaciones y no se mezclan con la popularidad.`}
          </p>
        </KeywordSelection>
      </Card>

      {app.store === "android" && <OfficialStatsCard appId={app.id} stats={official} tracked={new Set(rows.map((r) => r.term))} />}

      <CountriesCard app={app} />

      <Card aria-label="Ficha publicada" className="p-6">
        <div className="mb-4 text-sm text-muted">Ficha leída el {formatDate(app.metaFetchedAt)}</div>
        <AppMetadata meta={app.meta} />
      </Card>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  href,
  className = "px-3",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  href: string;
  className?: string;
}) {
  return (
    <th scope="col" aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : undefined} className={`${className} py-3 font-semibold`}>
      <Link href={href} scroll={false} className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap hover:text-ink ${active ? "text-ink" : ""}`}>
        {label}
        <span aria-hidden="true" className={active ? "" : "opacity-30"}>{active ? (dir === "desc" ? "↓" : "↑") : "↕"}</span>
      </Link>
    </th>
  );
}

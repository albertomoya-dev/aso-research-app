import type { Metadata } from "next";
import Link from "next/link";
import { refreshAppMeta, refreshRankings, removeKeyword, unfollowApp } from "@/app/actions";
import { AppIcon } from "@/components/app-icon";
import { AppMetadata } from "@/components/app-metadata";
import { ConfirmButton } from "@/components/confirm-button";
import { CountriesCard } from "@/components/countries-card";
import { KeywordForm } from "@/components/keyword-form";
import { Position, PositionChange, Sparkline } from "@/components/rank";
import { Difficulty, OpportunityBadge, PopularityBar } from "@/components/scores";
import { StoreBadge } from "@/components/store-badge";
import { SubmitButton } from "@/components/submit-button";
import { buttonPrimary, buttonSecondary, Card } from "@/components/ui";
import { loadApp } from "@/lib/apps";
import { getCountry } from "@/lib/countries";
import { formatDate } from "@/lib/format";
import { isKeywordSort, KEYWORD_SORTS, sortKeywordRows, type KeywordSort, type SortDir } from "@/lib/keyword-sort";
import { getKeywordRows, type KeywordRow } from "@/lib/queries";
import { rankStatus } from "@/lib/ranking";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; s?: string; d?: string }> };

const SOURCE_LABEL = { manual: "Manual", ai: "Sugerida por IA", autocomplete: "Autocompletado" } as const;

const FILTERS = [
  { id: "all", label: "Todas", test: () => true },
  { id: "top10", label: "TOP 10", test: (r: KeywordRow) => rankStatus(r.position) === "top10" },
  { id: "reach", label: "Al alcance (11–30)", test: (r: KeywordRow) => rankStatus(r.position) === "within-reach" },
  { id: "down", label: "Bajando", test: (r: KeywordRow) => (r.changeWeek ?? 0) < 0 },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await loadApp((await params).id);
  return { title: app.title };
}

export default async function AppPage({ params, searchParams }: Props) {
  const app = await loadApp((await params).id);
  const { f, s, d } = await searchParams;
  const filter = FILTERS.find((x) => x.id === f) ?? FILTERS[0];
  const sort: KeywordSort = isKeywordSort(s) ? s : "opportunity";
  const dir: SortDir = d === "asc" || d === "desc" ? d : KEYWORD_SORTS[sort].dir;
  const rows = await getKeywordRows(app);
  const visible = sortKeywordRows(rows.filter(filter.test), sort, dir);
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
        <div className="flex items-center gap-3.5">
          <AppIcon src={app.icon} size={56} />
          <div>
            <h1 className="text-2xl font-bold">{app.title}</h1>
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

      <Card aria-label="Añadir keywords" className="px-6 py-5">
        <KeywordForm appId={app.id} />
      </Card>

      <Card aria-label="Keywords" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[17px] font-semibold">Keywords ({rows.length})</h2>
          </div>
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
                  {x.label} <span className="opacity-75">{rows.filter(x.test).length}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Aún no hay keywords. Añade las primeras arriba.</p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Ninguna keyword cumple este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wider text-muted uppercase">
                  {sortHeader("term", "Keyword", "px-5")}
                  {sortHeader("position", "Posición")}
                  {sortHeader("day", "vs ayer")}
                  {sortHeader("week", "7 días")}
                  {sortHeader("trend", "Evolución 30 d")}
                  {sortHeader("popularity", "Popularidad")}
                  {sortHeader("difficulty", "Dificultad")}
                  {sortHeader("opportunity", "Oportunidad")}
                  <th scope="col" className="px-3 py-3 font-semibold">TOP 5</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((k) => (
                  <tr key={k.id} className="border-t border-line">
                    <td className="px-5 py-3">
                      <Link href={`/apps/${app.id}/keywords/${k.id}`} className="font-semibold hover:text-brand hover:underline">
                        {k.term}
                      </Link>
                      {rankStatus(k.position) === "within-reach" && (
                        <span className="ml-2 rounded-md bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn-fg">Al alcance</span>
                      )}
                      <div className="mt-0.5 text-xs text-muted">{SOURCE_LABEL[k.source]}</div>
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
                      {k.top5.length > 0 ? (
                        <ol className="flex items-center gap-1" aria-label={`TOP 5 de ${k.term}`}>
                          {k.top5.map((t, i) => (
                            <li
                              key={t.id}
                              title={`${i + 1}. ${t.title}${t.id === app.storeId ? " (tu app)" : ""}`}
                              className={t.id === app.storeId ? "rounded-[7px] ring-2 ring-brand" : undefined}
                            >
                              <AppIcon src={t.icon} size={26} alt={`${i + 1}. ${t.title}`} />
                            </li>
                          ))}
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
          {app.store === "ios" && " En App Store es aproximada: la API pública no siempre ordena igual que la app de la tienda."} Popularidad
          (0–100): estimada con el autocompletado de la tienda, se actualiza cada semana. Dificultad (0–100): fuerza del TOP 10.
          Oportunidad: popularidad descontada por la dificultad.
        </p>
      </Card>

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

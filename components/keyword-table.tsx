"use client";

import { ListFilter, SearchX } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { loadKeywordPanelAction } from "@/app/keyword-actions";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn, FacetFilter, FacetOptions, TableSearch, useTableView, ViewOptions } from "@/components/ui/data-table";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { RankBadge } from "@/components/ui/rank-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { activeFacetCount, applyFilters, facetCounts, type FacetSelection, toggleFacet } from "@/lib/data-table";
import { formatNumber } from "@/lib/format";
import type { KeywordPanelData } from "@/lib/keyword-panel";
import { isKeywordSort, KEYWORD_SORTS, type KeywordSort, sortKeywordRows, type SortDir } from "@/lib/keyword-sort";
import { DEFAULT_KEYWORD_VIEW, difficultyBand, KEYWORD_COLUMNS, KEYWORD_VIEW_KEY, keywordFacets, ORIGIN_GROUP, ORIGIN_LABEL } from "@/lib/keyword-table";
import type { KeywordRow } from "@/lib/queries";
import { rankStatus } from "@/lib/ranking";
import { noiseReason } from "@/lib/relevance";
import { AppIcon } from "./app-icon";
import { KeywordDetailSheet } from "./keyword-detail-sheet";
import { KeywordSelectionBar } from "./keyword-selection";
import { Sparkline } from "./rank";
import { RelevanceDots } from "./relevance-dots";
import { RelevanceSelect } from "./relevance-select";

type Props = {
  appId: number;
  /** `/a/[app]/[market]`. */
  basePath: string;
  rows: KeywordRow[];
  lang: string;
  countryName: string;
  store: "ios" | "android";
  ownStoreId: string;
  watched: string[];
  aiEnabled: boolean;
  /** Google Play Console visitors per term (the optional column), with its period. */
  official: { period: string; byTerm: Record<string, number> } | null;
  /** Why a row has no relevance yet («Calculando…»), by keyword id. */
  progressLabel: Record<number, string>;
  initial: { facets: FacetSelection; sort: KeywordSort; dir: SortDir; q: string };
  /** The panel of `?k=` when the page was loaded with it. */
  initialPanel: KeywordPanelData | null;
  fileName: string;
};

const ALWAYS = ["term"];
const KNOWN = KEYWORD_COLUMNS.map((c) => c.id);
const DIFFICULTY_TONE = { low: "bg-android-bg text-android-fg", mid: "bg-warn-bg text-warn-fg", high: "bg-danger-soft text-danger", none: "" } as const;

/**
 * Keywords › Seguimiento: the DataTable of the followed keywords. Search, facets and sorting run here over
 * the rows the server sent (a market follows a few hundred at most); the view (columns, density) is kept
 * in localStorage. A row opens its detail panel, kept in the URL as `?k=<id>`.
 */
export function KeywordTable({
  appId,
  basePath,
  rows,
  lang,
  countryName,
  store,
  ownStoreId,
  watched,
  aiEnabled,
  official,
  progressLabel,
  initial,
  initialPanel,
  fileName,
}: Props) {
  const [q, setQ] = useState(initial.q);
  const [facetSel, setFacetSel] = useState<FacetSelection>(initial.facets);
  const [sort, setSort] = useState<{ key: KeywordSort; dir: SortDir }>({ key: initial.sort, dir: initial.dir });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [view, setView] = useTableView(KEYWORD_VIEW_KEY, KNOWN, DEFAULT_KEYWORD_VIEW, ALWAYS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const watchedSet = useMemo(() => new Set(watched), [watched]);

  // The detail panel follows `?k=`: opening pushes it, closing removes it, Back closes it again.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const k = Number(searchParams.get("k")) || null;
  // `id` is the keyword the data was loaded for: data null with that id means it is not followed any more.
  const [panel, setPanel] = useState<{ id: number | null; data: KeywordPanelData | null }>({ id: initialPanel ? initialPanel.id : k, data: initialPanel });
  const [, startLoading] = useTransition();
  const urlWith = (id: number | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (id == null) next.delete("k");
    else next.set("k", String(id));
    return next.size ? `${pathname}?${next}` : pathname;
  };
  // Loaded on every opening, also of the keyword shown last: what was saved in the table since then
  // (its relevance, say) must show. While it loads, the panel keeps the copy it had for that keyword.
  const skipFirstLoad = useRef(k != null);
  useEffect(() => {
    if (k == null) return;
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    let live = true;
    startLoading(async () => {
      const data = await loadKeywordPanelAction(appId, k);
      if (live) setPanel({ id: k, data });
    });
    return () => {
      live = false;
    };
  }, [k, appId]);
  const patchPanel = (patch: Partial<KeywordPanelData>) =>
    setPanel((p) => (p.data && p.data.id === k ? { ...p, data: { ...p.data, ...patch } } : p));
  // This tab added the `?k=` entry (a row was opened here): closing goes back, so Back does not reopen it.
  // Loaded with `?k=` (a shared link), closing replaces the entry instead.
  const pushed = useRef(false);
  useEffect(() => {
    if (k == null) pushed.current = false;
  }, [k]);
  const open = (id: number) => {
    pushed.current = true;
    window.history.pushState(null, "", urlWith(id));
  };
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else window.history.replaceState(null, "", urlWith(null));
  };

  const facets = useMemo(() => keywordFacets<KeywordRow>(lang), [lang]);
  const filtered = useMemo(() => applyFilters(rows, facets, facetSel, { text: q, of: (r) => r.term }), [rows, facets, facetSel, q]);
  const visible = useMemo(() => sortKeywordRows(filtered, sort.key, sort.dir), [filtered, sort]);
  const picked = rows.filter((r) => selected.has(r.id));
  const filterCount = activeFacetCount(facetSel);

  const onSort = (key: string) => {
    if (!isKeywordSort(key)) return;
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: KEYWORD_SORTS[key].dir }));
  };
  const toggleOption = (facetId: string, optionId: string) => setFacetSel((s) => toggleFacet(s, facetId, optionId));
  const termLink = (r: KeywordRow, className?: string, children?: React.ReactNode) => (
    <Link
      href={urlWith(r.id)}
      scroll={false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        open(r.id);
      }}
      className={className}
    >
      {children ?? r.term}
    </Link>
  );

  const shown = new Set(view.columns);
  const allColumns: (DataTableColumn<KeywordRow> & { id: string })[] = [
    {
      id: "term",
      key: "term",
      header: "Keyword",
      sortable: true,
      className: "min-w-48 max-w-80",
      cell: (r) => (
        <div className="flex min-w-0 flex-col py-1">
          {termLink(r, "truncate font-medium text-ink hover:text-link hover:underline")}
          <span className="flex items-center gap-2 text-label text-muted">
            {ORIGIN_LABEL[ORIGIN_GROUP[r.source]]}
            <RelevanceDots value={r.relevance} />
          </span>
        </div>
      ),
    },
    {
      id: "position",
      key: "position",
      header: "Posición",
      sortable: true,
      align: "right",
      help: (
        <>
          Posición en la búsqueda de la tienda en {countryName}, consultada cada día; al lado, el cambio desde ayer. «&gt;N»: la app no está entre
          los N resultados que devuelve la tienda (hasta 200 en App Store; Google Play suele devolver unos 30). Borde azul: al alcance (11–30).
          {store === "ios" && " En App Store es aproximada."}
        </>
      ),
      cell: (r) =>
        r.checkedOn == null ? (
          <span className="text-label text-muted">Sin datos</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1">
            <RankBadge position={r.position} depth={r.depth ?? undefined} reachable={rankStatus(r.position) === "within-reach"} />
            <DeltaBadge delta={r.changeDay} />
          </span>
        ),
    },
    {
      id: "week",
      key: "week",
      header: "7 días",
      sortable: true,
      align: "right",
      cell: (r) => <DeltaBadge delta={r.changeWeek} />,
    },
    {
      id: "trend",
      key: "trend",
      header: "Evolución 30 d",
      sortable: true,
      cell: (r) => <Sparkline points={r.history} width={96} height={view.density === "compact" ? 22 : 28} />,
    },
    {
      id: "popularity",
      key: "popularity",
      header: "Popularidad",
      sortable: true,
      align: "right",
      help: "0–100, estimada con el autocompletado de la tienda y actualizada cada semana. 0: la tienda no la sugiere ni escribiéndola entera; «–»: aún sin medir.",
      cell: (r) =>
        r.popularity == null ? (
          <span className="text-muted">–</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="h-1.5 w-12 rounded-full bg-surface-muted" aria-hidden="true">
              <span className="block h-1.5 rounded-full bg-brand" style={{ width: `${r.popularity}%` }} />
            </span>
            <span className="w-7 font-mono">{r.popularity}</span>
          </span>
        ),
    },
    {
      id: "difficulty",
      key: "difficulty",
      header: "Dificultad",
      sortable: true,
      align: "right",
      help: "0–100: fuerza del TOP 10 (cuántas apps la llevan en el título, su valoración y su número de valoraciones). Baja hasta 34, alta desde 65.",
      cell: (r) =>
        r.difficulty == null ? (
          <span className="text-muted">–</span>
        ) : (
          <span className={cn("inline-block min-w-8 rounded-md px-1.5 py-0.5 text-center font-mono", DIFFICULTY_TONE[difficultyBand(r.difficulty)])}>{r.difficulty}</span>
        ),
    },
    {
      id: "opportunity",
      key: "opportunity",
      header: "Oportunidad",
      sortable: true,
      align: "right",
      help: "Popularidad descontada por la dificultad y multiplicada por la relevancia (de 0,6 con relevancia 1 a 1 con relevancia 5; sin valorar cuenta como 0,7).",
      cell: (r) => (r.opportunity == null ? <span className="text-muted">–</span> : <span className="font-mono font-semibold text-ink">{r.opportunity}</span>),
    },
    {
      id: "relevance",
      key: "relevance",
      header: "Relevancia",
      sortable: true,
      help: "1–5: la estima la IA con tu ficha de producto o la fijas tú; la IA nunca cambia la tuya.",
      cell: (r) => (
        <RelevanceSelect
          appId={appId}
          keywordId={r.id}
          term={r.term}
          value={r.relevance}
          source={r.relevanceSource}
          reason={noiseReason(r, lang)}
          status={progressLabel[r.id]}
        />
      ),
    },
    {
      id: "visitors",
      key: "visitors",
      header: "Visitantes Play",
      align: "right",
      help: official ? `Visitantes reales de Google Play Console del ${official.period}, importados del CSV. No se mezclan con la popularidad.` : "Importa el CSV de Play Console en Ajustes › Play.",
      cell: (r) => <span className="font-mono">{official?.byTerm[r.term] != null ? formatNumber(official.byTerm[r.term]) : "–"}</span>,
    },
    {
      id: "top5",
      key: "top5",
      header: "TOP 5",
      cell: (r) =>
        r.top5.length === 0 ? (
          <span className="text-muted">–</span>
        ) : (
          <ol className="flex items-center -space-x-1" aria-label={`TOP 5 de ${r.term}`}>
            {r.top5.map((t, i) => {
              const role = t.id === ownStoreId ? "own" : watchedSet.has(t.id) ? "watched" : null;
              const name = `${i + 1}. ${t.title}${role === "own" ? " (tu app)" : role === "watched" ? " (competidor vigilado)" : ""}`;
              return (
                <li
                  key={t.id}
                  title={name}
                  className={cn("size-[22px] shrink-0 overflow-hidden rounded-[6px] bg-surface-muted ring-2", role === "own" ? "ring-brand" : role === "watched" ? "ring-watched" : "ring-surface")}
                >
                  <AppIcon src={t.icon} size={22} alt={name} />
                </li>
              );
            })}
          </ol>
        ),
    },
  ];
  const columns = allColumns.filter((c) => shown.has(c.id) && (c.id !== "visitors" || official));

  const facetChips = facets.map((f) => (
    <FacetFilter
      key={f.id}
      facet={f}
      selection={facetSel}
      counts={facetCounts(rows, facets, f.id, facetSel)}
      onToggle={(o) => toggleOption(f.id, o)}
      onClear={() => setFacetSel((s) => ({ ...s, [f.id]: [] }))}
    />
  ));

  const toolbar = (
    <>
      <div className="w-full sm:w-auto">
        <TableSearch value={q} onChange={setQ} placeholder="Buscar keyword…" label="Buscar keyword" />
      </div>
      <div className="hidden flex-wrap items-center gap-1.5 sm:flex">{facetChips}</div>
      <Button variant="secondary" size="sm" className="sm:hidden" onClick={() => setFiltersOpen(true)}>
        <ListFilter size={16} aria-hidden="true" />
        Filtros{filterCount > 0 && ` · ${filterCount}`}
      </Button>
      {filterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setFacetSel({})}>
          Limpiar filtros
        </Button>
      )}
      <span className="ml-auto text-label text-muted tabular-nums" aria-live="polite">
        {visible.length === rows.length ? `${rows.length} keywords` : `${visible.length} de ${rows.length}`}
      </span>
      <div className="hidden sm:block">
        <ViewOptions columns={KEYWORD_COLUMNS.filter((c) => c.id !== "visitors" || official)} view={view} onChange={setView} always={ALWAYS}>
          <DropdownMenuLabel>Leyenda del TOP 5</DropdownMenuLabel>
          <div className="flex flex-col gap-1.5 px-2.5 pb-2 text-label text-ink-soft">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-[3px] ring-2 ring-brand" /> Tu app
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-[3px] ring-2 ring-watched" /> Competidor vigilado
            </span>
          </div>
        </ViewOptions>
      </div>
    </>
  );

  return (
    <>
      <DataTable
        label="Keywords"
        columns={columns}
        rows={visible}
        rowKey={(r) => r.id}
        toolbar={toolbar}
        density={view.density}
        sort={{ key: sort.key, dir: sort.dir, onSort }}
        onRowClick={(r) => open(r.id)}
        selection={{
          isSelected: (r) => selected.has(r.id),
          toggle: (r) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(r.id)) next.delete(r.id);
              else next.add(r.id);
              return next;
            }),
          toggleAll: () =>
            setSelected((prev) => {
              const all = visible.length > 0 && visible.every((r) => prev.has(r.id));
              const next = new Set(prev);
              for (const r of visible) {
                if (all) next.delete(r.id);
                else next.add(r.id);
              }
              return next;
            }),
          label: (r) => `Seleccionar ${r.term}`,
        }}
        card={(r) =>
          termLink(
            r,
            "flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-surface-muted",
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium text-ink">{r.term}</span>
                <span className="flex items-center gap-1.5">
                  {r.checkedOn == null ? (
                    <span className="text-label text-muted">Sin datos</span>
                  ) : (
                    <>
                      <RankBadge position={r.position} depth={r.depth ?? undefined} reachable={rankStatus(r.position) === "within-reach"} />
                      <DeltaBadge delta={r.changeDay} />
                    </>
                  )}
                </span>
              </span>
              <span className="flex w-[72px] shrink-0 justify-center">
                <Sparkline points={r.history} width={72} height={24} />
              </span>
              <span className="flex w-12 shrink-0 flex-col items-end">
                <span className="font-mono text-[15px] font-semibold text-ink tabular-nums">{r.opportunity ?? "–"}</span>
                <span className="text-[11px] text-muted">oport.</span>
              </span>
            </>,
          )
        }
        empty={
          rows.length > 0 ? (
            <EmptyState
              icon={SearchX}
              title="Ninguna keyword cumple el filtro"
              description="Cambia la búsqueda o quita algún filtro."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFacetSel({});
                    setQ("");
                  }}
                >
                  Limpiar filtros
                </Button>
              }
            />
          ) : undefined
        }
      />

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          {facets.map((f) => (
            <section key={f.id} aria-label={f.label} className="flex flex-col gap-1">
              <h3 className="text-label font-medium text-ink-soft">{f.label}</h3>
              <FacetOptions facet={f} selected={facetSel[f.id] ?? []} counts={facetCounts(rows, facets, f.id, facetSel)} onToggle={(o) => toggleOption(f.id, o)} />
            </section>
          ))}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setFacetSel({})} disabled={filterCount === 0}>
              Limpiar
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>
              Ver {visible.length}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <KeywordSelectionBar appId={appId} rows={picked} aiEnabled={aiEnabled} fileName={fileName} onClear={() => setSelected(new Set())} />
      <KeywordDetailSheet appId={appId} keywordId={k} loaded={panel.id === k} data={panel.id === k ? panel.data : null} basePath={basePath} onClose={close} onPatch={patchPanel} />
    </>
  );
}

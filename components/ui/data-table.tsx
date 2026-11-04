"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, ListFilter, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { type Density, type Facet, type FacetSelection, parseTableView, type TableView } from "@/lib/data-table";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./dropdown-menu";
import { HelpTip } from "./help-tip";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// The table of the redesign (DESIGN.md §5): a toolbar with search, faceted filters and «Vistas», a sticky
// header with tabular figures aligned right, rows of 44 px (36 px compact), selection with a floating bar,
// and cards instead of the table below 640 px. Filtering and sorting are the caller's (lib/data-table.ts):
// the table only draws what it is given.

export type SortDir = "asc" | "desc";

export type DataTableColumn<Row> = {
  key: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  /** Numbers align right (and use tabular figures, which the body already sets). */
  align?: "left" | "right";
  className?: string;
  /** The column's definition, as a «?» next to the header. */
  help?: React.ReactNode;
  /** Makes the header a sort button. */
  sortable?: boolean;
};

export type DataTableSelection<Row> = {
  isSelected: (row: Row) => boolean;
  toggle: (row: Row) => void;
  /** Ticks or unticks every row shown. */
  toggleAll: () => void;
  /** Accessible name of a row's checkbox: «Seleccionar correr». */
  label: (row: Row) => string;
};

export type DataTableProps<Row> = {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  /** Search box, filters and actions above the table. */
  toolbar?: React.ReactNode;
  /** Shown instead of the body when there are no rows; usually an EmptyState. */
  empty?: React.ReactNode;
  /** Accessible name of the table. */
  label: string;
  className?: string;
  density?: Density;
  sort?: { key: string; dir: SortDir; onSort: (key: string) => void };
  selection?: DataTableSelection<Row>;
  /** Below 640 px each row is drawn with this instead of the table. Without it the table scrolls sideways. */
  card?: (row: Row) => React.ReactNode;
  /** Opens the row's detail when the row (not a control inside it) is clicked. */
  onRowClick?: (row: Row) => void;
};

const ROW_HEIGHT: Record<Density, string> = { comfortable: "h-11", compact: "h-9" };

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  toolbar,
  empty,
  label,
  className,
  density = "comfortable",
  sort,
  selection,
  card,
  onRowClick,
}: DataTableProps<Row>) {
  const allSelected = selection != null && rows.length > 0 && rows.every((r) => selection.isSelected(r));
  const someSelected = selection != null && !allSelected && rows.some((r) => selection.isSelected(r));
  const interactive = (target: EventTarget) => (target as HTMLElement).closest("a,button,input,select,label,textarea,[role=menu]");
  return (
    <div className={cn("flex min-w-0 flex-col rounded-card border border-line bg-surface", className)}>
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">{toolbar}</div>}
      {rows.length === 0 && empty ? (
        empty
      ) : (
        <>
          {card && (
            <ul aria-label={label} className="flex flex-col sm:hidden">
              {rows.map((row) => (
                <li key={rowKey(row)} className="border-b border-line last:border-0">
                  {card(row)}
                </li>
              ))}
            </ul>
          )}
          {/* Its own scroll box (both ways), so the header sticks while the rows scroll under it. */}
          <div className={cn("relative max-h-[calc(100dvh-14rem)] min-h-40 overflow-auto rounded-b-card", card && "hidden sm:block")}>
            <table aria-label={label} className="w-full border-separate border-spacing-0 text-table">
              <thead className="sticky top-0 z-20 bg-surface-muted">
                <tr>
                  {selection && (
                    <th scope="col" className="sticky left-0 z-10 w-10 border-b border-line bg-surface-muted pl-4">
                      <input
                        type="checkbox"
                        aria-label={allSelected ? "Quitar la selección" : "Seleccionar todas las visibles"}
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        disabled={rows.length === 0}
                        onChange={selection.toggleAll}
                        className="size-4 accent-[var(--brand)]"
                      />
                    </th>
                  )}
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort!.dir === "desc" ? "descending" : "ascending") : undefined}
                        className={cn(
                          "h-9 border-b border-line px-3 text-label font-medium whitespace-nowrap text-ink-soft first:pl-4 last:pr-4",
                          c.align === "right" ? "text-right" : "text-left",
                          c.className,
                        )}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {c.sortable && sort ? (
                            <button
                              type="button"
                              onClick={() => sort.onSort(c.key)}
                              className={cn("inline-flex min-h-7 items-center gap-1 rounded-control hover:text-ink focus-visible:outline-2 focus-visible:outline-brand", active && "text-ink")}
                            >
                              {c.header}
                              {active ? (
                                sort.dir === "desc" ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />
                              ) : (
                                <ChevronsUpDown size={12} aria-hidden="true" className="opacity-40" />
                              )}
                            </button>
                          ) : (
                            c.header
                          )}
                          {c.help && (
                            <HelpTip label={typeof c.header === "string" ? c.header : c.key} side="bottom">
                              {c.help}
                            </HelpTip>
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selected = selection?.isSelected(row) ?? false;
                  return (
                    <tr
                      key={rowKey(row)}
                      onClick={
                        onRowClick
                          ? (e) => {
                              // React bubbles events through portals: a click in a dialog opened from the row
                              // (the «Vigilar» confirmation) is not a click on the row.
                              if (!e.currentTarget.contains(e.target as Node) || interactive(e.target)) return;
                              onRowClick(row);
                            }
                          : undefined
                      }
                      className={cn(
                        ROW_HEIGHT[density],
                        "group",
                        onRowClick && "cursor-pointer",
                        selected ? "bg-brand-soft" : "hover:bg-surface-muted/60",
                      )}
                    >
                      {selection && (
                        <td className={cn("sticky left-0 z-10 w-10 border-b border-line pl-4", selected ? "bg-brand-soft" : "bg-surface group-hover:bg-surface-muted")}>
                          <input
                            type="checkbox"
                            aria-label={selection.label(row)}
                            checked={selected}
                            onChange={() => selection.toggle(row)}
                            className="size-4 accent-[var(--brand)]"
                          />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={cn("border-b border-line px-3 first:pl-4 last:pr-4", c.align === "right" && "text-right tabular-nums", c.className)}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** The search box of a table toolbar. */
export function TableSearch({ value, onChange, placeholder = "Buscar…", label = "Buscar" }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <input
      type="search"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-muted focus:border-brand focus:outline-2 focus:outline-brand/40 sm:w-56 md:min-h-8"
    />
  );
}

/** The options of one facet as checkboxes with their counts (inside a chip's popover or the mobile sheet). */
export function FacetOptions<Row>({
  facet,
  selected,
  counts,
  onToggle,
}: {
  facet: Facet<Row>;
  selected: readonly string[];
  counts: Record<string, number>;
  onToggle: (optionId: string) => void;
}) {
  return (
    <fieldset className="flex flex-col">
      <legend className="sr-only">{facet.label}</legend>
      {facet.options.map((o) => (
        <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control px-2 text-[13px] hover:bg-surface-muted md:min-h-8">
          <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} className="size-4 accent-[var(--brand)]" />
          <span className="flex-1">{o.label}</span>
          <span className="font-mono text-label text-muted tabular-nums">{counts[o.id] ?? 0}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A faceted filter chip («Estado · 2»): a popover with its options. */
export function FacetFilter<Row>({
  facet,
  selection,
  counts,
  onToggle,
  onClear,
}: {
  facet: Facet<Row>;
  selection: FacetSelection;
  counts: Record<string, number>;
  onToggle: (optionId: string) => void;
  onClear: () => void;
}) {
  const selected = selection[facet.id] ?? [];
  const names = facet.options.filter((o) => selected.includes(o.id)).map((o) => o.label);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed px-3 text-[13px] font-medium md:min-h-8",
            selected.length ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong text-ink-soft hover:bg-surface-muted hover:text-ink",
          )}
        >
          <ListFilter size={14} aria-hidden="true" />
          {facet.label}
          {selected.length > 0 && (
            <span className="max-w-32 truncate font-normal">
              <span aria-hidden="true">· </span>
              {names.length > 1 ? `${names.length} elegidas` : names[0]}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <FacetOptions facet={facet} selected={selected} counts={counts} onToggle={onToggle} />
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={onClear}>
            <X size={14} aria-hidden="true" />
            Quitar filtro
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** «Vistas»: which columns are shown and the row height, plus whatever legend the table needs. */
export function ViewOptions({
  columns,
  view,
  onChange,
  always = [],
  children,
}: {
  columns: readonly { id: string; label: string }[];
  view: TableView;
  onChange: (view: TableView) => void;
  /** Columns that cannot be hidden. */
  always?: readonly string[];
  /** Extra content at the bottom of the menu (a legend). */
  children?: React.ReactNode;
}) {
  const toggle = (id: string) =>
    onChange({ ...view, columns: view.columns.includes(id) ? view.columns.filter((c) => c !== id) : [...view.columns, id] });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Columns3 size={16} aria-hidden="true" />
          Vistas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Columnas</DropdownMenuLabel>
        {columns
          .filter((c) => !always.includes(c.id))
          .map((c) => (
            <DropdownMenuCheckboxItem key={c.id} checked={view.columns.includes(c.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle(c.id)}>
              {c.label}
            </DropdownMenuCheckboxItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Densidad</DropdownMenuLabel>
        {(["comfortable", "compact"] as const).map((d) => (
          <DropdownMenuCheckboxItem key={d} checked={view.density === d} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onChange({ ...view, density: d })}>
            {d === "comfortable" ? "Cómoda (44 px)" : "Compacta (36 px)"}
          </DropdownMenuCheckboxItem>
        ))}
        {children && (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The view of a table saved in localStorage. The first render uses `fallback` (the server does not know
 * the saved one), then the saved view replaces it.
 */
export function useTableView(key: string, known: readonly string[], fallback: TableView, always: readonly string[] = []) {
  const [view, setView] = useState<TableView>(fallback);
  useEffect(() => {
    // Read once after mounting: localStorage does not exist on the server.
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(key);
    } catch {
      // Storage blocked (privacy settings): keep the default view.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(parseTableView(saved, known, fallback, always));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = (next: TableView) => {
    setView(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private mode or full storage: the view still applies for this visit.
    }
  };
  return [view, update] as const;
}

/** The floating bar of a table selection, at the bottom of the screen above the mobile navigation. */
export function SelectionBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Acciones con la selección"
      className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-2 pl-4 shadow-float sm:bottom-6"
    >
      <span className="text-[13px] font-medium" aria-live="polite">
        {count === 1 ? "1 seleccionada" : `${count} seleccionadas`}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {children}
        <Button variant="ghost" size="icon" onClick={onClear} aria-label="Quitar la selección">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

import { cn } from "@/lib/cn";

// Structure only (phase 25): toolbar slot, sticky header, rows of 44 px and an empty slot.
// Phase 29 adds faceted filters, column views, density, selection with a floating bar and the
// card layout below 640 px.

export type DataTableColumn<Row> = {
  key: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  /** Numbers align right (and use tabular figures, which the body already sets). */
  align?: "left" | "right";
  className?: string;
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
};

export function DataTable<Row>({ columns, rows, rowKey, toolbar, empty, label, className }: DataTableProps<Row>) {
  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface", className)}>
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">{toolbar}</div>}
      {rows.length === 0 && empty ? (
        empty
      ) : (
        <div className="relative overflow-x-auto">
          <table aria-label={label} className="w-full text-table">
            <thead className="sticky top-0 z-10 bg-surface-muted">
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn("h-9 px-3 text-label font-medium whitespace-nowrap text-ink-soft first:pl-4 last:pr-4", c.align === "right" ? "text-right" : "text-left", c.className)}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="h-11 border-b border-line last:border-0 hover:bg-surface-muted/60">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-3 first:pl-4 last:pr-4", c.align === "right" && "text-right", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

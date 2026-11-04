"use client";

import { ExternalLink, MessageSquareText, Users } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { followCompetitor, unfollowCompetitor } from "@/app/competitor-actions";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { RankBadge } from "@/components/ui/rank-badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { CompetitorDetail, CompetitorRow } from "@/lib/competitor-queries";
import { formatDate, formatNumber, formatRating } from "@/lib/format";
import { AppIcon } from "./app-icon";
import { ListingChange } from "./listing-change";

// Competidores › the table (phase 31): app, share as a bar inside the row, keywords in the TOP 5, best
// position, rating and the «Vigilar» switch. A row opens the competitor's panel: listing, changes,
// keywords shared with you and «Analizar reseñas».

const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

type Props = {
  appId: number;
  /** `/a/[app]/[market]`. */
  basePath: string;
  rows: CompetitorRow[];
  details: Record<string, CompetitorDetail>;
};

function ShareBar({ row, max }: { row: CompetitorRow; max: number }) {
  // Scaled to the leader, so small shares still read; the figure next to it is the real one.
  const width = max > 0 ? (100 * row.share) / max : 0;
  return (
    <span className="flex items-center justify-end gap-2">
      <span data-testid="share-bar" aria-hidden="true" className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-surface-muted sm:w-24">
        <span className="block h-2 rounded-full" style={{ width: `${width}%`, background: row.own ? "var(--series-own)" : (row.color ?? "var(--muted)") }} />
      </span>
      <span className="w-14 text-right tabular-nums">{row.share > 0 ? pct(row.share) : "–"}</span>
    </span>
  );
}

function WatchSwitch({ appId, row }: { appId: number; row: CompetitorRow }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const on = row.competitorId != null;

  const follow = () =>
    start(async () => {
      const data = new FormData();
      data.set("appId", String(appId));
      data.set("storeId", row.storeId);
      data.set("title", row.title);
      data.set("developer", row.developer);
      data.set("icon", row.icon);
      data.set("url", row.url);
      try {
        await followCompetitor(data);
        toast.success(`Vigilando ${row.title}`);
      } catch {
        toast.error(`No se pudo vigilar ${row.title}.`);
      }
    });
  const unfollow = () =>
    start(async () => {
      const data = new FormData();
      data.set("appId", String(appId));
      data.set("competitorId", String(row.competitorId));
      try {
        await unfollowCompetitor(data);
        setConfirming(false);
        toast.success(`Has dejado de vigilar ${row.title}`);
      } catch {
        toast.error(`No se pudo dejar de vigilar ${row.title}.`);
      }
    });

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Vigilar ${row.title}`}
        aria-busy={pending}
        disabled={pending}
        onClick={() => (on ? setConfirming(true) : follow())}
        className={cn(
          // 40×24 to the eye; on mobile the ::before takes the touch target to 44×44 (DESIGN.md §6).
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-1/2 md:before:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 motion-reduce:transition-none",
          on ? "border-brand bg-brand" : "border-line-strong bg-surface-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-4 rounded-full shadow-float transition-transform motion-reduce:transition-none",
            on ? "translate-x-4.5 bg-on-brand" : "translate-x-0.75 bg-surface",
          )}
        />
      </button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Dejar de vigilar {row.title}?</DialogTitle>
            <DialogDescription>Se borrará el historial de cambios de su ficha. Podrás volver a vigilarla cuando quieras.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={unfollow} disabled={pending} aria-busy={pending}>
              {pending ? "Borrando…" : "Dejar de vigilar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppCell({ row, onOpen }: { row: CompetitorRow; onOpen: () => void }) {
  return (
    <span className="flex min-w-0 items-center gap-3 py-1">
      <AppIcon src={row.icon} size={28} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          {row.own ? (
            <span className="truncate font-medium">{row.title}</span>
          ) : (
            <button type="button" onClick={onOpen} className="truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-brand">
              {row.title}
            </button>
          )}
          {row.own && <span className="shrink-0 rounded-full bg-brand-soft px-2 text-label font-medium text-brand-strong">Tu app</span>}
        </span>
        <span className="block truncate text-label text-muted">{row.developer}</span>
      </span>
    </span>
  );
}

export function CompetitorTable({ appId, basePath, rows, details }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const max = Math.max(0, ...rows.map((r) => r.share));
  const open = rows.find((r) => r.storeId === openId) ?? null;
  const detail = open ? details[open.storeId] : null;

  const columns: DataTableColumn<CompetitorRow>[] = [
    { key: "app", header: "App", cell: (r) => <AppCell row={r} onOpen={() => setOpenId(r.storeId)} />, className: "max-w-[18rem]" },
    {
      key: "share",
      header: "Cuota",
      align: "right",
      help: "Parte de los clics del TOP 5 de tus keywords que se lleva cada app, según su popularidad y la posición.",
      cell: (r) => <ShareBar row={r} max={max} />,
    },
    { key: "keywords", header: "Keywords en TOP 5", align: "right", cell: (r) => (r.keywords > 0 ? r.keywords : "–") },
    { key: "best", header: "Mejor posición", align: "right", cell: (r) => (r.bestPosition != null ? <RankBadge position={r.bestPosition} /> : "–") },
    { key: "rating", header: "Valoración", align: "right", cell: (r) => formatRating(r.rating) },
    { key: "watch", header: "Vigilar", align: "right", cell: (r) => (r.own ? null : <WatchSwitch appId={appId} row={r} />) },
  ];

  return (
    <>
      <DataTable
        label="Competidores"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.storeId}
        onRowClick={(r) => !r.own && setOpenId(r.storeId)}
        empty={<EmptyState icon={Users} title="Sin competidores todavía" description="Aparecen cuando se guardan las posiciones de tus keywords." />}
        card={(r) => (
          <div className={cn("flex flex-col gap-2 px-4 py-3", r.own && "bg-brand-soft/40")}>
            <div className="flex items-center justify-between gap-3">
              <AppCell row={r} onOpen={() => setOpenId(r.storeId)} />
              {!r.own && <WatchSwitch appId={appId} row={r} />}
            </div>
            <div className="flex items-center justify-between gap-3 text-label text-ink-soft">
              <span>
                {r.keywords > 0 ? `${r.keywords} en TOP 5` : "Fuera del TOP 5"}
                {r.rating != null && ` · ${formatRating(r.rating)}`}
              </span>
              <ShareBar row={r} max={max} />
            </div>
          </div>
        )}
      />

      <Sheet open={open != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent>
          {open && detail && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <AppIcon src={open.icon} size={44} />
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{open.title}</SheetTitle>
                    <SheetDescription className="truncate">{open.developer}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <dl className="grid grid-cols-3 gap-3 rounded-card border border-line p-3 text-center">
                <div>
                  <dt className="text-label text-muted">Cuota</dt>
                  <dd className="tabular-nums">{open.share > 0 ? pct(open.share) : "–"}</dd>
                </div>
                <div>
                  <dt className="text-label text-muted">En TOP 5</dt>
                  <dd className="tabular-nums">{open.keywords}</dd>
                </div>
                <div>
                  <dt className="text-label text-muted">Valoración</dt>
                  <dd className="tabular-nums">
                    {formatRating(open.rating)}
                    {detail.ratingsCount != null && <span className="block text-label text-muted">{formatNumber(detail.ratingsCount)}</span>}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="secondary">
                  <Link href={`${basePath}/resenas?t=${encodeURIComponent(open.storeId)}`}>
                    <MessageSquareText size={16} aria-hidden="true" />
                    Analizar reseñas
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <a href={open.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} aria-hidden="true" />
                    Ver en la tienda
                  </a>
                </Button>
                <span className="ml-auto flex items-center gap-2 text-table text-ink-soft">
                  Vigilar <WatchSwitch appId={appId} row={open} />
                </span>
              </div>

              <section aria-labelledby="sheet-listing" className="flex flex-col gap-1.5">
                <h3 id="sheet-listing" className="text-table font-semibold">
                  Ficha
                </h3>
                {detail.listing ? (
                  <>
                    {detail.listing.shortDescription && <p className="text-table text-ink">{detail.listing.shortDescription}</p>}
                    <p className="line-clamp-6 text-table whitespace-pre-line text-ink-soft">{detail.listing.description}</p>
                    <p className="text-label text-muted">
                      {[
                        detail.listing.version && `Versión ${detail.listing.version}`,
                        detail.listing.category,
                        `${detail.listing.screenshots} capturas`,
                        detail.checkedAt && `comprobada el ${formatDate(detail.checkedAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {detail.error && <p className="text-label text-danger">Último error: {detail.error}</p>}
                  </>
                ) : (
                  <p className="text-table text-ink-soft">Activa «Vigilar» para guardar su ficha y ver sus cambios cada día.</p>
                )}
              </section>

              {open.competitorId != null && (
                <section aria-labelledby="sheet-changes" className="flex flex-col gap-1.5">
                  <h3 id="sheet-changes" className="text-table font-semibold">
                    Cambios
                  </h3>
                  {detail.changes.length === 0 ? (
                    <p className="text-table text-ink-soft">Sin cambios desde que la vigilas.</p>
                  ) : (
                    <ol className="flex flex-col gap-3 border-l border-line pl-4">
                      {detail.changes.map((e) => (
                        <li key={e.date.toString()} className="relative text-table">
                          <span aria-hidden="true" className="absolute top-1.5 -left-5.25 size-2 rounded-full bg-line-strong" />
                          <span className="block text-label text-muted">{formatDate(e.date)}</span>
                          <ul className="flex flex-col gap-1.5">
                            {e.changes.map((c) => (
                              <li key={c.field}>
                                <ListingChange change={c} />
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}

              <section aria-labelledby="sheet-shared" className="flex flex-col gap-1.5">
                <h3 id="sheet-shared" className="text-table font-semibold">
                  Keywords compartidas contigo ({detail.shared.length})
                </h3>
                {detail.shared.length === 0 ? (
                  <p className="text-table text-ink-soft">No aparece en el TOP 5 de tus keywords ahora mismo.</p>
                ) : (
                  <ul className="flex flex-col">
                    {detail.shared.slice(0, 30).map((k) => (
                      <li key={k.keywordId} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-table last:border-0">
                        <Link href={`${basePath}/keywords?k=${k.keywordId}`} className="min-w-0 truncate hover:underline">
                          {k.term}
                        </Link>
                        <span className="flex shrink-0 items-center gap-2 text-label text-muted">
                          <RankBadge position={k.position} />
                          <span>· tu app</span>
                          {k.ownPosition != null ? <RankBadge position={k.ownPosition} /> : <span>fuera del TOP 5</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

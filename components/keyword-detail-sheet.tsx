"use client";

import { ExternalLink, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { setKeywordIntent } from "@/app/keyword-actions";
import { Button } from "@/components/ui/button";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { RankBadge } from "@/components/ui/rank-badge";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/format";
import type { KeywordPanelData } from "@/lib/keyword-panel";
import { ORIGIN_GROUP, ORIGIN_LABEL } from "@/lib/keyword-table";
import { rankStatus } from "@/lib/ranking";
import { AppIcon } from "./app-icon";
import { useRemoveKeywords } from "./keyword-selection";
import { RankChart } from "./rank-chart";
import { RelevanceSelect } from "./relevance-select";
import { difficultyLabel } from "./scores";

const fmtAvg = (n: number | null) => (n == null ? "–" : `#${Math.round(n)}`);

/**
 * The detail of a keyword without leaving the table (`?k=<id>`), 480 px from the right: position over
 * 90 days with the annotations, the TOP 10 with your app and watched competitors marked, relevance and
 * intent, where the keyword appears in your listing, and «Analizar TOP 10» / «Quitar».
 */
export function KeywordDetailSheet({
  appId,
  keywordId,
  loaded,
  data,
  basePath,
  onClose,
}: {
  /** The data for `keywordId` has arrived (it may be null: the keyword is not followed any more). */
  loaded: boolean;
  appId: number;
  /** The keyword opened; null closes the panel. */
  keywordId: number | null;
  /** Null while it loads (or when the keyword is not followed any more). */
  data: KeywordPanelData | null;
  /** `/a/[app]/[market]`, for the links. */
  basePath: string;
  onClose: () => void;
}) {
  const { remove, pending } = useRemoveKeywords(appId);
  const ready = loaded && data != null && data.id === keywordId;
  return (
    <Sheet open={keywordId != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined} className="gap-5">
        {loaded && !ready ? (
          <>
            <SheetHeader>
              <SheetTitle>Keyword no encontrada</SheetTitle>
            </SheetHeader>
            <p className="text-[13px] text-ink-soft">Ya no la sigues en este mercado.</p>
          </>
        ) : !ready ? (
          <>
            <SheetHeader>
              <SheetTitle>Cargando keyword…</SheetTitle>
            </SheetHeader>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : (
          <PanelBody data={data} appId={appId} basePath={basePath} removing={pending} onRemove={() => remove([data.id], onClose)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({ data, appId, basePath, removing, onRemove }: { data: KeywordPanelData; appId: number; basePath: string; removing: boolean; onRemove: () => void }) {
  const reachable = rankStatus(data.position) === "within-reach";
  const markers = data.annotations.map(({ date, index }) => ({ date, index }));
  const hasHistory = data.series.some((p) => p.position != null);
  const checked = data.series.some((p) => p.state !== "none");
  const watched = new Set(data.watched);
  return (
    <>
      <SheetHeader>
        <SheetTitle className="break-words">{data.term}</SheetTitle>
        <SheetDescription>
          {ORIGIN_LABEL[ORIGIN_GROUP[data.source]]}
          {data.checkedOn && ` · consultada el ${formatDay(data.checkedOn)}`}
        </SheetDescription>
      </SheetHeader>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Posición">
          <span className="inline-flex items-center gap-1">
            {data.checkedOn ? <RankBadge position={data.position} depth={data.depth ?? undefined} reachable={reachable} /> : "–"}
            <DeltaBadge delta={data.changeWeek} />
          </span>
        </Kpi>
        <Kpi label="Popularidad">{data.popularity ?? "–"}</Kpi>
        <Kpi label="Dificultad">{data.difficulty != null ? `${difficultyLabel(data.difficulty)} ${data.difficulty}` : "–"}</Kpi>
        <Kpi label="Oportunidad">
          <span className="font-semibold">{data.opportunity ?? "–"}</span>
        </Kpi>
      </dl>

      <section aria-label="Posición a 90 días" className="flex flex-col gap-2">
        <h3 className="text-label font-medium text-ink-soft">Posición · 90 días</h3>
        {hasHistory ? (
          <div className="-mx-2">
            <RankChart data={data.series} markers={markers} depth={data.axisDepth} />
          </div>
        ) : (
          <p className="text-[13px] text-muted">
            {checked ? "No ha aparecido entre los resultados de la tienda en estos 90 días." : "Aún no hay posiciones: se consultan cada día."}
          </p>
        )}
        {data.annotations.length > 0 && (
          <ol className="flex flex-col gap-1 text-[13px]">
            {data.annotations.map((a) => (
              <li key={`${a.index}-${a.date}`} className="flex items-baseline gap-2">
                <span className="w-4 shrink-0 font-mono text-label font-semibold">{a.index}</span>
                <span className="shrink-0 text-muted">{formatDay(a.date)}</span>
                <span className="min-w-0 flex-1 truncate" title={a.label}>
                  {a.label}
                </span>
                <span className="shrink-0 font-mono text-label text-ink-soft tabular-nums">
                  {fmtAvg(a.before)} → {fmtAvg(a.after)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Relevancia e intención" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-label font-medium text-ink-soft">Relevancia</h3>
          <RelevanceSelect appId={appId} keywordId={data.id} term={data.term} value={data.relevance} source={data.relevanceSource} reason={null} />
        </div>
        <IntentSelect appId={appId} keywordId={data.id} term={data.term} value={data.intent} />
      </section>

      <section aria-label="Dónde aparece en tu ficha" className="flex flex-col gap-1.5">
        <h3 className="text-label font-medium text-ink-soft">Dónde aparece en tu ficha {data.coverage.against === "draft" ? "(borrador)" : "(publicada)"}</h3>
        {data.coverage.fields.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {data.coverage.fields.map((f) => (
              <li key={f} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-label text-ink">
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-soft">
            {data.coverage.partial ? "Están todas sus palabras, pero no juntas." : "No aparece."}{" "}
            <Link href={`${basePath}/ficha`} className="text-link hover:underline">
              Abrir la ficha
            </Link>
          </p>
        )}
      </section>

      <section aria-label={`TOP ${data.topSize}`} className="flex flex-col gap-1.5">
        <h3 className="text-label font-medium text-ink-soft">TOP {data.topSize}</h3>
        {data.top.length === 0 ? (
          <p className="text-[13px] text-muted">Sin datos todavía.</p>
        ) : (
          <ol className="flex flex-col">
            {data.top.map((t, i) => {
              const role = t.id === data.ownStoreId ? "own" : watched.has(t.id) ? "watched" : null;
              return (
                <li key={t.id} className={cn("flex min-h-11 items-center gap-2.5 rounded-control px-2 py-1", role === "own" && "bg-brand-soft")}>
                  <span className="w-6 shrink-0 font-mono text-label text-muted tabular-nums">#{i + 1}</span>
                  <span className={cn("shrink-0 rounded-[7px]", role === "own" && "ring-2 ring-brand", role === "watched" && "ring-2 ring-watched")}>
                    <AppIcon src={t.icon} size={28} />
                  </span>
                  <a href={t.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] hover:underline">
                    {t.title}
                  </a>
                  {role && <span className="shrink-0 text-label text-ink-soft">{role === "own" ? "Tu app" : "Vigilado"}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <SheetFooter className="sm:justify-between">
        <Button variant="ghost" className="text-danger" onClick={onRemove} disabled={removing} aria-busy={removing}>
          <Trash2 size={16} aria-hidden="true" />
          {removing ? "Quitando…" : "Quitar"}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" asChild>
            <Link href={`${basePath}/keywords/${data.id}`}>
              <ExternalLink size={16} aria-hidden="true" />
              Página completa
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`${basePath}/encontrar?${new URLSearchParams({ fuente: "top10", seed: data.term })}`}>
              <Trophy size={16} aria-hidden="true" />
              Analizar TOP 10
            </Link>
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-line px-3 py-2">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="font-mono text-[15px] tabular-nums">{children}</dd>
    </div>
  );
}

const INTENTS = [
  { value: "own", label: "Buscan una app como la tuya" },
  { value: "foreign", label: "Buscan otro tipo de app" },
] as const;

function IntentSelect({ appId, keywordId, term, value }: { appId: number; keywordId: number; term: string; value: "own" | "foreign" | null }) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(value);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label font-medium text-ink-soft">Intención</span>
      <select
        aria-label={`Intención de ${term}`}
        value={shown ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as "own" | "foreign";
          startTransition(async () => {
            setShown(next);
            const result = await setKeywordIntent(appId, keywordId, next);
            if (result.error) toast.error(result.error);
          });
        }}
        className="min-h-11 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:border-brand focus:outline-2 focus:outline-brand/50 md:min-h-8"
      >
        {shown == null && <option value="">Sin estimar</option>}
        {INTENTS.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
}

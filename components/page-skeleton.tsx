import { cn } from "@/lib/cn";
import { Card, Skeleton } from "./ui";
import { SkeletonChart, SkeletonKpi, SkeletonTable, SkeletonText } from "./ui/skeleton";

// The loading.tsx of every route: placeholders with the shape of the real screen (DESIGN.md §5,
// REDISENO_UX §7.5), so navigation answers at once and nothing jumps when the data arrives.

function Frame({ label, gap = "gap-6", children }: { label: string; gap?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col", gap)} aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

/** PageHeader: title, a line of context and, on the right, the actions. */
export function SkeletonHeader({ actions = 1, context = true }: { actions?: number; context?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        {context && <Skeleton className="h-3.5 w-72 max-w-[70vw]" />}
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className={cn("h-11 md:h-8", i === 0 ? "w-36" : "w-11 md:w-8")} />
          ))}
        </div>
      )}
    </div>
  );
}

function Kpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonKpi key={i} />
      ))}
    </div>
  );
}

/** A card with a title and a few rows (lists, «Qué hacer hoy», movements). */
function ListCard({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-3 p-4 sm:p-5", className)}>
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </Card>
  );
}

/** A table toolbar: search box, facets and «Vistas». */
function Toolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-11 w-64 max-w-full md:h-8" />
      <Skeleton className="h-11 w-24 md:h-8" />
      <Skeleton className="h-11 w-24 md:h-8" />
      <Skeleton className="ml-auto h-11 w-20 md:h-8" />
    </div>
  );
}

/** Generic page (the fallback of a segment without its own). */
export function PageSkeleton({ label = "Cargando" }: { label?: string }) {
  return (
    <Frame label={label}>
      <SkeletonHeader />
      <Card className="flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-1/3" />
        <SkeletonText lines={3} />
      </Card>
      <SkeletonTable rows={6} columns={5} />
    </Frame>
  );
}

/** Resumen of a market: KPIs, the visibility chart, «Qué hacer hoy» and movements, competition. */
export function SummarySkeleton() {
  return (
    <Frame label="Cargando el resumen">
      <SkeletonHeader actions={0} />
      <Kpis />
      <SkeletonChart height={240} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard />
        <ListCard />
      </div>
    </Frame>
  );
}

/** Keywords › Seguimiento: header, toolbar and the table. */
export function TableSkeleton({ label = "Cargando la tabla", columns = 7, kpis = false }: { label?: string; columns?: number; kpis?: boolean }) {
  return (
    <Frame label={label} gap="gap-4">
      <SkeletonHeader />
      {kpis && <Kpis />}
      <Toolbar />
      <SkeletonTable rows={10} columns={columns} />
    </Frame>
  );
}

/** A keyword's page: title, KPIs and the position chart. */
export function KeywordSkeleton() {
  return (
    <Frame label="Cargando la keyword">
      <SkeletonHeader />
      <Kpis count={3} />
      <SkeletonChart height={260} />
      <SkeletonTable rows={5} columns={4} />
    </Frame>
  );
}

/** Encontrar: the seed field, source tabs and the candidate list. */
export function FindSkeleton() {
  return (
    <Frame label="Buscando keywords" gap="gap-5">
      <SkeletonHeader actions={0} />
      <div className="flex flex-wrap items-end gap-2">
        <Skeleton className="h-11 flex-[1_1_280px] md:h-9" />
        <Skeleton className="h-11 w-28 md:h-9" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <SkeletonTable rows={10} columns={5} />
    </Frame>
  );
}

/** Competidores: the visibility bars and the table. */
export function CompetitorsSkeleton() {
  return (
    <Frame label="Cargando los competidores">
      <SkeletonHeader />
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <Skeleton className="h-4 w-44" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-7 shrink-0" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 flex-1" style={{ maxWidth: `${80 - i * 12}%` }} />
          </div>
        ))}
      </Card>
      <SkeletonTable rows={6} columns={6} />
    </Frame>
  );
}

/** Reseñas: the three columns of asks and the analysis cards. */
export function ReviewsSkeleton() {
  return (
    <Frame label="Cargando las reseñas">
      <SkeletonHeader />
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <Skeleton className="h-4 w-52" />
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonText key={i} lines={4} />
          ))}
        </div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <ListCard rows={3} />
        <ListCard rows={3} />
      </div>
    </Frame>
  );
}

/** Tendencias: coming peaks and the month heat map. */
export function TrendsSkeleton() {
  return (
    <Frame label="Cargando las tendencias">
      <SkeletonHeader actions={0} />
      <ListCard rows={3} />
      <Card className="flex flex-col gap-2 p-4 sm:p-5">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 6 }, (_, r) => (
          <div key={r} className="flex items-center gap-1">
            <Skeleton className="mr-2 h-3.5 w-28 shrink-0" />
            {Array.from({ length: 12 }, (_, c) => (
              <Skeleton key={c} className="h-6 flex-1" />
            ))}
          </div>
        ))}
      </Card>
    </Frame>
  );
}

/** Ficha de la tienda: the top bar, the editor (60 %) and the side panel (40 %). */
export function ListingSkeleton() {
  return (
    <Frame label="Cargando la ficha">
      <SkeletonHeader actions={0} />
      <Skeleton className="h-14 w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="flex flex-col gap-5 p-5">
          {[1, 2, 6].map((lines, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="w-full" style={{ height: lines * 22 + 16 }} />
            </div>
          ))}
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-24" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </Card>
      </div>
    </Frame>
  );
}

/** Ficha › Publicar: the field-by-field diff and the publish form. */
export function PublishSkeleton() {
  return (
    <Frame label="Cargando la publicación">
      <SkeletonHeader actions={0} />
      <Card className="flex flex-col gap-4 p-5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-32" />
            <SkeletonText lines={2} />
          </div>
        ))}
      </Card>
      <Skeleton className="h-11 w-44 md:h-9" />
    </Frame>
  );
}

/** Cambios y pruebas: the timeline. */
export function ChangesSkeleton() {
  return (
    <Frame label="Cargando los cambios" gap="gap-8">
      <SkeletonHeader />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <ol className="flex flex-col gap-4 border-l border-line pl-5">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </li>
          ))}
        </ol>
      </div>
    </Frame>
  );
}

/** Ajustes de la app: tabs and a card with a form. */
export function SettingsSkeleton() {
  return (
    <Frame label="Cargando los ajustes" gap="gap-4">
      <Skeleton className="h-6 w-44" />
      <div className="flex gap-1 border-b border-line pb-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <SettingsTabSkeleton />
    </Frame>
  );
}

/** One tab of Ajustes (under the tabs, which stay). */
export function SettingsTabSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-10 w-full" />
      <Card className="flex flex-col gap-4 p-5">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-11 w-full md:h-9" />
          </div>
        ))}
      </Card>
      <Card className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-card" />
        ))}
      </Card>
    </div>
  );
}

/** Creativos: a bar on top, then the element list, the canvas and the inspector. */
export function StudioSkeleton() {
  return (
    <Frame label="Cargando el editor" gap="gap-4">
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-card" />
      <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)_320px]">
        <Card className="flex gap-2 p-3 xl:flex-col">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-16 xl:w-full" />
          ))}
        </Card>
        <Card className="flex items-center justify-center p-6">
          <Skeleton className="h-96 w-56" />
        </Card>
        <Card className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      </div>
    </Frame>
  );
}

/** Actividad: filter chips and the list of events. */
export function ActivitySkeleton() {
  return (
    <Frame label="Cargando la actividad">
      <SkeletonHeader actions={2} />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <ListCard rows={8} />
    </Frame>
  );
}

/** Integraciones: a grid of cards. */
export function IntegrationsSkeleton() {
  return (
    <Frame label="Cargando las integraciones">
      <SkeletonHeader actions={0} />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9" />
              <Skeleton className="h-4 w-40" />
            </div>
            <SkeletonText lines={2} />
          </Card>
        ))}
      </div>
    </Frame>
  );
}

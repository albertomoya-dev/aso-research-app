"use client";

import { Bell, KeyRound, MoreHorizontal, Plus, RefreshCw, Search, Settings, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Card, inputClass, PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTip } from "@/components/ui/help-tip";
import { KpiCard } from "@/components/ui/kpi-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RankBadge } from "@/components/ui/rank-badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton, SkeletonChart, SkeletonKpi, SkeletonTable, SkeletonText } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { StatusDot } from "@/components/ui/status-dot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SWATCHES = [
  "bg",
  "surface",
  "surface-muted",
  "line",
  "line-strong",
  "ink",
  "ink-soft",
  "muted",
  "brand",
  "brand-soft",
  "up",
  "down",
  "warn-fg",
  "danger",
  "series-own",
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
];

const TYPE = [
  ["text-label", "12 · etiquetas"],
  ["text-table", "13 · tablas"],
  ["text-body", "14 · texto"],
  ["text-card-title", "16 · título de tarjeta"],
  ["text-page-title", "20 · título de página"],
  ["text-kpi", "28 · cifra KPI"],
  ["text-kpi-lg", "32 · cifra KPI grande"],
] as const;

type Row = { id: number; term: string; position: number | null; delta: number | null; status?: "entered" | "left"; reachable?: boolean };
const ROWS: Row[] = [
  { id: 1, term: "recordatorio pastillas", position: 3, delta: 2 },
  { id: 2, term: "alarma medicamentos", position: 14, delta: -3, reachable: true },
  { id: 3, term: "pastillero", position: 22, delta: null, status: "entered" },
  { id: 4, term: "control de tomas", position: null, delta: null, status: "left" },
  { id: 5, term: "aviso medicina", position: 9, delta: 0 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-label font-medium tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function UiShowcase({ theme }: { theme: "light" | "dark" }) {
  const name = theme === "light" ? "Claro" : "Oscuro";
  return (
    <div data-theme={theme} data-testid={`showcase-${theme}`} className="flex min-w-0 flex-col gap-8 rounded-card border border-line bg-bg p-5 text-ink">
      <h2 className="text-card-title font-semibold">Tema {name.toLowerCase()}</h2>

      <Section title="Tokens">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <li key={s} className="flex items-center gap-2 text-label text-ink-soft">
              <span aria-hidden="true" className="size-5 shrink-0 rounded-control border border-line" style={{ background: `var(--${s})` }} />
              {s}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografía">
        <div className="flex flex-col gap-1">
          {TYPE.map(([cls, label]) => (
            <p key={cls} className={`${cls} text-ink`}>
              {label}
            </p>
          ))}
          <p className="font-mono text-[13px] text-ink-soft">JetBrains Mono · 0123456789 · ANTHROPIC_API_KEY</p>
        </div>
      </Section>

      <Section title="Cabecera de página">
        <PageHeader
          title="Keywords"
          actions={
            <>
              <Button variant="primary">
                <RefreshCw size={14} aria-hidden="true" />
                Actualizar posiciones
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Más acciones">
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Esta app</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <RefreshCw aria-hidden="true" />
                    Actualizar ficha
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Smartphone aria-hidden="true" />
                    Ver en la tienda
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Settings aria-hidden="true" />
                    Ajustes de la app
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        >
          Posiciones del 3 de noviembre en Google Play · España
        </PageHeader>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Principal</Button>
          <Button>Secundario</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Dejar de seguir</Button>
          <Button variant="primary" disabled>
            Desactivado
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Pequeño</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
          <Button size="icon" aria-label="Añadir">
            <Plus size={16} aria-hidden="true" />
          </Button>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] text-ink-soft">
          Campo de texto
          <input className={inputClass} placeholder="Busca una app o pega su enlace" />
        </label>
      </Section>

      <Section title="KPIs">
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="En el TOP 10"
            value="12"
            delta={{ delta: 3, noun: "keywords" }}
            hint="frente a la semana pasada"
            help={<HelpTip label="En el TOP 10">Keywords relevantes en las 10 primeras posiciones.</HelpTip>}
          />
          <KpiCard
            label="Cuota de visibilidad"
            value="18 %"
            delta={{ delta: -2, unit: " pp", noun: "puntos" }}
            sparkline={{ values: [12, 13, 15, 14, null, 17, 19, 18], label: "Cuota de 12 % a 18 % en 8 días" }}
          />
          <KpiCard label="Avisos sin leer" value="4" delta={{ delta: 0 }} />
        </div>
      </Section>

      <Section title="Variación, posición y estado">
        <div className="flex flex-wrap items-center gap-2">
          <DeltaBadge delta={3} />
          <DeltaBadge delta={-2} />
          <DeltaBadge delta={0} />
          <DeltaBadge status="entered" />
          <DeltaBadge status="left" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RankBadge position={4} />
          <RankBadge position={14} reachable />
          <RankBadge position={null} />
          <RankBadge position={null} depth={200} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <StatusDot status="good" />
          <StatusDot status="warn" />
          <StatusDot status="bad" />
          <StatusDot status="unknown" />
        </div>
        <div className="flex items-center gap-3">
          <Sparkline values={[18, 15, 14, null, 11, 9, 8]} invert label="Posición de #18 a #8 en 7 días" />
          <span className="flex items-center gap-1 text-[13px] text-ink-soft">
            Dificultad
            <HelpTip label="Dificultad">Lo difícil que es entrar en el TOP 10, según la fuerza de las apps que ya están.</HelpTip>
          </span>
        </div>
      </Section>

      <Section title="Tabla">
        <DataTable
          label={`Keywords de ejemplo (${name})`}
          rows={ROWS}
          rowKey={(r) => r.id}
          toolbar={
            <>
              <span className="relative flex min-w-0 flex-1 items-center">
                <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-muted" />
                <input aria-label="Buscar keyword" placeholder="Buscar keyword" className={`${inputClass} w-full pl-8`} />
              </span>
              <Button size="sm">Filtros</Button>
            </>
          }
          columns={[
            { key: "term", header: "Keyword", cell: (r) => <span className="font-medium">{r.term}</span> },
            { key: "pos", header: "Posición", align: "right", cell: (r) => <RankBadge position={r.position} reachable={r.reachable} /> },
            { key: "delta", header: "Cambio", align: "right", cell: (r) => <DeltaBadge delta={r.delta} status={r.status} /> },
          ]}
        />
        <DataTable
          label={`Tabla vacía (${name})`}
          rows={[] as Row[]}
          rowKey={(r) => r.id}
          columns={[{ key: "term", header: "Keyword", cell: (r) => r.term }]}
          empty={
            <EmptyState
              icon={KeyRound}
              title="Aún no sigues ninguna keyword"
              description="Añade las búsquedas por las que quieres que te encuentren."
              action={<Button variant="primary">Añadir keywords</Button>}
            />
          }
        />
      </Section>

      <Section title="Capas flotantes">
        <div className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Abrir diálogo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Preferencias del resumen</DialogTitle>
                <DialogDescription>Elige cuándo te llega el resumen semanal.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Cancelar</Button>
                </DialogClose>
                <Button variant="primary">Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button>Abrir panel</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>alarma medicamentos</SheetTitle>
                <SheetDescription>Posición, TOP 10 y dónde aparece en tu ficha.</SheetDescription>
              </SheetHeader>
              <SkeletonChart height={160} />
            </SheetContent>
          </Sheet>
          <Popover>
            <PopoverTrigger asChild>
              <Button>Abrir popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="font-medium">Filtrar por estado</p>
              <p className="mt-1 text-[13px] text-ink-soft">Los filtros por facetas llegan en la fase 29.</p>
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" aria-label="Avisos">
                <Bell size={16} aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Avisos sin leer</TooltipContent>
          </Tooltip>
          <Button onClick={() => toast.success("38 ideas descartadas", { description: "Ya no aparecerán en la lista." })}>Mostrar aviso</Button>
        </div>
        <Tabs defaultValue="preview">
          <TabsList aria-label="Vistas de la ficha">
            <TabsTrigger value="preview">Vista previa</TabsTrigger>
            <TabsTrigger value="coverage">Cobertura</TabsTrigger>
            <TabsTrigger value="rules">Normas</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <Card className="p-4 text-[13px] text-ink-soft">Así se verá tu ficha en Google Play.</Card>
          </TabsContent>
          <TabsContent value="coverage">
            <Card className="p-4 text-[13px] text-ink-soft">12 de 15 keywords relevantes aparecen en la ficha.</Card>
          </TabsContent>
          <TabsContent value="rules">
            <Card className="p-4 text-[13px] text-ink-soft">Sin avisos de las normas de la tienda.</Card>
          </TabsContent>
        </Tabs>
        <Command label={`Buscar (${name})`} className="border border-line">
          <CommandInput placeholder="Busca una app, una keyword o una acción" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup heading="Acciones">
              <CommandItem>
                <RefreshCw aria-hidden="true" />
                Actualizar posiciones
                <CommandShortcut>⌘R</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Plus aria-hidden="true" />
                Añadir keywords
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Section>

      <Section title="Cargando">
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonKpi />
          <Card className="p-4">
            <SkeletonText lines={3} />
          </Card>
        </div>
        <SkeletonTable rows={3} />
        <Skeleton className="h-8 w-40" />
      </Section>
    </div>
  );
}

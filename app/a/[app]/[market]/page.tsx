import type { Metadata } from "next";
import { Competition, Movements, NextSteps, SummaryKpis, VisibilitySection } from "@/components/market-summary";
import { PageHeader } from "@/components/ui";
import { SHARE_RANGES, type ShareDays } from "@/lib/competitor-queries";
import { getCountry } from "@/lib/countries";
import { loadMarketParams } from "@/lib/products";

// The market's Resumen (phase 28): the week in four figures, visibility with the changes on it, what to do
// next, the week's movements and the competition in one line. The keyword table lives at `…/keywords`.

// The header's «Actualizar posiciones» posts to the current page: this is the time it gets.
export const maxDuration = 120;

type Props = { params: Promise<{ app: string; market: string }>; searchParams: Promise<{ dias?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await loadMarketParams(params);
  return { title: `Resumen · ${app.title}` };
}

export default async function SummaryPage({ params, searchParams }: Props) {
  const app = await loadMarketParams(params);
  const { dias } = await searchParams;
  const days = (SHARE_RANGES.find((d) => String(d) === dias) ?? 30) as ShareDays;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Resumen">Cómo va tu app en {getCountry(app.country).name} esta semana.</PageHeader>
      <SummaryKpis app={app} days={days} />
      <VisibilitySection app={app} days={days} ranges={SHARE_RANGES} />
      <div className="grid gap-6 lg:grid-cols-2">
        <NextSteps app={app} />
        <Movements app={app} />
      </div>
      <Competition app={app} days={days} />
    </div>
  );
}

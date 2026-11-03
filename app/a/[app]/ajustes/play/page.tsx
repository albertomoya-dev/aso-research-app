import { Store } from "lucide-react";
import type { Metadata } from "next";
import { OfficialStatsCard } from "@/components/official-stats";
import { Card } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { getCountry } from "@/lib/countries";
import { loadContextMarket } from "@/lib/products";
import { getKeywordRows } from "@/lib/queries";
import { getOfficialStats } from "@/lib/search-term-queries";

export const metadata: Metadata = { title: "Datos de Play Console" };

type Props = { params: Promise<{ app: string }>; searchParams: Promise<{ m?: string | string[] }> };

/** Ajustes › Datos de Play Console: the search terms CSV of the market in context (they are per country). */
export default async function PlayDataPage({ params, searchParams }: Props) {
  const app = await loadContextMarket((await params).app, (await searchParams).m);
  if (app.store !== "android") {
    return (
      <Card>
        <EmptyState icon={Store} title="Solo para Google Play" description="App Store Connect no exporta los términos de búsqueda en un CSV." />
      </Card>
    );
  }
  const [stats, rows] = await Promise.all([getOfficialStats(app.id), getKeywordRows(app)]);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-table text-ink-soft">Datos de {getCountry(app.country).name}. Cambia de país con el selector de mercado de arriba.</p>
      <OfficialStatsCard appId={app.id} stats={stats} tracked={new Set(rows.map((r) => r.term))} />
    </div>
  );
}

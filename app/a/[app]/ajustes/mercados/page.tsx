import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AddMarketDialog } from "@/components/add-market-dialog";
import { Card } from "@/components/ui";
import { getDb, schema } from "@/db";
import { flag } from "@/lib/app-nav";
import { COUNTRIES, getCountry } from "@/lib/countries";
import { formatDay } from "@/lib/format";
import { loadContextMarket, loadProduct, marketPath } from "@/lib/products";

export const metadata: Metadata = { title: "Mercados" };

type Props = { params: Promise<{ app: string }>; searchParams: Promise<{ m?: string | string[] }> };

/** Ajustes › Mercados: the countries the app is followed in, and «+ Añadir mercado». */
export default async function MarketsSettingsPage({ params, searchParams }: Props) {
  const { app: slug } = await params;
  const [product, context] = await Promise.all([loadProduct(slug), loadContextMarket(slug, (await searchParams).m)]);
  const markets = await getDb()
    .select({ id: schema.apps.id, country: schema.apps.country, since: schema.apps.createdAt, keywords: count(schema.appKeywords.keywordId) })
    .from(schema.apps)
    .leftJoin(schema.appKeywords, eq(schema.appKeywords.appId, schema.apps.id))
    .where(eq(schema.apps.productId, product.id))
    .groupBy(schema.apps.id)
    .orderBy(schema.apps.id);
  const taken = new Set(markets.map((m) => m.country));
  const lang = getCountry(context.country).lang;
  const available = COUNTRIES.filter((c) => !taken.has(c.code));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-card-title font-semibold">Mercados</h2>
          <p className="mt-1 text-table text-ink-soft">Cada país tiene sus keywords, posiciones, reseñas y borradores. El producto y los creativos son comunes.</p>
        </div>
        <AddMarketDialog
          available={available.map((c) => ({ code: c.code, label: `${c.name} · ${c.locale}` }))}
          sources={markets.map((m) => ({ id: m.id, label: `${getCountry(m.country).name} (${m.keywords} keywords)` }))}
          defaultCountry={available.find((c) => c.lang === lang)?.code}
          defaultSource={context.id}
        />
      </div>
      <Card className="overflow-hidden">
        <ul>
          {markets.map((m, i) => {
            const c = getCountry(m.country);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-0">
                <span aria-hidden="true" className="w-7 shrink-0 text-center text-lg">
                  {flag(m.country)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {c.name} <span className="font-mono text-label text-muted">{c.locale}</span>
                    {i === 0 && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-label text-ink-soft">Principal</span>}
                  </div>
                  <div className="text-table text-muted">
                    {m.keywords === 1 ? "1 keyword" : `${m.keywords} keywords`} · desde el {formatDay(m.since.toISOString())}
                  </div>
                </div>
                <Link href={marketPath({ productSlug: product.slug, country: m.country }, "/keywords")} className="inline-flex min-h-11 items-center text-table text-link hover:underline md:min-h-8">
                  Abrir
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-table text-muted">
        Para dejar de seguir un país, ve a la{" "}
        <Link href={`/a/${product.slug}/ajustes/peligro`} className="text-link underline">
          zona de peligro
        </Link>
        .
      </p>
    </div>
  );
}

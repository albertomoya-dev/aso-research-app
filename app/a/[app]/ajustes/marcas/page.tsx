import type { Metadata } from "next";
import { BrandList } from "@/components/brand-list";
import { detectBrands } from "@/lib/brand-queries";
import { getCountry } from "@/lib/countries";
import { getProductFacts } from "@/lib/product-queries";
import { loadContextMarket } from "@/lib/products";
import { getKeywordRows } from "@/lib/queries";

export const metadata: Metadata = { title: "Marcas" };

type Props = { params: Promise<{ app: string }>; searchParams: Promise<{ m?: string | string[] }> };

/**
 * Ajustes › Marcas: the competitor brands the AI avoids and the words marked «no es una marca». The
 * exceptions are the app's; the brands are detected from the TOP 5 of the keywords of the market in context.
 */
export default async function BrandsSettingsPage({ params, searchParams }: Props) {
  const app = await loadContextMarket((await params).app, (await searchParams).m);
  const [rows, product] = await Promise.all([getKeywordRows(app), getProductFacts(app.id)]);
  const { titleBrands, developers, exceptions } = await detectBrands(app, rows, product);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-card-title font-semibold">Marcas</h2>
        <p className="mt-1 text-table text-ink-soft">Detectadas en el TOP 5 de tus keywords de {getCountry(app.country).name}. Las excepciones valen para todos los países.</p>
      </div>
      <BrandList appId={app.id} brands={titleBrands} developers={developers} exceptions={exceptions} />
    </div>
  );
}

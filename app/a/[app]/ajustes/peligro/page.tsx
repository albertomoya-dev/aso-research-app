import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { UnfollowDialog } from "@/components/unfollow-dialog";
import { flag } from "@/lib/app-nav";
import { getCountry } from "@/lib/countries";
import { loadProduct, productMarkets, unfollowConfirmation } from "@/lib/products";

export const metadata: Metadata = { title: "Zona de peligro" };

type Props = { params: Promise<{ app: string }> };

/** Ajustes › Zona de peligro: «Dejar de seguir» each market, the only place it lives. */
export default async function DangerZonePage({ params }: Props) {
  const product = await loadProduct((await params).app);
  const markets = await productMarkets(product.id);
  const names = new Map(markets.map((m) => [m.id, getCountry(m.country).name]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-card-title font-semibold">Zona de peligro</h2>
        <p className="mt-1 text-table text-ink-soft">Dejar de seguir un país borra sus keywords y su histórico. No se puede deshacer.</p>
      </div>
      <Card className="overflow-hidden border-danger-soft">
        <ul>
          {markets.map((m) => {
            const name = names.get(m.id)!;
            const others = markets.filter((o) => o.id !== m.id).map((o) => names.get(o.id)!);
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="w-7 shrink-0 text-center text-lg">
                    {flag(m.country)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">
                      {product.title} en {name}
                    </div>
                    <div className="text-table text-muted">
                      {others.length === 0 ? "Es el último país: también se borran el producto, las marcas y los creativos." : "El producto, las marcas y los creativos se conservan."}
                    </div>
                  </div>
                </div>
                <UnfollowDialog appId={m.id} title={product.title} countryName={name} message={unfollowConfirmation(product.title, name, others)} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

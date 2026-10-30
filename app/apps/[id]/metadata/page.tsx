import type { Metadata } from "next";
import Link from "next/link";
import { MetadataEditor } from "@/components/metadata-editor";
import { PageHeader } from "@/components/ui";
import { loadApp } from "@/lib/apps";
import { detectBrands } from "@/lib/brand-queries";
import { hasAnthropicKey } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { draftFromMeta } from "@/lib/metadata-check";
import { factsForPrompt, hasProductFacts } from "@/lib/product-facts";
import { getProductFacts } from "@/lib/product-queries";
import { getKeywordRows } from "@/lib/queries";
import { isRelevantKeyword } from "@/lib/relevance";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Editor de ficha" };

export default async function MetadataPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const [rows, product] = await Promise.all([getKeywordRows(app), getProductFacts(app.id)]);
  const { lang } = getCountry(app.country);
  const { brands, exceptions } = await detectBrands(app, rows, factsForPrompt(product.facts, product.features, "next"));
  // The weighted score counts only keywords worth building on, the same set the optimizer uses.
  const keywords = rows.map((r) => ({ term: r.term, opportunity: r.opportunity, relevant: isRelevantKeyword(r, lang) }));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Editor de ficha
      </nav>
      <PageHeader title="Editor de ficha">
        Prepara el texto de tu próxima versión y comprueba los límites de la tienda y qué keywords cubre. Los cambios se guardan aquí como
        borrador; para publicarlos tienes que copiarlos a {app.store === "ios" ? "App Store Connect" : "Google Play Console"}.
      </PageHeader>
      <MetadataEditor
        appId={app.id}
        store={app.store}
        initial={app.draft ?? draftFromMeta(app.meta)}
        published={draftFromMeta(app.meta)}
        hasDraft={app.draft != null}
        keywords={keywords}
        policy={{ lang, category: app.meta.category }}
        brands={brands}
        brandExceptions={exceptions}
        aiEnabled={hasAnthropicKey()}
        product={{
          empty: !hasProductFacts(product.facts, product.features),
          nextCount: product.features.filter((f) => f.status === "next_release" && f.advertise).length,
        }}
      />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CoverageMatrix } from "@/components/coverage-matrix";
import { LocalePicker } from "@/components/locale-picker";
import { MetadataEditor } from "@/components/metadata-editor";
import { ReleaseNotesCard } from "@/components/release-notes-card";
import { PublishBar } from "@/components/publish-bar";
import { PageHeader } from "@/components/ui";
import { loadApp } from "@/lib/apps";
import { detectBrands } from "@/lib/brand-queries";
import { hasAnthropicKey } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { getListingDrafts } from "@/lib/listing-draft-queries";
import {
  baseDraftFor,
  coverageMatrix,
  draftAge,
  isMainTarget,
  localeLabel,
  localeLanguage,
  localeOptions,
  mainLocale,
  type MatrixColumn,
  resolveTarget,
  sharesMainLanguage,
  targetLabel,
  targetQuery,
} from "@/lib/listing-drafts";
import { brandOf } from "@/lib/listing-optimizer";
import { draftFromMeta } from "@/lib/metadata-check";
import { hasProductFacts } from "@/lib/product-facts";
import { getProductFacts } from "@/lib/product-queries";
import { getKeywordRows } from "@/lib/queries";
import { isRelevantKeyword } from "@/lib/relevance";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = { title: "Editor de ficha" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

export default async function MetadataPage({ params, searchParams }: Props) {
  const app = await loadApp((await params).id);
  const query = await searchParams;
  // ?locale=en-US&country=mx: which listing to edit. Unknown values fall back to the main listing.
  const target = resolveTarget(app.country, app.store, { locale: one(query.locale), country: one(query.country) });
  const [rows, product, drafts] = await Promise.all([getKeywordRows(app), getProductFacts(app.id), getListingDrafts(app.id)]);
  const { lang } = getCountry(app.country);
  const { brands, exceptions } = await detectBrands(app, rows, product);
  // The weighted score counts only keywords worth building on, the same set the optimizer uses.
  const keywords = rows.map((r) => ({ term: r.term, opportunity: r.opportunity, relevant: isRelevantKeyword(r, lang) }));

  const main = mainLocale(app.country);
  const isMain = isMainTarget(app.country, target);
  const sameLanguage = sharesMainLanguage(app.country, target);
  const published = draftFromMeta(app.meta);
  const mainRow = drafts.find((d) => d.locale === main && d.country === "");
  const row = drafts.find((d) => d.locale === target.locale && d.country === target.country);
  const mainDraft = mainRow?.draft ?? published;
  const brand = brandOf(mainDraft.title || app.meta.title);
  const start = baseDraftFor(app.country, target, mainDraft, brand);
  const targetName = targetLabel(target);

  // Coverage matrix: the main listing (draft or published) and every other saved draft.
  const relevant = keywords.filter((k) => k.relevant);
  const columns: MatrixColumn[] = [
    { locale: main, country: "", label: targetLabel({ locale: main, country: "" }), draft: mainDraft, saved: mainRow != null },
    ...drafts
      .filter((d) => d !== mainRow)
      .map((d) => ({ locale: d.locale, country: d.country, label: targetLabel(d), draft: d.draft, saved: true })),
  ];
  const matrix = coverageMatrix(app.store, columns, relevant);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Editor de ficha
      </nav>
      <PageHeader title="Editor de ficha">
        Prepara el texto de tu próxima versión, en cada idioma, y comprueba los límites de la tienda y qué keywords cubre. Los cambios se guardan aquí
        como borrador; para publicarlos, cópialos a {app.store === "ios" ? "App Store Connect" : "Google Play Console"} o, si conectas la consola, envíalos
        desde aquí con una vista previa de lo que cambia.
      </PageHeader>
      <LocalePicker
        appId={app.id}
        store={app.store}
        mainLocale={main}
        options={localeOptions(app.country, app.store, drafts, target)}
        current={target}
      />
      <PublishBar
        store={app.store}
        target={target}
        hasDraft={row != null}
        href={`/apps/${app.id}/metadata/publicar${targetQuery(app.country, target)}`}
      />
      <MetadataEditor
        key={`${target.locale}|${target.country}`}
        appId={app.id}
        store={app.store}
        initial={row?.draft ?? start}
        published={isMain ? published : sameLanguage ? start : null}
        hasDraft={row != null}
        target={target}
        targetName={targetName}
        mainName={localeLabel(main)}
        isMain={isMain}
        sameLanguage={sameLanguage}
        age={draftAge(row?.updatedAt, app.meta.updatedAt, app.metaFetchedAt)}
        keywordNote={
          sameLanguage
            ? undefined
            : `Tus keywords son de ${getCountry(app.country).name} (${main}): en ${localeLabel(target.locale)} no se pueden medir. Para tener keywords de ese idioma, sigue la app en ese país desde «Otros países».`
        }
        keywords={sameLanguage ? keywords : []}
        policy={{ lang: localeLanguage(target.locale), category: app.meta.category }}
        brands={brands}
        brandExceptions={exceptions}
        aiEnabled={hasAnthropicKey()}
        product={{
          empty: !hasProductFacts(product.facts, product.features),
          nextCount: product.features.filter((f) => f.status === "next_release" && f.advertise).length,
        }}
      />
      <ReleaseNotesCard
        appId={app.id}
        store={app.store}
        target={target}
        targetName={targetName}
        aiEnabled={hasAnthropicKey()}
        nextCount={product.features.filter((f) => f.status === "next_release" && f.advertise).length}
        latestVersion={product.releases[0]?.version ?? null}
        policy={{ lang: localeLanguage(target.locale), category: app.meta.category, brands }}
      />
      {columns.length > 1 && (
        <CoverageMatrix appId={app.id} store={app.store} matrix={matrix} hrefs={columns.map((c) => targetQuery(app.country, c))} />
      )}
    </div>
  );
}

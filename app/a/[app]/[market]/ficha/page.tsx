import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { followInCountry } from "@/app/actions";
import { CoverageMatrix } from "@/components/coverage-matrix";
import { MetadataEditor } from "@/components/metadata-editor";
import { ReleaseNotesCard } from "@/components/release-notes-card";
import { PublishBar } from "@/components/publish-bar";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondary, PageHeader } from "@/components/ui";
import { AppMetadata } from "@/components/app-metadata";
import { getDb, schema } from "@/db";
import { type ScreenshotSpec, screenshotSpecSchema } from "@/lib/assets/screenshots";
import { loadMarketParams, marketPath, productPath } from "@/lib/products";
import { detectBrands } from "@/lib/brand-queries";
import { hasAnthropicKey } from "@/lib/claude";
import { getCountry } from "@/lib/countries";
import { formatDate } from "@/lib/format";
import { getListingDrafts, getProductDraftTargets } from "@/lib/listing-draft-queries";
import {
  baseDraftFor,
  coverageMatrix,
  draftAge,
  isMainTarget,
  localeLabel,
  localeLanguage,
  localeOptions,
  mainLocale,
  marketCountryFor,
  type MatrixColumn,
  missingListingNotice,
  resolveTarget,
  sharedListingNotice,
  sharesMainLanguage,
  targetLabel,
  targetQuery,
} from "@/lib/listing-drafts";
import { brandOf } from "@/lib/listing-optimizer";
import { draftFromMeta, PREVIEW_SHOTS } from "@/lib/metadata-check";
import { declaredBrand, hasProductFacts } from "@/lib/product-facts";
import { getProductFacts } from "@/lib/product-queries";
import { getKeywordRows } from "@/lib/queries";
import { isRelevantKeyword } from "@/lib/relevance";

type Props = {
  params: Promise<{ app: string; market: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = { title: "Ficha de la tienda" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

/** The Creativos screenshot design of the product, cut to the slides the preview shows; null when there is none. */
async function previewDesign(productId: number): Promise<ScreenshotSpec | null> {
  const saved = await getDb().query.assetDesigns.findFirst({
    where: and(eq(schema.assetDesigns.productId, productId), eq(schema.assetDesigns.kind, "screenshots")),
  });
  const parsed = saved ? screenshotSpecSchema.safeParse(saved.spec) : null;
  if (!parsed?.success || parsed.data.slides.length === 0) return null;
  return { ...parsed.data, slides: parsed.data.slides.slice(0, PREVIEW_SHOTS) };
}

export default async function MetadataPage({ params, searchParams }: Props) {
  const app = await loadMarketParams(params);
  const query = await searchParams;
  // ?locale=en-US&country=mx: which listing to edit. Unknown values fall back to the main listing.
  const target = resolveTarget(app.country, app.store, { locale: one(query.locale), country: one(query.country) });
  const [rows, product, drafts, productDrafts] = await Promise.all([
    getKeywordRows(app),
    getProductFacts(app.id),
    getListingDrafts(app.id),
    getProductDraftTargets(app.productId),
  ]);
  const sharedNotice = sharedListingNotice(target, app.country, productDrafts);
  const { lang } = getCountry(app.country);
  const { brands } = await detectBrands(app, rows, product);
  // The weighted score counts only keywords worth building on, the same set the optimizer uses.
  const keywords = rows.map((r) => ({ term: r.term, opportunity: r.opportunity, relevant: isRelevantKeyword(r, lang) }));

  const main = mainLocale(app.country);
  const isMain = isMainTarget(app.country, target);
  const sameLanguage = sharesMainLanguage(app.country, target);
  const published = draftFromMeta(app.meta);
  const mainRow = drafts.find((d) => d.locale === main && d.country === "");
  const row = drafts.find((d) => d.locale === target.locale && d.country === target.country);
  const mainDraft = mainRow?.draft ?? published;
  const brand = declaredBrand(product.facts);
  // No declared brand: the AI does not keep any. If the title looks like «Marca: palabras», suggest declaring it.
  const guessedBrand = brandOf(app.title);
  const brandHint = !brand && guessedBrand && guessedBrand.toLowerCase() !== app.title.trim().toLowerCase() ? guessedBrand : null;
  const start = baseDraftFor(app.country, target, mainDraft);
  const targetName = targetLabel(target);
  const aiEnabled = hasAnthropicKey();
  // Before «Adaptar» to another language: does the app have keywords in that market (followed there)?
  const marketCode = !isMain && !sameLanguage ? marketCountryFor(target) : null;
  const followedThere =
    marketCode == null
      ? false
      : marketCode === app.country ||
        (await getDb().query.apps.findFirst({
          where: and(eq(schema.apps.productId, app.productId), eq(schema.apps.country, marketCode)),
          columns: { id: true },
        })) != null;
  const marketName = marketCode ? getCountry(marketCode).name : null;

  // Coverage matrix: the main listing (draft or published) and every other saved draft.
  const relevant = keywords.filter((k) => k.relevant);
  const columns: MatrixColumn[] = [
    { locale: main, country: "", label: targetLabel({ locale: main, country: "" }), draft: mainDraft, saved: mainRow != null },
    ...drafts
      .filter((d) => d !== mainRow)
      .map((d) => ({ locale: d.locale, country: d.country, label: targetLabel(d), draft: d.draft, saved: true })),
  ];
  const matrix = coverageMatrix(app.store, columns, relevant);
  const nextCount = product.features.filter((f) => f.status === "next_release" && f.advertise).length;
  const design = await previewDesign(app.productId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ficha de la tienda">
        El texto de tu ficha en cada idioma, con la vista previa, las keywords que cubre y las normas de la tienda. Se guarda como borrador.
      </PageHeader>
      <PublishBar
        store={app.store}
        target={target}
        hasDraft={row != null}
        href={marketPath(app, `/ficha/publicar${targetQuery(app.country, target)}`)}
      />
      {sharedNotice && (
        <p role="note" className="rounded-lg bg-warn-bg px-4 py-3 text-[13px] text-warn-fg">
          {sharedNotice}
        </p>
      )}
      {aiEnabled && !isMain && !sameLanguage && !followedThere && (
        <div role="note" className="flex flex-col gap-2 rounded-lg bg-warn-bg px-4 py-3 text-[13px] text-warn-fg">
          <p>
            {marketName
              ? `No sigues esta app en ${marketName}, así que Rankeo no tiene keywords de ese mercado. «Adaptar a ${target.locale}» usará el autocompletado de la tienda si responde y, si no, solo el criterio de la IA. Tus keywords de ${getCountry(app.country).name} se le pasan como conceptos, no como keywords.`
              : `Ningún país de Rankeo habla ${localeLabel(target.locale)}: «Adaptar a ${target.locale}» no tendrá autocompletado ni keywords de ese mercado, solo el criterio de la IA.`}
          </p>
          {marketCode && (
            <form action={followInCountry}>
              <input type="hidden" name="appId" value={app.id} />
              <input type="hidden" name="country" value={marketCode} />
              <SubmitButton className={buttonSecondary} pendingLabel="Buscando la app…">
                Seguir también en {marketName}
              </SubmitButton>
            </form>
          )}
        </div>
      )}
      <MetadataEditor
        key={`${target.locale}|${target.country}`}
        appId={app.id}
        productHref={productPath(app.productSlug, "/ajustes/producto")}
        store={app.store}
        initial={row?.draft ?? start}
        base={start}
        missingNotice={missingListingNotice(app.country, target, row != null)}
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
            : `Tus keywords son de ${getCountry(app.country).name} (${main}): en ${localeLabel(target.locale)} no se pueden medir. Para tener keywords de ese idioma, añade ese país en Ajustes de la app › Mercados.`
        }
        keywords={sameLanguage ? keywords : []}
        policy={{ lang: localeLanguage(target.locale), category: app.meta.category, ownBrand: brand || undefined }}
        brands={brands}
        brandsHref={productPath(app.productSlug, `/ajustes/marcas?m=${app.country}`)}
        aiEnabled={aiEnabled}
        product={{
          empty: !hasProductFacts(product.facts, product.features),
          nextCount,
          brandHint,
        }}
        locales={{ editorHref: marketPath(app, "/ficha"), mainLocale: main, options: localeOptions(app.country, app.store, drafts, target) }}
        preview={{
          icon: app.meta.icon || app.icon,
          developer: app.meta.developer,
          rating: app.meta.rating,
          screenshots: app.meta.screenshots.slice(0, PREVIEW_SHOTS),
          design,
        }}
        publishedView={
          <div className="flex flex-col gap-3">
            <p className="text-table text-muted">Leída de la tienda el {formatDate(app.metaFetchedAt)}.</p>
            <AppMetadata meta={app.meta} />
          </div>
        }
        releaseNotes={
          <ReleaseNotesCard
            bare
            appId={app.id}
            productHref={productPath(app.productSlug, "/ajustes/producto")}
            store={app.store}
            target={target}
            targetName={targetName}
            aiEnabled={aiEnabled}
            nextCount={nextCount}
            latestVersion={product.releases[0]?.version ?? null}
            policy={{ lang: localeLanguage(target.locale), category: app.meta.category, brands }}
          />
        }
        autoAdapt={one(query.adaptar) === "1" && aiEnabled && !isMain && !sameLanguage}
      />
      {columns.length > 1 && (
        <CoverageMatrix editorHref={marketPath(app, "/ficha")} store={app.store} matrix={matrix} hrefs={columns.map((c) => targetQuery(app.country, c))} />
      )}
    </div>
  );
}

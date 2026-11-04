import type { Metadata } from "next";
import Link from "next/link";
import { ChangelogImportDialog } from "@/components/changelog-import";
import { FeatureList } from "@/components/product/feature-list";
import { ReleaseList } from "@/components/product/release-list";
import { ProductFactsForm } from "@/components/product-facts-form";
import { Card } from "@/components/ui";
import { HelpTip } from "@/components/ui/help-tip";
import { loadPrimaryParams } from "@/lib/products";
import { hasAnthropicKey } from "@/lib/claude";
import { brandOf } from "@/lib/listing-optimizer";
import { aiFeatureNotice, EMPTY_FACTS, FEATURE_STATUS_LABEL, FEATURE_STATUSES, factsForPrompt, hasProductFacts } from "@/lib/product-facts";
import { getProductFacts } from "@/lib/product-queries";

type Props = { params: Promise<{ app: string }> };

export const metadata: Metadata = { title: "Ficha de producto" };
// Reading a CHANGELOG with Claude can take a minute.
export const maxDuration = 120;

/** «La IA anuncia 25 funciones; 20 son de la 3.0.0», and what the next version adds. */
function noticeText(notice: ReturnType<typeof aiFeatureNotice>): string {
  const n = notice.announced;
  let text = n === 0 ? "La IA no anuncia ninguna función" : `La IA anuncia ${n === 1 ? "1 función" : `${n} funciones`}`;
  if (notice.latestVersion && n > 0) text += `; ${notice.fromLatest === n ? (n === 1 ? "es" : "todas son") : `${notice.fromLatest} ${notice.fromLatest === 1 ? "es" : "son"}`} de la ${notice.latestVersion}`;
  if (notice.next > 0) text += `. Con la próxima versión, ${notice.next} más`;
  return `${text}.`;
}

export default async function ProductPage({ params }: Props) {
  const app = await loadPrimaryParams(params);
  const { facts, features, releases } = await getProductFacts(app.id);
  const counts = FEATURE_STATUSES.map((s) => ({ status: s, count: features.filter((f) => f.status === s).length })).filter((c) => c.count > 0);
  const preview = factsForPrompt(facts, features, "next");
  const notice = aiFeatureNotice(features);
  const empty = !hasProductFacts(facts, features);
  const aiEnabled = hasAnthropicKey();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h2 className="text-card-title font-semibold">Ficha de producto</h2>
          <HelpTip label="Ficha de producto" side="bottom">
            Lo que hace tu app, contado por ti. La IA (ficha, ideas, creativos y reseñas) la usa como fuente de verdad: anuncia las funciones publicadas, y las
            de la próxima versión solo cuando preparas la ficha para ella. Las planeadas y las retiradas no las anuncia nunca.
          </HelpTip>
        </div>
        <p role="status" className={empty ? "rounded-control bg-warn-bg px-4 py-2.5 text-table text-warn-fg" : "rounded-control bg-surface-muted px-4 py-2.5 text-table text-ink-soft"}>
          {empty
            ? `Tu ficha de producto está vacía: la IA solo conoce la ficha publicada${app.meta.version ? ` (versión ${app.meta.version})` : ""}.`
            : noticeText(notice)}
        </p>
      </div>

      <Card aria-labelledby="product-summary" className="px-5 py-5">
        <div className="mb-4 flex items-center gap-1">
          <h2 id="product-summary" className="text-[15px] font-semibold">
            Resumen del producto
          </h2>
          <HelpTip label="Resumen del producto">Todo es opcional. Cuanto más concreto, menos tiene que suponer la IA.</HelpTip>
        </div>
        <ProductFactsForm appId={app.id} facts={facts ?? EMPTY_FACTS} brandSuggestion={brandOf(app.meta.title)} />
      </Card>

      <Card aria-labelledby="product-features" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h2 id="product-features" className="text-[15px] font-semibold">
                Funciones
              </h2>
              <HelpTip label="Funciones">Pulsa una función para editarla. Desmarca «Anunciar» en las internas que no deben salir en la ficha.</HelpTip>
            </div>
            {counts.length > 0 && <p className="mt-0.5 text-label text-muted">{counts.map((c) => `${FEATURE_STATUS_LABEL[c.status]}: ${c.count}`).join(" · ")}</p>}
          </div>
          {aiEnabled ? (
            <ChangelogImportDialog appId={app.id} publishedVersion={app.meta.version} />
          ) : (
            <span className="flex items-center gap-1 text-label text-muted">
              Importar desde CHANGELOG necesita la clave de Anthropic
              <HelpTip label="Clave de Anthropic">
                Añade ANTHROPIC_API_KEY en las variables de entorno (en Vercel: Settings → Environment Variables) y vuelve a desplegar. Mientras tanto, añade las
                funciones a mano.
              </HelpTip>
              <Link href="/integraciones" className="font-medium text-link underline">
                Integraciones
              </Link>
            </span>
          )}
        </div>
        <FeatureList appId={app.id} features={features} />
      </Card>

      <Card aria-labelledby="product-releases" className="overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-5 py-4">
          <h2 id="product-releases" className="text-[15px] font-semibold">
            Versiones
          </h2>
          <HelpTip label="Versiones">Lo que cambió en cada versión. Sirve para las notas de versión y para anotar los cambios en los gráficos.</HelpTip>
        </div>
        <ReleaseList appId={app.id} releases={releases} />
      </Card>

      {preview && (
        <Card aria-label="Lo que lee la IA" className="px-5 py-4">
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-ink-soft">Ver lo que lee la IA (ficha para la próxima versión)</summary>
            <p className="mt-2 text-[13px] text-muted">Va en cada petición, en inglés; los textos salen en el idioma de la tienda.</p>
            <pre data-content className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2.5 font-mono text-xs text-ink-soft">
              {preview}
            </pre>
          </details>
        </Card>
      )}
    </div>
  );
}

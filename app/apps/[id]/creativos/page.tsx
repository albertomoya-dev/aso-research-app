import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CreativeNav } from "@/components/creative-nav";
import { ScreenshotStudio } from "@/components/screenshot-studio";
import { PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import {
  defaultScreenshotSpec,
  proxied,
  type ScreenshotSpec,
  screenshotSpecSchema,
} from "@/lib/assets/screenshots";
import {
  IMAGE_PROVIDER_LABEL,
  imageProvider,
} from "@/lib/assets/image-provider";
import { hasAnthropicKey } from "@/lib/claude";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Screenshots" };
// Claude writes the captions and the image provider draws backdrops in this request.
export const maxDuration = 300;

/**
 * Designs saved before the "as is" flag and the crop existed: their store screenshots are finished
 * compositions, so they are shown as they are and the browser scans them once for the app screen.
 * A design saved with the flag keeps whatever the user chose.
 */
function withStoreImagesAsIs(
  spec: ScreenshotSpec,
  raw: unknown,
  storeImages: string[],
): { spec: ScreenshotSpec; detect: string[] } {
  const rawSlides =
    (raw as { slides?: { asIs?: unknown }[] } | null)?.slides ?? [];
  const detect: string[] = [];
  const slides = spec.slides.map((s, i) => {
    if (
      rawSlides[i]?.asIs === undefined &&
      s.image !== null &&
      storeImages.includes(s.image)
    ) {
      detect.push(s.id);
      return { ...s, asIs: true };
    }
    return s;
  });
  return { spec: { ...spec, slides }, detect };
}

export default async function ScreenshotsPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const saved = await getDb().query.assetDesigns.findFirst({
    where: and(
      eq(schema.assetDesigns.appId, app.id),
      eq(schema.assetDesigns.kind, "screenshots"),
    ),
  });
  const storeImages = app.meta.screenshots.slice(0, 10).map(proxied);
  const backgrounds = await getDb()
    .select({
      id: schema.generatedImages.id,
      prompt: schema.generatedImages.prompt,
    })
    .from(schema.generatedImages)
    .where(
      and(
        eq(schema.generatedImages.appId, app.id),
        eq(schema.generatedImages.kind, "background"),
      ),
    )
    .orderBy(desc(schema.generatedImages.createdAt))
    .limit(24);
  const provider = imageProvider();
  const parsed = saved ? screenshotSpecSchema.safeParse(saved.spec) : null;
  const loaded = parsed?.success
    ? withStoreImagesAsIs(parsed.data, saved?.spec, storeImages)
    : null;
  const initial: ScreenshotSpec = loaded
    ? loaded.spec
    : defaultScreenshotSpec(app.store, app.title, storeImages);
  // A fresh design scans every store screenshot for the app screen; a loaded one only those just migrated.
  const detectSlides = loaded
    ? loaded.detect
    : initial.slides.filter((s) => s.image).map((s) => s.id);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Creativos
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Screenshots para la tienda">
          Monta las capturas de{" "}
          {app.store === "ios" ? "App Store" : "Google Play"} con marco de
          dispositivo y un titular por pantalla, en los tamaños que pide la
          tienda. Todo se dibuja en tu navegador; el diseño se guarda aquí y los
          PNG se descargan listos para subir.
        </PageHeader>
        <CreativeNav appId={app.id} />
      </div>
      <ScreenshotStudio
        appId={app.id}
        appTitle={app.title}
        store={app.store}
        initial={initial}
        storeImages={storeImages}
        aiEnabled={hasAnthropicKey()}
        providerLabel={provider ? IMAGE_PROVIDER_LABEL[provider] : null}
        backgrounds={backgrounds}
        detectSlides={detectSlides}
        savedAt={saved?.updatedAt.toISOString() ?? null}
      />
    </div>
  );
}

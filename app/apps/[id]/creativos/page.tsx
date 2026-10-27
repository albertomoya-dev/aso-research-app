import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CreativeNav } from "@/components/creative-nav";
import { ScreenshotStudio } from "@/components/screenshot-studio";
import { PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { defaultScreenshotSpec, proxied, type ScreenshotSpec, screenshotSpecSchema } from "@/lib/assets/screenshots";
import { hasAnthropicKey } from "@/lib/claude";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Screenshots" };
// Claude writes the captions in this request.
export const maxDuration = 120;

export default async function ScreenshotsPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const saved = await getDb().query.assetDesigns.findFirst({
    where: and(eq(schema.assetDesigns.appId, app.id), eq(schema.assetDesigns.kind, "screenshots")),
  });
  const storeImages = app.meta.screenshots.slice(0, 10).map(proxied);
  const parsed = saved ? screenshotSpecSchema.safeParse(saved.spec) : null;
  const initial: ScreenshotSpec = parsed?.success ? parsed.data : defaultScreenshotSpec(app.store, app.title, storeImages);

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
          Monta las capturas de {app.store === "ios" ? "App Store" : "Google Play"} con marco de dispositivo y un titular por pantalla, en los tamaños que pide
          la tienda. Todo se dibuja en tu navegador; el diseño se guarda aquí y los PNG se descargan listos para subir.
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
        savedAt={saved?.updatedAt.toISOString() ?? null}
      />
    </div>
  );
}

import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { CreativeNav } from "@/components/creative-nav";
import { PageHeader } from "@/components/ui";
import { HelpTip } from "@/components/ui/help-tip";
import { VideoStudio } from "@/components/video-studio";
import { getDb, schema } from "@/db";
import { loadPrimaryParams, productPath } from "@/lib/products";
import { screenshotSpecSchema } from "@/lib/assets/screenshots";

type Props = { params: Promise<{ app: string }> };

export const metadata: Metadata = { title: "Vídeo" };

export default async function VideoPage({ params }: Props) {
  const app = await loadPrimaryParams(params);
  const saved = await getDb().query.assetDesigns.findFirst({
    where: and(eq(schema.assetDesigns.productId, app.productId), eq(schema.assetDesigns.kind, "screenshots")),
  });
  const parsed = saved ? screenshotSpecSchema.safeParse(saved.spec) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Vídeo promocional">
          Tus screenshots guardados, animados y en MP4.{" "}
          <HelpTip label="Vídeo promocional" side="bottom">
            Entrada de los textos, zoom suave del móvil y transiciones. Se exporta en el tamaño de App Store (886×1920) o vertical 1080×1920 para YouTube, que es
            lo que Google Play enlaza. Se genera en tu navegador.
          </HelpTip>
        </PageHeader>
        <CreativeNav base={productPath(app.productSlug, "/creativos")} />
      </div>
      <VideoStudio appTitle={app.title} creativesHref={productPath(app.productSlug, "/creativos")} spec={parsed?.success ? parsed.data : null} />
    </div>
  );
}

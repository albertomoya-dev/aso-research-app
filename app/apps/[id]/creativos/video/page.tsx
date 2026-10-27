import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CreativeNav } from "@/components/creative-nav";
import { PageHeader } from "@/components/ui";
import { VideoStudio } from "@/components/video-studio";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { screenshotSpecSchema } from "@/lib/assets/screenshots";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Vídeo" };

export default async function VideoPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const saved = await getDb().query.assetDesigns.findFirst({
    where: and(eq(schema.assetDesigns.appId, app.id), eq(schema.assetDesigns.kind, "screenshots")),
  });
  const parsed = saved ? screenshotSpecSchema.safeParse(saved.spec) : null;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Creativos / Vídeo
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Vídeo promocional">
          Anima tus screenshots guardados (entrada de los textos, zoom suave del móvil y transiciones) y expórtalos como MP4 en el tamaño de App Store (886×1920)
          o vertical 1080×1920 para YouTube, que es lo que Google Play enlaza. Se genera en tu navegador.
        </PageHeader>
        <CreativeNav appId={app.id} />
      </div>
      <VideoStudio appId={app.id} appTitle={app.title} spec={parsed?.success ? parsed.data : null} />
    </div>
  );
}

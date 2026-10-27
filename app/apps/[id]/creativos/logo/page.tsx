import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CreativeNav } from "@/components/creative-nav";
import { LogoStudio } from "@/components/logo-studio";
import { PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { IMAGE_PROVIDER_LABEL, imageProvider } from "@/lib/assets/image-provider";
import { hasAnthropicKey } from "@/lib/claude";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Logo con IA" };
// Image providers take up to a minute for several images.
export const maxDuration = 300;

export default async function LogoPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const rows = await getDb()
    .select({
      id: schema.generatedImages.id,
      prompt: schema.generatedImages.prompt,
      provider: schema.generatedImages.provider,
      model: schema.generatedImages.model,
      createdAt: schema.generatedImages.createdAt,
    })
    .from(schema.generatedImages)
    .where(and(eq(schema.generatedImages.appId, app.id), eq(schema.generatedImages.kind, "logo")))
    .orderBy(desc(schema.generatedImages.createdAt))
    .limit(60);
  const provider = imageProvider();

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Creativos / Logo con IA
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Logo con IA generativa">
          Un modelo de imágenes dibuja el logo a partir de un prompt; Claude puede escribir el prompt a partir de tu ficha y tus keywords. Las imágenes se guardan
          aquí y se descargan en PNG a 1024 px (App Store) y 512 px (Google Play).
        </PageHeader>
        <CreativeNav appId={app.id} />
      </div>
      <LogoStudio
        appId={app.id}
        appTitle={app.title}
        images={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        providerLabel={provider ? IMAGE_PROVIDER_LABEL[provider] : null}
        aiEnabled={hasAnthropicKey()}
      />
    </div>
  );
}

import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CreativeNav } from "@/components/creative-nav";
import { IconStudio } from "@/components/icon-studio";
import { PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { defaultIconSpec, type IconSpec, iconSpecSchema } from "@/lib/assets/icon";
import { proxied } from "@/lib/assets/screenshots";
import { hasAnthropicKey } from "@/lib/claude";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Icono" };
export const maxDuration = 120;

export default async function IconPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const saved = await getDb().query.assetDesigns.findFirst({
    where: and(eq(schema.assetDesigns.appId, app.id), eq(schema.assetDesigns.kind, "icon")),
  });
  const parsed = saved ? iconSpecSchema.safeParse(saved.spec) : null;
  const initial: IconSpec = parsed?.success ? parsed.data : defaultIconSpec(app.title);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta" className="text-sm text-muted">
        <Link href={`/apps/${app.id}`} className="text-link hover:underline">
          {app.title}
        </Link>{" "}
        / Creativos / Icono
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Icono de la app">
          Diseña un icono vectorial (fondo, símbolo o letra y placa), compáralo con el actual a tamaño real y descárgalo a 1024 px para App Store y 512 px para
          Google Play. Claude puede proponerte cuatro conceptos a partir de tu ficha y tus keywords.
        </PageHeader>
        <CreativeNav appId={app.id} />
      </div>
      {/* Without a saved design, the studio replaces the default colours with those of the current icon once it loads. */}
      <IconStudio
        appId={app.id}
        appTitle={app.title}
        initial={initial}
        currentIcon={app.icon}
        currentIconProxied={app.icon ? proxied(app.icon) : null}
        startFromIcon={!parsed?.success}
        aiEnabled={hasAnthropicKey()}
        savedAt={saved?.updatedAt.toISOString() ?? null}
      />
    </div>
  );
}

import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { MetadataEditor } from "@/components/metadata-editor";
import { PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db";
import { loadApp } from "@/lib/apps";
import { draftFromMeta } from "@/lib/metadata-check";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Editor de ficha" };

export default async function MetadataPage({ params }: Props) {
  const app = await loadApp((await params).id);
  const keywords = await getDb()
    .select({ term: schema.keywords.term })
    .from(schema.appKeywords)
    .innerJoin(schema.keywords, eq(schema.keywords.id, schema.appKeywords.keywordId))
    .where(eq(schema.appKeywords.appId, app.id))
    .orderBy(schema.keywords.term);

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
        keywords={keywords.map((k) => k.term)}
      />
    </div>
  );
}

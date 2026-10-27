import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { AppIcon } from "@/components/app-icon";
import { StoreBadge } from "@/components/store-badge";
import { buttonPrimary, Card, PageHeader } from "@/components/ui";
import { getDb, hasDatabase, schema } from "@/db";
import { getCountry } from "@/lib/countries";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasDatabase()) return <SetupNeeded />;

  const apps = await getDb()
    .select({
      id: schema.apps.id,
      title: schema.apps.title,
      developer: schema.apps.developer,
      icon: schema.apps.icon,
      store: schema.apps.store,
      country: schema.apps.country,
      keywords: count(schema.appKeywords.keywordId),
    })
    .from(schema.apps)
    .leftJoin(schema.appKeywords, eq(schema.appKeywords.appId, schema.apps.id))
    .groupBy(schema.apps.id)
    .orderBy(schema.apps.title);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Panel">Las apps que sigues y sus keywords.</PageHeader>
        <Link href="/buscar" className={buttonPrimary}>
          + Añadir app
        </Link>
      </div>

      {apps.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">Todavía no sigues ninguna app</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Busca tu app en App Store o Google Play, revisa su ficha y pulsa «Seguir esta app» para empezar a añadirle keywords.
          </p>
          <Link href="/buscar" className={`${buttonPrimary} mt-5`}>
            Buscar una app
          </Link>
        </Card>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {apps.map((app) => (
            <li key={app.id}>
              <Link href={`/apps/${app.id}`} className="block h-full rounded-xl border border-line bg-surface p-5 shadow-[inset_0_1px_0_0_var(--edge)] transition-colors hover:border-line-strong hover:bg-surface-muted">
                <div className="flex items-center gap-3.5">
                  <AppIcon src={app.icon} size={56} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{app.title}</div>
                    <div className="truncate text-[13px] text-muted">{app.developer}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <StoreBadge store={app.store} country={app.country} />
                  <span className="text-[13px] text-muted">
                    {app.keywords === 1 ? "1 keyword" : `${app.keywords} keywords`} · {getCountry(app.country).name}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetupNeeded() {
  return (
    <Card className="max-w-xl p-6">
      <h1 className="text-xl font-semibold">Falta conectar la base de datos</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Define <code className="font-mono">DATABASE_URL</code> (Neon o Supabase) y ejecuta{" "}
        <code className="font-mono">npm run db:migrate</code>. Los pasos están en el README.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Mientras tanto ya puedes <Link href="/buscar" className="text-link underline">buscar apps</Link>.
      </p>
    </Card>
  );
}

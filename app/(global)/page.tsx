import Link from "next/link";
import { Suspense } from "react";
import { HomeOverview, HomeSkeleton } from "@/components/home-overview";
import { Card } from "@/components/ui";
import { hasDatabase } from "@/db";

export const dynamic = "force-dynamic";

/** Inicio (phase 28): every market's figures, its health and «Qué hacer hoy». */
export default function Home() {
  if (!hasDatabase()) return <SetupNeeded />;
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeOverview />
    </Suspense>
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
        Mientras tanto ya puedes <Link href="/apps/nueva" className="text-link underline">buscar apps</Link>.
      </p>
    </Card>
  );
}

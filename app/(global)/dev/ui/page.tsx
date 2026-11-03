import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UiShowcase } from "@/components/dev/ui-showcase";

export const metadata: Metadata = { title: "Componentes", robots: { index: false } };

/**
 * Every base component in light and dark, side by side. Only outside production; the e2e run sets
 * ENABLE_DEV_UI=1 on its `next start` so axe can check it.
 */
export default async function DevUiPage() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_UI !== "1") notFound();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-semibold">Componentes</h1>
        <p className="mt-1 text-[13px] text-ink-soft">Sistema visual de Rankeo en los dos temas. Ver DESIGN.md.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <UiShowcase theme="light" />
        <UiShowcase theme="dark" />
      </div>
    </div>
  );
}

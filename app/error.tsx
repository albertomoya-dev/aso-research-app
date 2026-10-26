"use client";

import { buttonPrimary, Card } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="max-w-xl p-6">
      <h1 className="text-xl font-bold">Algo ha fallado</h1>
      <p className="mt-2 text-sm text-ink-soft">{error.message || "Error inesperado."}</p>
      <button type="button" onClick={reset} className={`${buttonPrimary} mt-4`}>
        Reintentar
      </button>
    </Card>
  );
}

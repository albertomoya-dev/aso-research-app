"use client";

import { HelpTip } from "./ui/help-tip";
import { useFormStatus } from "react-dom";
import { setBrandException } from "@/app/ai-actions";
import { Card } from "./ui";

type Props = { appId: number; brands: string[]; developers: string[]; exceptions: string[] };

/**
 * «Marcas detectadas»: brands from competitors' titles that the optimizer avoids, with «No es una marca» to
 * fix false positives. Developer names are avoided too, but go in their own folded group: they are noise
 * in the main list.
 */
export function BrandList({ appId, brands, developers, exceptions }: Props) {
  return (
    <Card aria-label="Marcas detectadas" className="px-5 py-4">
      <h2 className="text-[15px] font-semibold">Marcas detectadas</h2>
      <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
        La IA no las usa en la ficha ni en las ideas.
        <HelpTip label="Marcas detectadas">
          Salen de las apps que más aparecen en el TOP 5 de tus keywords. Nunca cuentan como marca las palabras de tu título, tus keywords o tu
          ficha de producto, ni las palabras corrientes («pills», «recordatorio»…).
        </HelpTip>
      </p>
      {brands.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ninguna por ahora.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {brands.map((b) => (
            <BrandRow key={b} appId={appId} word={b} exception="1" label="No es una marca" />
          ))}
        </ul>
      )}
      {developers.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted">Desarrolladores ({developers.length})</summary>
          <p className="mt-1 text-xs text-muted">Nombres de empresa de esas apps. La IA tampoco los usa.</p>
          <ul className="mt-1 flex flex-col">
            {developers.map((d) => (
              <BrandRow key={d} appId={appId} word={d} exception="1" label="No es una marca" />
            ))}
          </ul>
        </details>
      )}
      {exceptions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Marcadas como «no es una marca»</h3>
          <ul className="mt-1 flex flex-col">
            {exceptions.map((w) => (
              <BrandRow key={w} appId={appId} word={w} exception="0" label="Es una marca" muted />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function BrandRow({ appId, word, exception, label, muted }: { appId: number; word: string; exception: "1" | "0"; label: string; muted?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-1 text-sm last:border-0">
      <span className={muted ? "text-muted" : "text-ink-soft"}>{word}</span>
      <form action={setBrandException}>
        <input type="hidden" name="appId" value={appId} />
        <input type="hidden" name="word" value={word} />
        <input type="hidden" name="exception" value={exception} />
        <SubmitLink label={label} />
      </form>
    </li>
  );
}

function SubmitLink({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-11 text-[13px] text-link hover:underline disabled:opacity-60 md:min-h-8">
      {pending ? "Guardando…" : label}
    </button>
  );
}

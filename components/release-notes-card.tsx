"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { generateReleaseNotes, type ReleaseNotesState } from "@/app/ai-actions";
import type { DraftTarget } from "@/lib/listing-drafts";
import { charCount, type Issue } from "@/lib/metadata-check";
import { RELEASE_NOTES_LIMITS, releaseNotesIssues } from "@/lib/release-notes";
import type { Store } from "@/lib/stores/types";
import { buttonSecondary, Card, inputClass } from "./ui";

type Props = {
  appId: number;
  store: Store;
  target: DraftTarget;
  targetName: string;
  aiEnabled: boolean;
  /** next_release features the owner advertises, and the latest declared release. */
  nextCount: number;
  latestVersion: string | null;
  /** Language and category for the checks, and the competitor brands. */
  policy: { lang: string; category: string | null; brands: string[] };
};

const TONE: Record<Issue["level"], string> = {
  error: "bg-danger-soft text-danger",
  warn: "bg-warn-bg text-warn-fg",
  info: "bg-surface-muted text-ink-soft",
};

/** «Notas de la versión»: Claude writes the «What's new» text; the user edits and copies it. Nothing is stored. */
export function ReleaseNotesCard({ appId, store, target, targetName, aiEnabled, nextCount, latestVersion, policy }: Props) {
  const [state, action, pending] = useActionState<ReleaseNotesState, FormData>(generateReleaseNotes, null);
  // The generated text, editable. Reset when a new result arrives.
  const [edited, setEdited] = useState<{ from?: ReleaseNotesState; text: string }>({ text: "" });
  const [copied, setCopied] = useState(false);
  const result = state?.result;
  const text = edited.from === state ? edited.text : (result?.text ?? "");
  const limit = RELEASE_NOTES_LIMITS[store];
  const length = charCount(text);
  // Same checks as the server, on what the user has in the box right now.
  const issues = text ? releaseNotesIssues(store, text, policy) : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card aria-label="Notas de la versión" className="px-5 py-4">
      <h2 className="text-[15px] font-semibold">Notas de la versión</h2>
      <p className="mt-1 text-[13px] text-muted">
        El texto de «Novedades de esta versión» en {targetName}, a partir de las {nextCount} funciones «Próxima versión» de tu{" "}
        <Link href={`/apps/${appId}/producto`} className="text-link hover:underline">
          ficha de producto
        </Link>
        {latestVersion ? `, las notas de la versión ${latestVersion}` : ""} y el CHANGELOG que pegues. Límite de{" "}
        {store === "android" ? "Google Play: 500 caracteres por idioma" : "App Store: 4000 caracteres"}. No se guarda: cópialo a la consola de la tienda.
      </p>
      {aiEnabled ? (
        <form action={action} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="appId" value={appId} />
          <input type="hidden" name="locale" value={target.locale} />
          <input type="hidden" name="country" value={target.country} />
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft md:w-40">
              Versión
              <input name="version" maxLength={30} placeholder="p. ej. 2.4.0" className={inputClass} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
              CHANGELOG (opcional)
              <textarea name="changelog" rows={3} maxLength={10_000} placeholder="Pega aquí los cambios de esta versión" className={`${inputClass} py-2`} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="submit" disabled={pending} aria-busy={pending} className={buttonSecondary}>
              {pending ? "Escribiendo…" : result ? "Generar otras" : "Generar notas"}
            </button>
            <span aria-live="polite" className="text-[13px]">
              {state?.error && <span className="text-danger">{state.error}</span>}
            </span>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">Añade ANTHROPIC_API_KEY para generar las notas con IA.</p>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="release-notes" className="text-[13px] font-medium text-ink-soft">
              Propuesta
            </label>
            <span className={`font-mono text-xs ${length > limit ? "font-semibold text-danger" : "text-muted"}`}>
              {length}/{limit}
            </span>
          </div>
          <textarea
            id="release-notes"
            rows={store === "android" ? 6 : 10}
            value={text}
            onChange={(e) => setEdited({ from: state, text: e.target.value })}
            className={`${inputClass} w-full py-2.5`}
          />
          {result.trimmed && <p className="text-xs text-muted">La IA se pasó del límite y el texto se cortó en la última línea completa. Revísalo.</p>}
          {issues.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {issues.map((i) => (
                <li key={`${i.ruleId ?? ""}${i.text}`} className={`rounded-lg px-3 py-2 ${TONE[i.level]}`}>
                  {i.text}
                  {i.link && (
                    <>
                      {" "}
                      <a href={i.link} target="_blank" rel="noreferrer" className="whitespace-nowrap font-medium underline">
                        Ver norma
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {result.notes.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-soft">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} disabled={!text} className={buttonSecondary}>
              {copied ? "Copiado" : "Copiar"}
            </button>
            <span className="text-xs text-muted">
              Generado por IA{state?.model ? ` (${state.model})` : ""}
              {result.keywordsUsed.length > 0 ? ` · usa: ${result.keywordsUsed.join(", ")}` : ""}.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

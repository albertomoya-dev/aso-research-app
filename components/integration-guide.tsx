"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

function CopyName({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="font-mono"
      aria-label={copied ? `${name} copiado` : `Copiar ${name}`}
      onClick={() => {
        navigator.clipboard?.writeText(name).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {name}
    </Button>
  );
}

/** «Cómo conectar»: a side panel with the numbered steps and the variable names to copy into Vercel. */
export function IntegrationGuide({ name, steps, vars, readmeHref }: { name: string; steps: string[]; vars: string[]; readmeHref: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Cómo conectar</Button>
      </SheetTrigger>
      <SheetContent closeLabel="Cerrar">
        <SheetHeader>
          <SheetTitle>Conectar {name}</SheetTitle>
          <SheetDescription>Las claves se guardan en las variables de entorno del servidor, nunca en Rankeo.</SheetDescription>
        </SheetHeader>
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-body text-ink">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div>
          <h3 className="mb-1 text-label font-medium text-muted">Variables para Vercel</h3>
          <ul className="flex flex-wrap gap-1">
            {vars.map((v) => (
              <li key={v}>
                <CopyName name={v} />
              </li>
            ))}
          </ul>
        </div>
        <a href={readmeHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-table text-link hover:underline md:min-h-8">
          Más detalles en el README
        </a>
      </SheetContent>
    </Sheet>
  );
}

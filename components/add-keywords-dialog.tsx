"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { addKeywords, type AddKeywordsState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseKeywordCsv } from "@/lib/keyword-table";
import { parseKeywords } from "@/lib/keywords";
import { relevanceNote } from "./relevance-note";

const textareaClass =
  "min-h-32 w-full resize-y rounded-control border border-line-strong bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-muted focus:border-brand focus:outline-2 focus:outline-brand/40";

/**
 * «+ Añadir keywords»: the primary action of Seguimiento. «Escribir» takes one per line or comma
 * separated; «Pegar CSV» reads the keyword column of a CSV from another tool (or a spreadsheet). Both send
 * the terms to `addKeywords`, which follows them, checks today's position and rates their relevance.
 */
export function AddKeywordsDialog({ appId }: { appId: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AddKeywordsState, FormData>(addKeywords, null);
  const [mode, setMode] = useState<"write" | "csv">("write");
  const [text, setText] = useState("");
  const [csv, setCsv] = useState("");
  const parsedCsv = parseKeywordCsv(csv);
  const terms = mode === "write" ? parseKeywords(text) : parsedCsv.terms;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setText("");
          setCsv("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus size={16} aria-hidden="true" />
          Añadir keywords
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Añadir keywords</DialogTitle>
          <DialogDescription>Se consulta su posición de hoy y la IA estima su relevancia.</DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            for (const t of terms) fd.append("keywords", t);
            action(fd);
            setText("");
            setCsv("");
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="appId" value={appId} />
          <input type="hidden" name="source" value="manual" />
          <Tabs value={mode} onValueChange={(v) => setMode(v as "write" | "csv")}>
            <TabsList aria-label="Cómo añadir">
              <TabsTrigger value="write">Escribir</TabsTrigger>
              <TabsTrigger value="csv">Pegar CSV</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <label className="flex flex-col gap-1.5 text-label font-medium text-ink-soft">
                Una por línea o separadas por comas
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="app para correr, rutas para correr" className={textareaClass} />
              </label>
            </TabsContent>
            <TabsContent value="csv">
              <label className="flex flex-col gap-1.5 text-label font-medium text-ink-soft">
                CSV o columnas copiadas de una hoja de cálculo
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={6}
                  placeholder={"keyword,volumen\napp para correr,40\nrutas para correr,25"}
                  className={`${textareaClass} font-mono`}
                />
              </label>
              {csv.trim() !== "" && (
                <p className="mt-1.5 text-label text-muted">
                  {parsedCsv.column ? `Columna «${parsedCsv.column}»` : "Primera columna"} · {parsedCsv.terms.length}{" "}
                  {parsedCsv.terms.length === 1 ? "keyword" : "keywords"}
                  {parsedCsv.skipped > 0 && ` · ${parsedCsv.skipped} filas ignoradas`}
                </p>
              )}
            </TabsContent>
          </Tabs>
          <p aria-live="polite" className="text-[13px]">
            {state?.error && <span className="text-danger">{state.error}</span>}
            {state && !state.error && (
              <span className="text-ink-soft">
                {state.added === 1 ? "1 añadida" : `${state.added} añadidas`}
                {state.skipped > 0 && ` · ${state.skipped} ya estaban`}
                {state.trackingFailed && " · su posición se consultará en la próxima actualización"}
                {relevanceNote(state.relevance)}
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="primary" type="submit" disabled={pending || terms.length === 0} aria-busy={pending}>
              {pending ? "Añadiendo…" : terms.length === 1 ? "Añadir 1 keyword" : `Añadir ${terms.length} keywords`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

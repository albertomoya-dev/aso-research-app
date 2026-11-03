"use client";

import { useState } from "react";
import { ListingProposalPanel } from "@/components/listing-proposal";
import type { ListingProposal } from "@/lib/listing-optimizer";
import type { FieldKey, MetadataDraft } from "@/lib/metadata-check";

// Fixture for /dev/ui and the e2e check of «Aceptar campo»: the e2e run has no ANTHROPIC_API_KEY, so the
// real proposal never shows up on /ficha.
const DRAFT: MetadataDraft = {
  title: "Pastillero fácil",
  subtitle: "",
  keywordField: "",
  shortDescription: "Avisos para tus medicinas, gratis y sin registro.",
  description: "Pastillero con avisos.\n\nAñade tus medicinas y recibe un aviso a la hora de cada toma.",
};

const PROPOSAL: ListingProposal = {
  fields: {
    title: "Recordatorio de pastillas",
    shortDescription: "Recordatorio de pastillas y alarma de medicamentos, sin registro.",
    description: "Recordatorio de pastillas con avisos.\n\nAñade tus medicamentos y recibe una alarma a la hora de cada toma.",
  },
  targetKeywords: ["recordatorio de pastillas", "alarma de medicamentos"],
  changes: [{ field: "title", why: "La keyword con más oportunidad, entera en el título." }],
  notes: [],
  over: [],
};

const KEYWORDS = [
  { term: "recordatorio de pastillas", opportunity: 60 },
  { term: "alarma de medicamentos", opportunity: 35 },
  { term: "pastillero", opportunity: 20 },
];
const TERMS = KEYWORDS.map((k) => k.term);
const POLICY = { lang: "es" };

/** The proposal diff on a fixed listing: accept or discard field by field and see the text change below. */
export function ProposalDemo() {
  const [draft, setDraft] = useState(DRAFT);
  const [done, setDone] = useState<FieldKey[]>([]);
  return (
    <div className="flex flex-col gap-3">
      <ListingProposalPanel
        store="android"
        draft={draft}
        proposal={PROPOSAL}
        model="demo"
        terms={TERMS}
        scoring={KEYWORDS}
        policy={POLICY}
        done={done}
        onAccept={(keys) => {
          setDraft((d) => ({ ...d, ...Object.fromEntries(keys.map((k) => [k, PROPOSAL.fields[k] ?? d[k]])) }));
          setDone((d) => [...d, ...keys]);
        }}
        onDiscard={(keys) => setDone((d) => [...d, ...keys])}
      />
      <dl data-testid="proposal-demo-draft" className="grid gap-1 text-table">
        <dt className="text-label text-muted">Título en el editor</dt>
        <dd data-field="title">{draft.title}</dd>
        <dt className="text-label text-muted">Descripción corta en el editor</dt>
        <dd data-field="shortDescription">{draft.shortDescription}</dd>
      </dl>
      <button type="button" onClick={() => {
          setDraft(DRAFT);
          setDone([]);
        }} className="self-start text-table text-link underline">
        Reiniciar la demo
      </button>
    </div>
  );
}

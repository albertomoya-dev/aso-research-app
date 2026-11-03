"use client";

import { useState } from "react";
import type { DiffItem, FieldKey, Issue, KeywordDiff } from "@/lib/metadata-check";

const ISSUE_STYLE: Record<Issue["level"], string> = {
  error: "bg-danger-soft text-danger",
  warn: "bg-warn-bg text-warn-fg",
  info: "bg-surface-muted text-ink-soft",
};
const ISSUE_LABEL: Record<Issue["level"], string> = { error: "Error", warn: "Aviso", info: "Info" };

/** Store limits and policy warnings, each with its level for screen readers and the link to the official rule. */
export function IssueList({ issues, compact = false }: { issues: Issue[]; compact?: boolean }) {
  return (
    <ul className={compact ? "flex flex-col gap-1 text-table" : "mt-2 flex flex-col gap-2 text-sm"}>
      {issues.map((issue) => (
        <li key={`${issue.ruleId ?? ""}${issue.field ?? ""}${issue.text}`} className={`rounded-control ${compact ? "px-2.5 py-1.5" : "px-3 py-2"} ${ISSUE_STYLE[issue.level]}`}>
          <span className="sr-only">{ISSUE_LABEL[issue.level]}: </span>
          {issue.text}
          {issue.link && (
            <>
              {" "}
              <a href={issue.link} target="_blank" rel="noreferrer" className="font-medium whitespace-nowrap underline">
                Ver norma
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

const DIFF_PREVIEW = 5;

/** «Gana», «Pierde» and «Cambia de campo» of a proposal against the text in the editor. */
export function KeywordDiffView({ diff, labels }: { diff: KeywordDiff; labels: Record<FieldKey, string> }) {
  const field = (k: FieldKey | null) => (k ? labels[k]?.toLowerCase() : "palabras sueltas");
  const groups: { key: keyof KeywordDiff; title: string; tone: string; detail: (d: DiffItem) => string }[] = [
    { key: "gained", title: "Gana", tone: "text-up", detail: (d) => `en ${field(d.to)}` },
    { key: "lost", title: "Pierde", tone: "text-down", detail: (d) => `estaba en ${field(d.from)}` },
    { key: "moved", title: "Cambia de campo", tone: "text-ink-soft", detail: (d) => `${field(d.from)} → ${field(d.to)}` },
  ];
  if (groups.every((g) => diff[g.key].length === 0)) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((g) =>
        diff[g.key].length > 0 ? <DiffGroup key={g.key} title={g.title} tone={g.tone} detail={g.detail} items={diff[g.key]} /> : null,
      )}
    </div>
  );
}

function DiffGroup({ title, tone, items, detail }: { title: string; tone: string; items: DiffItem[]; detail: (d: DiffItem) => string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, DIFF_PREVIEW);
  return (
    <div className="min-w-0">
      <h4 className="text-label font-medium tracking-wide text-muted uppercase">
        {title} ({items.length})
      </h4>
      <ul className="mt-1 flex flex-col text-table">
        {shown.map((d) => (
          <li key={d.term} className="flex flex-wrap items-baseline justify-between gap-x-3 py-0.5">
            <span className={tone}>{d.term}</span>
            <span className="text-label text-muted">
              {detail(d)} · <span className="font-mono">{Math.round(d.value)}</span>
            </span>
          </li>
        ))}
      </ul>
      {items.length > DIFF_PREVIEW && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-h-11 text-table text-link underline md:min-h-8">
          {open ? "Ver menos" : `Ver ${items.length - DIFF_PREVIEW} más`}
        </button>
      )}
    </div>
  );
}

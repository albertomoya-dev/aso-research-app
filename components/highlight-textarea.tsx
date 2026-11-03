"use client";

import { Fragment } from "react";
import { cn } from "@/lib/cn";
import type { Range } from "@/lib/text";

/** What a stretch of text is marked as: a covered keyword, a policy issue, or the keyword picked in «Cobertura». */
export type MarkKind = "keyword" | "issue" | "focus";
export type TextMark = { range: Range; kind: MarkKind };

type Segment = { text: string; kinds: Set<MarkKind> };

/** The text cut at every mark boundary, each piece with the kinds that cover it. */
export function segments(text: string, marks: TextMark[]): Segment[] {
  const cuts = new Set([0, text.length]);
  for (const { range } of marks) {
    cuts.add(Math.max(0, Math.min(text.length, range[0])));
    cuts.add(Math.max(0, Math.min(text.length, range[1])));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (b <= a) continue;
    const kinds = new Set(marks.filter((m) => m.range[0] <= a && m.range[1] >= b).map((m) => m.kind));
    out.push({ text: text.slice(a, b), kinds });
  }
  return out;
}

const MARK_CLASS: Record<MarkKind, string> = {
  keyword: "underline decoration-brand/45 decoration-2 underline-offset-[5px]",
  issue: "underline decoration-danger decoration-wavy decoration-from-font underline-offset-[5px] [text-decoration-skip-ink:none]",
  focus: "rounded-[3px] bg-brand/25",
};

type Props = Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  marks: TextMark[];
  /** One line: Enter does nothing and pasted line breaks become spaces (titles, short descriptions). */
  singleLine?: boolean;
  /** Classes for the text box and its mirror: font size, padding and minimum height must match. */
  textClassName?: string;
};

/**
 * A textarea with marks drawn behind its text, like a spell checker: a mirror with the same text, font
 * and wrapping sits underneath, its text transparent and only the underlines and highlights visible.
 * The mirror also sets the height, so the box grows with the text (no inner scroll to keep in sync).
 * The marks are decoration only (aria-hidden): the issues are also listed in words next to the field.
 */
export function HighlightTextarea({ value, onChange, marks, singleLine, textClassName, className, ...props }: Props) {
  const box = "col-start-1 row-start-1 w-full rounded-control border px-3 py-2 whitespace-pre-wrap break-words";
  return (
    <div className={cn("grid rounded-control bg-surface", className)}>
      <div aria-hidden="true" className={cn(box, "pointer-events-none border-transparent text-transparent select-none", textClassName)}>
        {segments(value, marks).map((s, i) =>
          s.kinds.size === 0 ? (
            <Fragment key={i}>{s.text}</Fragment>
          ) : (
            <span key={i} data-mark={[...s.kinds].join(" ")} className={cn([...s.kinds].map((k) => MARK_CLASS[k]))}>
              {s.text}
            </span>
          ),
        )}
        {/* A trailing line break needs something after it to take up its line. */}
        {"​"}
      </div>
      <textarea
        {...props}
        value={value}
        rows={1}
        spellCheck={props.spellCheck ?? true}
        onChange={(e) => onChange(singleLine ? e.target.value.replace(/\s*[\r\n]+\s*/g, " ") : e.target.value)}
        onKeyDown={(e) => {
          if (singleLine && e.key === "Enter") e.preventDefault();
          props.onKeyDown?.(e);
        }}
        className={cn(
          box,
          "h-full min-h-0 resize-none overflow-hidden border-line-strong bg-transparent text-ink placeholder:text-muted focus:border-brand focus:outline-2 focus:outline-brand/40 aria-[invalid=true]:border-danger",
          textClassName,
        )}
      />
    </div>
  );
}

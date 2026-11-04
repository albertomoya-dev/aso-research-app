import type { ListingChange as Change } from "@/lib/listing-diff";
import { AppIcon } from "./app-icon";

// One field that changed in a watched listing (Competidores: its timeline and the competitor's panel).

const MAX_WORDS = 12;

function WordList({ words, sign }: { words: string[]; sign: "+" | "−" }) {
  if (words.length === 0) return null;
  const shown = words.slice(0, MAX_WORDS);
  return (
    <span className={sign === "+" ? "text-up" : "text-down"}>
      {sign} {shown.join(", ")}
      {words.length > shown.length && ` y ${words.length - shown.length} más`}
    </span>
  );
}

export function ListingChange({ change }: { change: Change }) {
  switch (change.kind) {
    case "text":
      return (
        <>
          <span className="font-medium">{change.label}</span>
          {change.field === "title" || change.field === "shortDescription" ? (
            <span className="block break-words text-ink-soft">
              «{change.before || "–"}» → «{change.after || "–"}»
            </span>
          ) : (
            <span className="block text-ink-soft">
              {change.after.length - change.before.length >= 0 ? "+" : ""}
              {change.after.length - change.before.length} caracteres
            </span>
          )}
          <span className="flex flex-col break-words text-[13px]">
            <WordList words={change.added} sign="+" />
            <WordList words={change.removed} sign="−" />
          </span>
        </>
      );
    case "value":
      return (
        <>
          <span className="font-medium">{change.label}</span>{" "}
          <span className="text-ink-soft">
            {change.before || "–"} → {change.after || "–"}
          </span>
        </>
      );
    case "image":
      return (
        <span className="flex items-center gap-2">
          <span className="font-medium">Icono nuevo</span>
          <AppIcon src={change.before} size={28} />→<AppIcon src={change.after} size={28} />
        </span>
      );
    case "count":
      return (
        <>
          <span className="font-medium">Capturas cambiadas</span>{" "}
          <span className="text-ink-soft">
            ({change.before} → {change.after})
          </span>
        </>
      );
  }
}

import type { RelevanceStatus } from "@/lib/relevance-jobs";

/** Tail of the «N añadidas» message: what happened with the AI relevance of the new keywords. */
export function relevanceNote(status: RelevanceStatus | undefined): string {
  switch (status) {
    case "rated":
      return " · relevancia estimada con IA";
    case "pending":
      return " · la IA sigue estimando su relevancia; aparecerá al recargar";
    case "failed":
      return " · no se pudo estimar su relevancia; prueba con «Recalcular relevancia con IA»";
    default:
      return "";
  }
}

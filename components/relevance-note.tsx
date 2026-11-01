import type { RelevanceStatus } from "@/lib/relevance-jobs";

/** Tail of the «N añadidas» message: what happened with the AI relevance of the new keywords. */
export function relevanceNote(status: RelevanceStatus | undefined): string {
  switch (status) {
    case "rated":
      return " · relevancia estimada con IA";
    case "pending":
      return " · la IA sigue estimando su relevancia; aparecerá en la tabla de keywords en unos minutos";
    case "failed":
      return " · no se pudo estimar la relevancia de alguna; se reintentará en la consulta diaria o prueba con «Recalcular relevancia con IA»";
    case "off":
      return " · sin relevancia: falta ANTHROPIC_API_KEY; puedes valorarlas a mano en la tabla";
    default:
      return "";
  }
}

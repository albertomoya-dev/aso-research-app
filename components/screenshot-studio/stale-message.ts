/** «Las capturas de las pantallas 2, 3 son anteriores a la ficha publicada (versión 3.0, actualizada el 12/10/2026)…», the whole notice. */
export function staleMessage(stale: number[], version: string | null, updatedAt: string | null): string {
  const which =
    stale.length === 1
      ? `La captura de la pantalla ${stale[0] + 1} es anterior`
      : `Las capturas de las pantallas ${stale.map((i) => i + 1).join(", ")} son anteriores`;
  const ref = [version ? `versión ${version}` : "", updatedAt ? `actualizada el ${updatedAt}` : ""].filter(Boolean).join(", ");
  return `${which} a la ficha publicada${ref ? ` (${ref})` : ""}. Si la interfaz ha cambiado, sube capturas nuevas; si no, puedes ignorar este aviso.`;
}

/** The one-line notice: «Capturas antiguas en las pantallas 2, 3»; staleMessage goes in its HelpTip. */
export function staleTitle(stale: number[]): string {
  return stale.length === 1 ? `Captura antigua en la pantalla ${stale[0] + 1}` : `Capturas antiguas en las pantallas ${stale.map((i) => i + 1).join(", ")}`;
}

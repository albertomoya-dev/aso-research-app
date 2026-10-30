import Link from "next/link";
import type { DraftTarget } from "@/lib/listing-drafts";
import { playConfig } from "@/lib/play-console/auth";
import { toPlayLanguage } from "@/lib/play-console/locales";
import type { Store } from "@/lib/stores/types";
import { buttonSecondary, Card } from "./ui";

/**
 * Editor row that leads to the publish page (secondary: the editor's primary action is saving). When the
 * console is not connected it says how to connect it; nothing here talks to the store.
 */
export function PublishBar({ store, target, hasDraft, href }: { store: Store; target: DraftTarget; hasDraft: boolean; href: string }) {
  if (store !== "android") return null;
  const config = playConfig();
  let text: string;
  let link = false;
  if (!config.configured) {
    text = config.error
      ? `La conexión con Google Play Console está mal configurada: ${config.error}`
      : "Para publicar desde Rankeo, conecta Google Play Console con una cuenta de servicio (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON). Los pasos están en el README, sección «Google Play Console».";
  } else if (target.country) {
    text = "La API de Google Play no permite publicar fichas personalizadas por país: copia este borrador en Play Console.";
  } else if (!toPlayLanguage(target.locale)) {
    text = "Google Play no tiene una ficha para este idioma exacto: elige una variante que admita (por ejemplo, en-GB o en-AU).";
  } else {
    link = hasDraft;
    text = hasDraft
      ? `Se publica el borrador guardado, no lo que estés escribiendo sin guardar.${config.writeEnabled ? "" : " Conexión en modo solo lectura: verás la vista previa, pero no podrás publicar."}`
      : "Guarda el borrador para poder publicarlo en Google Play.";
  }
  return (
    <Card aria-label="Publicar en Google Play" className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <p className="text-[13px] text-muted">{text}</p>
      {link && (
        <Link href={href} className={`${buttonSecondary} shrink-0`}>
          Publicar en Google Play
        </Link>
      )}
    </Card>
  );
}

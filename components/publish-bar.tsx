import Link from "next/link";
import type { DraftTarget } from "@/lib/listing-drafts";
import { ascConfig } from "@/lib/app-store-connect/auth";
import { toAscLocale } from "@/lib/app-store-connect/locales";
import { playConfig } from "@/lib/play-console/auth";
import { toPlayLanguage } from "@/lib/play-console/locales";
import type { Store } from "@/lib/stores/types";
import { buttonSecondary, Card } from "./ui";

/**
 * Editor row that leads to the publish page (secondary: the editor's primary action is saving). When the
 * console is not connected it says how to connect it; nothing here talks to the store.
 */
export function PublishBar({ store, target, hasDraft, href }: { store: Store; target: DraftTarget; hasDraft: boolean; href: string }) {
  const { text, link, label } = store === "android" ? playBar(target, hasDraft) : ascBar(target, hasDraft);
  return (
    <Card aria-label={label} className="flex flex-col gap-3 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
      <p className="text-[13px] text-muted">{text}</p>
      {link && (
        <Link href={href} className={`${buttonSecondary} shrink-0`}>
          {label}
        </Link>
      )}
    </Card>
  );
}

const savedNote = "Se envía el borrador guardado, no lo que estés escribiendo sin guardar.";

function playBar(target: DraftTarget, hasDraft: boolean) {
  const label = "Publicar en Google Play";
  const config = playConfig();
  if (!config.configured) {
    return {
      label,
      link: false,
      text: config.error
        ? `La conexión con Google Play Console está mal configurada: ${config.error}`
        : "Para publicar desde Rankeo, conecta Google Play Console con una cuenta de servicio (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON). Los pasos están en el README, sección «Google Play Console», y el estado en Ajustes.",
    };
  }
  if (target.country) return { label, link: false, text: "La API de Google Play no permite publicar fichas personalizadas por país: copia este borrador en Play Console." };
  if (!toPlayLanguage(target.locale)) {
    return { label, link: false, text: "Google Play no tiene una ficha para este idioma exacto: elige una variante que admita (por ejemplo, en-GB o en-AU)." };
  }
  if (!hasDraft) return { label, link: false, text: "Guarda el borrador para poder publicarlo en Google Play." };
  return { label, link: true, text: `${savedNote}${config.writeEnabled ? "" : " Conexión en modo solo lectura: verás la vista previa, pero no podrás publicar."}` };
}

function ascBar(target: DraftTarget, hasDraft: boolean) {
  const label = "Enviar a App Store Connect";
  const config = ascConfig();
  if (!config.configured) {
    return {
      label,
      link: false,
      text: config.error
        ? `La conexión con App Store Connect está mal configurada: ${config.error}`
        : "Para enviar la ficha desde Rankeo, conecta App Store Connect con una clave de API (ASC_ISSUER_ID, ASC_KEY_ID y ASC_PRIVATE_KEY). Los pasos están en el README, sección «App Store Connect», y el estado en Ajustes.",
    };
  }
  if (!toAscLocale(target.locale)) {
    return { label, link: false, text: "App Store Connect no tiene una localización para este idioma exacto: elige una que admita (por ejemplo, es-MX o en-GB)." };
  }
  if (!hasDraft) return { label, link: false, text: "Guarda el borrador para poder enviarlo a App Store Connect." };
  return {
    label,
    link: true,
    text: `${savedNote} Se guarda en la versión en preparación; la envías a revisión desde App Store Connect.${config.writeEnabled ? "" : " Conexión en modo solo lectura: verás la vista previa, pero no podrás enviar."}`,
  };
}

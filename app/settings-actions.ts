"use server";

import { ascErrorMessage, getAscClient } from "@/lib/app-store-connect/client";
import { AiError, checkAnthropicKey } from "@/lib/claude";
import { appUrl, emailConfigured, sendEmail } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { getPlayClient, playErrorMessage } from "@/lib/play-console/client";
import { playConfig } from "@/lib/play-console/auth";

// «Probar conexión» and «Enviar email de prueba» in Ajustes. Every check is read only and returns a
// Spanish message; no secret value is ever sent back to the browser.

export type TestState = { ok: boolean; message: string } | null;

const TESTS = ["anthropic", "play", "asc", "email"] as const;
type TestId = (typeof TESTS)[number];

export async function testIntegration(_prev: TestState, formData: FormData): Promise<TestState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !TESTS.includes(id as TestId)) return { ok: false, message: "Integración desconocida." };
  switch (id as TestId) {
    case "anthropic":
      try {
        const model = await checkAnthropicKey();
        return { ok: true, message: `La clave funciona${model ? ` (ve modelos como ${model})` : ""}. No se ha generado nada ni se ha cobrado.` };
      } catch (err) {
        return { ok: false, message: err instanceof AiError ? err.message : "Error inesperado al hablar con Anthropic." };
      }
    case "play": {
      const config = playConfig();
      const client = getPlayClient();
      if (!client) return { ok: false, message: config.error ?? "Falta GOOGLE_PLAY_SERVICE_ACCOUNT_JSON." };
      try {
        await client.checkToken();
        return {
          ok: true,
          message:
            "Google acepta la cuenta de servicio (token obtenido). Que vea tus apps depende de los permisos que le diste en Play Console › Usuarios y permisos.",
        };
      } catch (err) {
        return { ok: false, message: playErrorMessage(err) };
      }
    }
    case "asc": {
      const client = getAscClient();
      if (!client) return { ok: false, message: "Faltan ASC_ISSUER_ID, ASC_KEY_ID o ASC_PRIVATE_KEY, o la clave no es válida." };
      try {
        const apps = await client.ping();
        return {
          ok: true,
          message: apps > 0 ? "App Store Connect acepta la clave y ve las apps de tu cuenta." : "App Store Connect acepta la clave, pero no ve ninguna app en la cuenta.",
        };
      } catch (err) {
        return { ok: false, message: ascErrorMessage(err) };
      }
    }
    case "email": {
      if (!emailConfigured()) return { ok: false, message: "Faltan RESEND_API_KEY y ALERT_EMAIL." };
      const link = appUrl();
      try {
        await sendEmail(
          "Rankeo: email de prueba",
          `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111">
            <p>Si lees esto, Rankeo puede enviarte el resumen semanal.</p>
            <p style="color:#555">Enviado desde Ajustes el ${formatDate(new Date())}.${link ? ` <a href="${link}/ajustes" style="color:#3046c5">Abrir Rankeo</a>` : ""}</p>
          </body></html>`,
        );
        return { ok: true, message: "Email enviado a ALERT_EMAIL. Si no llega en unos minutos, mira la carpeta de spam y el panel de Resend." };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  }
}

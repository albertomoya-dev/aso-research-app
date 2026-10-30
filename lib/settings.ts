import { ascConfig } from "./app-store-connect/auth";
import { IMAGE_PROVIDER_LABEL, imageProvider } from "./assets/image-provider";
import { playConfig } from "./play-console/auth";

// Status of every integration for the settings page. Pure and env-injected: it only says whether each
// variable is present, never its value, so nothing secret can reach the browser from here.

type Env = Record<string, string | undefined>;

export const README_URL = "https://github.com/albertomoya-dev/aso-research-app#";

export type IntegrationId = "database" | "password" | "cron" | "anthropic" | "images" | "email" | "play" | "asc";

/** on: ready to use · off: not set up (optional) · invalid: set but wrong or incomplete. */
export type IntegrationState = "on" | "off" | "invalid";

export type EnvVar = { name: string; set: boolean; required: boolean };

export type Integration = {
  id: IntegrationId;
  name: string;
  state: IntegrationState;
  /** null when the integration never writes; otherwise whether writing is enabled. */
  write: boolean | null;
  /** One line about the current state, in Spanish (never a secret). */
  detail: string;
  /** What it enables in Rankeo. */
  enables: string;
  vars: EnvVar[];
  readme: { section: string; anchor: string };
  /** Integrations with a «Probar conexión» button. */
  testable: boolean;
};

const has = (env: Env, name: string) => Boolean(env[name]?.trim());
const vars = (env: Env, required: string[], optional: string[] = []): EnvVar[] => [
  ...required.map((name) => ({ name, set: has(env, name), required: true })),
  ...optional.map((name) => ({ name, set: has(env, name), required: false })),
];

/** «Faltan A y B» for the required variables that are not set. */
function missing(list: EnvVar[]): string {
  const names = list.filter((v) => v.required && !v.set).map((v) => v.name);
  return names.length <= 1 ? `Falta ${names[0] ?? ""}.` : `Faltan ${names.slice(0, -1).join(", ")} y ${names.at(-1)}.`;
}

/** Every integration, in the order the settings page shows them. */
export function integrationStatuses(env: Env = process.env): Integration[] {
  const db = vars(env, ["DATABASE_URL"]);
  const pass = vars(env, ["APP_PASSWORD"]);
  const cron = vars(env, ["CRON_SECRET"]);
  const ai = vars(env, ["ANTHROPIC_API_KEY"]);
  const img = vars(env, [], ["IMAGE_PROVIDER", "OPENAI_API_KEY", "GEMINI_API_KEY"]);
  const mail = vars(env, ["RESEND_API_KEY", "ALERT_EMAIL"], ["EMAIL_FROM", "APP_URL"]);
  const play = vars(env, ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"], ["GOOGLE_PLAY_ALLOW_WRITE"]);
  const asc = vars(env, ["ASC_ISSUER_ID", "ASC_KEY_ID", "ASC_PRIVATE_KEY"], ["ASC_ALLOW_WRITE"]);

  const provider = imageProvider(env);
  const providerKey = provider === "openai" ? "OPENAI_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : null;
  const imageState: IntegrationState = !provider ? "off" : providerKey && has(env, providerKey) ? "on" : "invalid";
  const mailSet = mail.filter((v) => v.required && v.set).length;
  const playCfg = playConfig(env);
  const ascCfg = ascConfig(env);

  return [
    {
      id: "database",
      name: "Base de datos (Postgres)",
      state: db[0].set ? "on" : "invalid",
      write: null,
      detail: db[0].set ? "Conectada con DATABASE_URL." : "Falta DATABASE_URL: sin ella no se guarda nada.",
      enables: "Guardar apps, keywords, posiciones e historial. Es obligatoria.",
      vars: db,
      readme: { section: "Puesta en marcha", anchor: "puesta-en-marcha" },
      testable: false,
    },
    {
      id: "password",
      name: "Contraseña de la app",
      state: pass[0].set ? "on" : "off",
      write: null,
      detail: pass[0].set
        ? "La app pide usuario y contraseña en el navegador."
        : "Sin APP_PASSWORD la app queda abierta a cualquiera con la dirección. Solo para desarrollo local.",
      enables: "Proteger toda la app con la contraseña del navegador.",
      vars: pass,
      readme: { section: "Puesta en marcha", anchor: "puesta-en-marcha" },
      testable: false,
    },
    {
      id: "cron",
      name: "Consulta diaria (cron)",
      state: cron[0].set ? "on" : "off",
      write: null,
      detail: cron[0].set ? "La consulta diaria está protegida con CRON_SECRET." : "Sin CRON_SECRET la ruta de la consulta diaria no se puede llamar.",
      enables: "Consultar cada día posiciones, popularidad, tendencias, fichas vigiladas y avisos.",
      vars: cron,
      readme: { section: "Despliegue en Vercel", anchor: "despliegue-en-vercel" },
      testable: false,
    },
    {
      id: "anthropic",
      name: "Claude (Anthropic)",
      state: ai[0].set ? "on" : "off",
      write: null,
      detail: ai[0].set ? "Clave presente. «Probar conexión» comprueba que es válida sin generar nada." : "Sin clave, las funciones de IA se ocultan.",
      enables: "Ideas de keywords, relevancia, optimizar y traducir la ficha, notas de la versión, reseñas, textos de creativos y borradores de respuesta.",
      vars: ai,
      readme: { section: "Ideas con IA", anchor: "ideas-con-ia" },
      testable: ai[0].set,
    },
    {
      id: "images",
      name: "Imágenes generativas",
      state: imageState,
      write: null,
      detail:
        imageState === "on"
          ? `Proveedor: ${IMAGE_PROVIDER_LABEL[provider!]}. Cada imagen cuesta dinero en su cuenta, así que no hay prueba gratuita.`
          : imageState === "invalid"
            ? `IMAGE_PROVIDER pide ${IMAGE_PROVIDER_LABEL[provider!]}, pero falta ${providerKey}.`
            : "Sin OPENAI_API_KEY ni GEMINI_API_KEY no se generan logos ni fondos.",
      enables: "Logos con IA y fondos con IA para los screenshots.",
      vars: img,
      readme: { section: "Creativos: screenshots e icono", anchor: "creativos-screenshots-e-icono" },
      testable: false,
    },
    {
      id: "email",
      name: "Email (Resend)",
      state: mailSet === 2 ? "on" : mailSet === 0 ? "off" : "invalid",
      write: null,
      detail: mailSet === 2 ? "Listo para enviar. «Enviar email de prueba» manda uno a ALERT_EMAIL." : mailSet === 0 ? "Sin configurar." : missing(mail),
      enables: "Recibir el resumen semanal por email cada lunes.",
      vars: mail,
      readme: { section: "Novedades y resumen semanal", anchor: "novedades-y-resumen-semanal" },
      testable: mailSet === 2,
    },
    {
      id: "play",
      name: "Google Play Console",
      state: playCfg.configured ? "on" : playCfg.error ? "invalid" : "off",
      write: playCfg.configured ? playCfg.writeEnabled : null,
      detail: playCfg.error ?? (playCfg.configured ? "Cuenta de servicio presente." : "Sin configurar."),
      enables: "Publicar el borrador de la ficha, responder reseñas de tu app e importar los términos de búsqueda reales.",
      vars: play,
      readme: { section: "Google Play Console", anchor: "google-play-console" },
      testable: playCfg.configured,
    },
    {
      id: "asc",
      name: "App Store Connect",
      state: ascCfg.configured ? "on" : ascCfg.error ? "invalid" : "off",
      write: ascCfg.configured ? ascCfg.writeEnabled : null,
      detail: ascCfg.error ?? (ascCfg.configured ? "Clave de API presente." : "Sin configurar."),
      enables: "Enviar el borrador a la versión en preparación y ver los informes de analítica.",
      vars: asc,
      readme: { section: "App Store Connect", anchor: "app-store-connect" },
      testable: ascCfg.configured,
    },
  ];
}

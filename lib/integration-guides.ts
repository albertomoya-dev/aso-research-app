import type { IntegrationId } from "./settings";

// «Cómo conectar» of each integration on /integraciones: numbered steps, in Spanish, short. The
// variable names go in `vars` so the panel can offer to copy them. Kept in step with the README.

export type IntegrationGuide = { steps: string[]; vars: string[] };

export const INTEGRATION_GUIDES: Record<IntegrationId, IntegrationGuide> = {
  database: {
    steps: [
      "Crea una base de datos Postgres gratuita en Neon (neon.tech) o desde Vercel › Storage.",
      "Copia su cadena de conexión.",
      "En Vercel › Settings › Environment Variables, añádela como DATABASE_URL.",
      "Ejecuta npm run db:migrate contra esa base de datos y vuelve a desplegar.",
    ],
    vars: ["DATABASE_URL"],
  },
  password: {
    steps: [
      "Elige una contraseña larga.",
      "Añádela en Vercel como APP_PASSWORD.",
      "Vuelve a desplegar: el navegador pedirá usuario (cualquiera) y contraseña.",
    ],
    vars: ["APP_PASSWORD"],
  },
  cron: {
    steps: [
      "Genera un secreto largo, por ejemplo con openssl rand -hex 32.",
      "Añádelo en Vercel como CRON_SECRET.",
      "Vuelve a desplegar: Vercel Cron llama cada día a /api/cron/rankings con ese secreto.",
    ],
    vars: ["CRON_SECRET"],
  },
  anthropic: {
    steps: [
      "Crea una clave en console.anthropic.com › API Keys.",
      "Añádela en Vercel como ANTHROPIC_API_KEY.",
      "Vuelve a desplegar y pulsa «Probar».",
    ],
    vars: ["ANTHROPIC_API_KEY"],
  },
  images: {
    steps: [
      "Crea una clave de OpenAI (platform.openai.com) o de Gemini (Google AI Studio).",
      "Añádela en Vercel como OPENAI_API_KEY o GEMINI_API_KEY.",
      "Si tienes las dos, elige con IMAGE_PROVIDER (openai o gemini).",
      "Vuelve a desplegar. Cada imagen se cobra en tu cuenta del proveedor.",
    ],
    vars: ["OPENAI_API_KEY", "GEMINI_API_KEY", "IMAGE_PROVIDER"],
  },
  email: {
    steps: [
      "Crea una cuenta gratuita en Resend (resend.com) y una API key.",
      "Añade en Vercel RESEND_API_KEY y ALERT_EMAIL (el correo donde quieres el resumen).",
      "Con dominio propio verificado en Resend, añade también EMAIL_FROM.",
      "Opcional: APP_URL con la dirección pública de Rankeo, para los enlaces del email.",
      "Vuelve a desplegar y pulsa «Probar».",
    ],
    vars: ["RESEND_API_KEY", "ALERT_EMAIL", "EMAIL_FROM", "APP_URL"],
  },
  play: {
    steps: [
      "En Google Cloud Console, activa la Google Play Android Developer API en un proyecto tuyo.",
      "Crea una cuenta de servicio y descarga su clave JSON.",
      "En Play Console › Usuarios y permisos, invita el correo de la cuenta de servicio con acceso a tu app.",
      "Pega el JSON en Vercel como GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.",
      "Es de solo lectura. Para publicar y responder reseñas, añade GOOGLE_PLAY_ALLOW_WRITE=1.",
      "Vuelve a desplegar y pulsa «Probar».",
    ],
    vars: ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "GOOGLE_PLAY_ALLOW_WRITE"],
  },
  asc: {
    steps: [
      "En App Store Connect › Usuarios y acceso › Integraciones, crea una clave de API de equipo (rol App Manager).",
      "Descarga el archivo .p8: solo se puede descargar una vez.",
      "Añade en Vercel ASC_ISSUER_ID, ASC_KEY_ID y ASC_PRIVATE_KEY (el contenido del .p8).",
      "Es de solo lectura. Para enviar textos y pedir informes, añade ASC_ALLOW_WRITE=1.",
      "Vuelve a desplegar y pulsa «Probar».",
    ],
    vars: ["ASC_ISSUER_ID", "ASC_KEY_ID", "ASC_PRIVATE_KEY", "ASC_ALLOW_WRITE"],
  },
};

# Rankeo: seguimiento de ASO

Aplicación web para seguir en qué posición aparece una app en App Store y Google Play para una lista de keywords, quién ocupa el TOP 5 y cómo evoluciona cada posición.

## Estado

| Paso | Contenido | Estado |
| --- | --- | --- |
| 1 | Buscar apps, ver su ficha (metadata) y cargar keywords a mano | Hecho |
| 2 | Posición diaria y TOP 5 por keyword, gráfico de evolución | Pendiente |
| 3 | Popularidad (Google Trends y autocompletado) | Pendiente |
| 4 | Sugerencias de keywords con IA | Pendiente |

## Stack

Next.js (App Router) y TypeScript, Postgres con Drizzle ORM, Tailwind, Vitest. Pensado para desplegarse en Vercel con el plan gratuito.

Datos de las tiendas (`lib/stores/`):

- **App Store**: API pública de iTunes Search/Lookup. No necesita clave, pero no devuelve el subtítulo de la ficha.
- **Google Play**: [`google-play-scraper`](https://github.com/facundoolano/google-play-scraper), que lee el HTML de la tienda y puede romperse si Google lo cambia.

Las peticiones se hacen siempre desde el servidor, con caché de 6 horas, un máximo de 3 a la vez por tienda y reintentos ante errores 429 y 5xx.

## Puesta en marcha

1. Crea una base de datos Postgres gratuita en [Neon](https://neon.tech) (o desde Vercel › Storage).
2. Copia `.env.example` a `.env.local` y rellena `DATABASE_URL`. `APP_PASSWORD` protege toda la app con usuario y contraseña del navegador (el usuario puede ser cualquiera).
3. Instala y crea las tablas:

   ```bash
   npm install
   npm run db:migrate
   npm run dev
   ```

4. Abre http://localhost:3000.

### Despliegue en Vercel

Importa el repositorio en Vercel, añade `DATABASE_URL` y `APP_PASSWORD` en Settings › Environment Variables y ejecuta `npm run db:migrate` una vez contra esa base de datos.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint |
| `npm run db:generate` | Genera una migración tras cambiar `db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones |

## Estructura

```
app/            páginas y server actions
components/     UI
db/             esquema Drizzle y migraciones
lib/stores/     adaptadores de App Store y Google Play
lib/            utilidades (países, keywords, formato)
tests/          tests de Vitest
```

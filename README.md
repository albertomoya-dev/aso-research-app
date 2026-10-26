# Rankeo: seguimiento de ASO

Aplicación web para seguir en qué posición aparece una app en App Store y Google Play para una lista de keywords, quién ocupa el TOP 5 y cómo evoluciona cada posición.

## Estado

| Paso | Contenido | Estado |
| --- | --- | --- |
| 1 | Buscar apps, ver su ficha (metadata) y cargar keywords a mano | Hecho |
| 2 | Posición diaria y TOP 5 por keyword, gráfico de evolución con anotaciones | Hecho |
| 3 | Popularidad, dificultad y oportunidad; Google Trends; descubrir keywords con el autocompletado | Hecho |
| 4 | Sugerencias de keywords con IA | Pendiente |

## Stack

Next.js (App Router) y TypeScript, Postgres con Drizzle ORM, Tailwind, Vitest. Pensado para desplegarse en Vercel con el plan gratuito.

Datos de las tiendas (`lib/stores/`):

- **App Store**: API pública de iTunes Search/Lookup. No necesita clave, pero no devuelve el subtítulo de la ficha.
- **Google Play**: [`google-play-scraper`](https://github.com/facundoolano/google-play-scraper), que lee el HTML de la tienda y puede romperse si Google lo cambia.

Las peticiones se hacen siempre desde el servidor, con caché de 6 horas, un máximo de 3 a la vez por tienda y reintentos ante errores 429 y 5xx.

## Puesta en marcha

1. Crea una base de datos Postgres gratuita en [Neon](https://neon.tech) (o desde Vercel › Storage).
2. Copia `.env.example` a `.env.local` y rellena `DATABASE_URL`. `APP_PASSWORD` protege toda la app con usuario y contraseña del navegador (el usuario puede ser cualquiera). `CRON_SECRET` protege la consulta diaria.
3. Instala y crea las tablas:

   ```bash
   npm install
   npm run db:migrate
   npm run dev
   ```

4. Abre http://localhost:3000.

### Despliegue en Vercel

Importa el repositorio en Vercel, añade `DATABASE_URL`, `APP_PASSWORD` y `CRON_SECRET` en Settings › Environment Variables y ejecuta `npm run db:migrate` contra esa base de datos (también tras cada actualización que traiga migraciones nuevas).

## Posiciones

Cada día a las 05:00 UTC, Vercel Cron llama a `/api/cron/rankings` (configurado en `vercel.json`). Para cada keyword, tienda y país se hace una sola búsqueda de 200 resultados y se guarda la posición de cada app que la sigue y el TOP 5. Si la app no aparece, se guarda «fuera de los 200 primeros», nunca 0. También puedes lanzarla a mano con «Actualizar posiciones», y las keywords nuevas se consultan nada más añadirlas.

En App Store la posición es aproximada: la API pública no siempre ordena igual que la app de la tienda.

## Popularidad, dificultad y oportunidad

Las tiendas no publican cuántas veces se busca una palabra, así que son estimaciones de 0 a 100:

- **Popularidad**: se escribe la keyword letra a letra en el buscador de la tienda (autocompletado) hasta que la tienda la sugiere. Cuantas menos letras hagan falta, y cuanto más arriba salga, más se busca. Se recalcula cada semana.
- **Dificultad**: fuerza del TOP 10 de la búsqueda: cuántas apps llevan la keyword en el título, su valoración y, en App Store, su número de valoraciones. Se recalcula cada día.
- **Oportunidad**: `popularidad × (1 − 0,7 × dificultad / 100)`.
- **Google Trends**: interés semanal en Google de los últimos 12 meses en el país, relativo al pico de la propia keyword. Sirve para ver la estacionalidad, no para comparar keywords. Google Trends no tiene API pública y limita mucho las peticiones: se descargan como máximo 20 keywords por día y se refrescan cada semana.

La pantalla **Descubrir keywords** consulta el autocompletado con una palabra semilla, sola y seguida de cada letra de la «a» a la «z», para encontrar frases long tail.

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

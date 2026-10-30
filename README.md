# Rankeo: seguimiento de ASO

Aplicación web para seguir en qué posición aparece una app en App Store y Google Play para una lista de keywords, quién ocupa el TOP 5 y cómo evoluciona cada posición.

## Estado

| Paso | Contenido | Estado |
| --- | --- | --- |
| 1 | Buscar apps, ver su ficha (metadata) y cargar keywords a mano | Hecho |
| 2 | Posición diaria y TOP 5 por keyword, gráfico de evolución con anotaciones | Hecho |
| 3 | Popularidad, dificultad y oportunidad; Google Trends; descubrir keywords con el autocompletado | Hecho |
| 4 | Ideas de keywords con IA (Claude) y editor de ficha con validación | Hecho |
| 5 | Competidores: cuota de visibilidad en el TOP 5 y cambios en sus fichas | Hecho |
| 6 | Novedades (alertas) y resumen semanal, también por email | Hecho |
| 7 | Análisis de reseñas con IA (tu app y competidores) | Hecho |
| 8 | Estacionalidad de keywords y la misma app en varios países | Hecho |
| 9 | Keywords del TOP 10: extraer las palabras clave de las fichas de las 10 primeras apps | Hecho |
| 10 | Creativos: screenshots con marco de dispositivo e icono vectorial, con textos y conceptos de Claude | Hecho |
| 11 | Logos con un proveedor de imágenes generativas (OpenAI o Gemini) | Hecho |
| 12 | Vídeo promocional a partir de las pantallas | Hecho |
| – | Optimizar la ficha con IA alrededor de las keywords seguidas (PR #14) | Hecho |
| – | Estilo inspirado en Linear, oscuro por defecto (PR #13 y #15) | Hecho |
| 13 | Ficha de producto: lo que hace la app, fuente de verdad para toda la IA | Hecho |
| 14 | Higiene de keywords: relevancia para todas, filtro de irrelevantes y limpieza por lotes | Hecho |

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

Importa el repositorio en Vercel, añade `DATABASE_URL`, `APP_PASSWORD`, `CRON_SECRET`, si quieres ideas con IA, `ANTHROPIC_API_KEY`, y si quieres logos con IA, `OPENAI_API_KEY` o `GEMINI_API_KEY`, en Settings › Environment Variables y ejecuta `npm run db:migrate` contra esa base de datos (también tras cada actualización que traiga migraciones nuevas).

## Posiciones

Cada día a las 05:00 UTC, Vercel Cron llama a `/api/cron/rankings` (configurado en `vercel.json`). Para cada keyword, tienda y país se hace una sola búsqueda de 200 resultados y se guarda la posición de cada app que la sigue y el TOP 5. Si la app no aparece, se guarda «fuera de los 200 primeros», nunca 0. También puedes lanzarla a mano con «Actualizar posiciones», y las keywords nuevas se consultan nada más añadirlas.

En App Store la posición es aproximada: la API pública no siempre ordena igual que la app de la tienda.

## Popularidad, dificultad y oportunidad

Las tiendas no publican cuántas veces se busca una palabra, así que son estimaciones de 0 a 100:

- **Popularidad**: se escribe la keyword letra a letra en el buscador de la tienda (autocompletado) hasta que la tienda la sugiere. Cuantas menos letras hagan falta, y cuanto más arriba salga, más se busca. Se recalcula cada semana.
- **Dificultad**: fuerza del TOP 10 de la búsqueda: cuántas apps llevan la keyword en el título, su valoración y, en App Store, su número de valoraciones. Se recalcula cada día.
- **Oportunidad**: `popularidad × (1 − 0,7 × dificultad / 100) × factor de relevancia`. La relevancia de 1 a 5 da un factor de 0,6 a 1; una keyword **sin valorar cuenta como 0,7**, así una palabra genérica muy buscada ya no gana a una frase central valorada con un 5 (ver *Relevancia e higiene de keywords*).
- **Google Trends**: interés semanal en Google de los últimos 12 meses en el país, relativo al pico de la propia keyword. Sirve para ver la estacionalidad, no para comparar keywords. Google Trends no tiene API pública y limita mucho las peticiones: se descargan como máximo 20 keywords por día y se refrescan cada semana.

La pantalla **Descubrir keywords** consulta el autocompletado con una palabra semilla, sola y seguida de cada letra de la «a» a la «z», para encontrar frases long tail.

## Relevancia e higiene de keywords

Una lista con cientos de keywords mezcla frases que de verdad traen usuarios con ruido: palabras vacías de las descripciones («además», «puedes», «etc», «com»), búsquedas donde la gente quiere otra cosa («tomas omitidas» da *Thomas y sus amigos*) y palabras sueltas demasiado amplias («móvil», «alarma»). Ese ruido infla la oportunidad, llena Novedades de avisos y mete apps como «Reloj» entre tus competidores.

- **Palabras vacías** (`lib/stopwords.ts`): listas por idioma (es, en, pt, fr, de, it) de artículos, preposiciones, conectores, adverbios, verbos auxiliares y modales con sus formas habituales y restos web (com, www, etc). Además, palabras genéricas de cualquier descripción («datos», «configurar», «experiencia»): nunca son keyword solas, pero sí dentro de una frase («copia de datos»). *Keywords del TOP 10* ya no las propone.
- **Relevancia para todas**: al añadir keywords, Claude valora de 1 a 5 cuánto encaja cada una con tu app, usando la ficha de producto (o la ficha publicada si no la hay), en lotes de 100 por petición. Si tarda más de 20 segundos, sigue en segundo plano y aparece al recargar; si falla, las keywords se añaden igual. **Recalcular relevancia con IA** vuelve a valorar todas menos las que has valorado tú.
- **Tu relevancia manda**: en la tabla de keywords cada fila tiene un selector de 1 a 5 que indica si la puso la IA o tú. La que pones tú no la cambia nunca la IA (columna `relevance_source`).
- **Intención ajena**: las tiendas no dan la categoría de las apps en los resultados de búsqueda, así que no se puede comparar categorías. Con cada keyword se le pasan a Claude los títulos de las 5 primeras apps de hoy y se le pide marcar `foreign` cuando al menos 4 son otro tipo de app (juegos, dibujos, mensajería, relojes). Es una estimación del modelo, no un dato de la tienda; si no estás de acuerdo, súbele la relevancia a 3 o más y deja de contar como ajena.
- **Filtro «Probablemente irrelevantes»** (`?f=noise`): relevancia 2 o menos, intención ajena o palabra vacía. Puedes marcar varias y **Quitar seleccionadas**: pide confirmación y deja **Deshacer** durante 15 segundos, que recupera las keywords con su origen y su relevancia. El histórico de posiciones no se borra al quitar una keyword.
- **Presupuesto**: por encima de 150 keywords seguidas la tabla avisa de que alertas y cuota pierden precisión.
- En **Keywords del TOP 10** y **Descubrir**, «Seleccionar todas» deja fuera las palabras vacías y las de relevancia 2 o menos. **Estimar relevancia con IA** valora las candidatas sin guardar nada (una petición por cada 100, hasta 200 por clic).
- El origen de cada keyword distingue **TOP 10 de la competencia** y **Descubrir** de las añadidas a mano.
- Para filtrar keywords «relevantes» en otras partes: `isRelevantKeyword` y `isLikelyIrrelevant` de `lib/relevance.ts`. Prompt versión `rel-1`.

## Keywords del TOP 10

La pestaña **Keywords del TOP 10** busca una keyword que sigues (o todas, hasta 8), o cualquier otra búsqueda, y lee la ficha completa de las 10 primeras apps, sin contar la tuya. De su título, descripción corta (Google Play) y descripción saca palabras y frases de 1 a 3 palabras, sin artículos ni preposiciones, y muestra en cuántas apps aparece cada una, en cuántos títulos y cuántas veces en total. Las que solo usa una app se descartan porque suelen ser nombres de marca.

La puntuación suma, por cada app que la usa, 3 si está en el título, 2 en la descripción corta y 1 en la descripción, con un extra para las frases. Puedes seguir las que elijas (se consulta su posición en el momento) o exportarlas a CSV. En App Store no se lee el subtítulo porque la API pública no lo devuelve.

## Ideas con IA

La pantalla **Ideas con IA** pide a Claude (`claude-opus-5-5`, con la API de Anthropic) keywords nuevas para la app. Antes de llamar al modelo se reúnen señales reales: la ficha, las keywords que ya sigues y las que descartaste, el autocompletado de la tienda para las palabras del título y la categoría, y las apps que salen en el TOP 5 de tus keywords.

- La respuesta llega como JSON estructurado y se valida con Zod. Se quitan repetidas (también plurales y acentos), las que ya sigues o descartaste y las que contienen marcas de otras apps.
- Las ideas quedan pendientes hasta que eliges cuáles seguir. Nada se añade solo.
- La relevancia y la competencia son estimaciones de la IA, no datos de la tienda. La popularidad y la dificultad reales se miden al seguir la keyword.
- Cada idea guarda el modelo que respondió y la versión del prompt (`PROMPT_VERSION` en `lib/suggestions.ts`).
- Si el modelo rechaza una petición, la API la reintenta con el modelo alternativo que recomienda Anthropic (fallback del lado del servidor).
- Sin `ANTHROPIC_API_KEY` la pantalla lo indica y el resto de la app funciona igual.

## Editor de ficha

La pantalla **Editor de ficha** sirve para preparar la próxima versión del texto: cuenta caracteres con los límites de cada tienda (App Store: nombre 30, subtítulo 30, campo de keywords 100; Google Play: título 30, descripción corta 80, descripción 4000), avisa de espacios y palabras repetidas en el campo de keywords y muestra qué keywords seguidas quedan cubiertas. El borrador se guarda en la base de datos; para publicarlo hay que copiarlo a App Store Connect o Google Play Console.

## Ficha de producto

La ficha publicada en la tienda siempre va por detrás del producto: si la IA solo la lee, describe funciones viejas y se olvida de las nuevas. La pestaña **Producto** guarda lo que hace la app contado por su dueño, y el optimizador de ficha, las ideas de keywords, los textos e iconos de Creativos y el análisis de reseñas la usan como **fuente de verdad** (bloque `PRODUCT FACTS` en el prompt).

- Resumen: qué es, para quién, diferenciales, lo que la ficha nunca debe decir (por ejemplo, «no hacer afirmaciones médicas»), tono e idiomas.
- Funciones con estado: **publicada**, **próxima versión**, **planeada** o **retirada**, la versión en que llegó y si se puede anunciar. Las planeadas y las retiradas nunca se describen como disponibles: llegan a la IA solo en una línea «no las menciones», para que las quite si la ficha actual aún las nombra. Las que no se anuncian no llegan nunca.
- En el editor de ficha eliges «Ficha para la versión publicada» (solo funciones publicadas) o «Ficha para la próxima versión» (también las de la próxima). Ideas y Creativos usan la próxima versión; las reseñas, la publicada.
- **Importar desde CHANGELOG**: pegas el texto, Claude propone las funciones con su estado y las versiones, y tú marcas qué se guarda. Nada se guarda sin tu confirmación.
- Sin ficha de producto todo funciona como antes (la IA solo usa la ficha publicada) y el editor lo avisa.
- La lógica está en `lib/product-facts.ts` (`factsForPrompt`); al cambiar los prompts se subieron sus versiones (`lst-2`, `kw-2`, `crt-2`, `rv-2`).

## Competidores

La pantalla **Competidores** usa el TOP 5 guardado de cada keyword:

- **Cuota de visibilidad**: cada keyword vale su popularidad (1 si aún no se ha medido) y se reparte entre las cinco primeras posiciones con pesos 40, 22, 15, 12 y 11 %, parecidos a la proporción de clics de las tiendas. Se muestra la cuota actual (última posición de cada keyword) y su evolución en 30 días para tu app y las cuatro apps más visibles.
- **Fichas vigiladas**: al pulsar «Vigilar ficha» en una app, la consulta diaria lee su ficha y guarda una copia cuando cambia el título, la descripción corta, la descripción, la versión, el precio, la categoría, el icono o las capturas. La lista de cambios muestra qué palabras añadió o quitó.

## Reseñas

La pestaña **Reseñas** lee hasta 300 reseñas recientes del país (App Store: feed RSS de Apple; Google Play: `google-play-scraper`) de tu app o de un competidor que vigiles, y Claude resume:

- los temas más mencionados, con su tono, cuántas reseñas los mencionan y una cita;
- las quejas y las peticiones más repetidas;
- ideas concretas para la ficha;
- las frases con las que los usuarios describen la app, que puedes seguir como keywords.

La distribución de estrellas y la media se calculan con las reseñas leídas, no con IA. Cada análisis se guarda, así que puedes comparar la media entre análisis.

## Estacionalidad y otros países

La pestaña **Estacionalidad** convierte los datos de Google Trends de cada keyword en un mapa de calor por meses (0–100 respecto a su mejor mes) y avisa de las keywords cuyo pico empieza en los próximos dos meses, para cambiar la ficha con margen.

En la página de keywords, **Otros países** sigue la misma app en otra tienda nacional (mismo id) y, si quieres, copia sus keywords. Cada país se sigue por separado, con sus posiciones y su histórico.

## Creativos: screenshots e icono

La pestaña **Creativos** monta los recursos gráficos de la ficha en el navegador (canvas), sin servicios externos:

- **Screenshots**: una pantalla por captura con marco de iPhone, iPad o Android (o sin marco), fondo liso o degradado, titular y subtítulo. Puedes subir tus capturas (se reducen a 1800 px de alto para que el conjunto quepa en un guardado) o usar las que ya tienes publicadas en la tienda, que pasan por `/api/assets/image` para que el canvas pueda exportarlas. Los tamaños son los que aceptan las tiendas: iPhone 6,9" (1320×2868), 6,7" (1290×2796), 6,5" (1284×2778), iPad 13" (2064×2752) y Android 1080×1920, 1440×2560 y tablet 1440×2560. En el titular, las palabras entre `*asteriscos*` se pintan con el color de acento. Se descargan como PNG o todas en un ZIP. Hay una galería de 12 **plantillas** (Clásico, Inclinado, Dúo, Panorámica, Tarjeta, Resplandor, Minimal, Ola, Rayas, Puntos, Gran titular y Flotante) que aplican de golpe fondo, adorno, pose del móvil y texto al conjunto; cada una se puede afinar después con la inclinación y el desplazamiento del móvil, la alternancia de lado por pantalla, el segundo móvil con la siguiente pantalla detrás, el adorno de fondo y el tamaño del texto. Los adornos panorámicos (círculos) continúan de una pantalla a la siguiente en la galería de la tienda. Los diseños guardados antes de las plantillas siguen cargando con los valores por defecto. Con un proveedor de imágenes configurado, **Fondo con IA** genera un fondo vertical (9:16) según la temática de la app (Claude propone tres prompts a partir de la ficha, las keywords y el tema actual) que se dibuja debajo del adorno y del móvil en todas las pantallas, con un velo regulable del color de fondo para que el texto siga legible; los fondos se guardan en `generated_images` con `kind = 'background'`. Las capturas publicadas en la tienda suelen ser montajes ya terminados (con su texto y su móvil), así que cada pantalla tiene la casilla «usarla tal cual», que la dibuja a sangre sin marco ni texto.
- **Textos con IA**: Claude escribe un titular (2–5 palabras) y un subtítulo por pantalla a partir de la ficha y de las keywords seguidas, ordenadas por oportunidad, y anota a qué keyword apunta cada pantalla.
- **Icono**: un diseño vectorial (fondo liso o degradado, letra o símbolo, placa opcional, brillo y sombra) que se previsualiza con la máscara de App Store y la circular de Google Play y a 64, 40 y 29 px, junto al icono actual. Avisa si el símbolo contrasta poco o casi toca el borde. Se exporta a 1024×1024 (App Store) y 512×512 (Google Play). Claude propone cuatro conceptos en ese mismo sistema.

- **Logo con IA**: Claude no dibuja, así que esta pantalla llama a un proveedor de imágenes con un prompt (que Claude puede escribir a partir de la ficha y las keywords, en tres direcciones visuales). Las imágenes se guardan en la tabla `generated_images` en base64 y se sirven por `/api/assets/generated/[id]`; se descargan reencodadas a PNG de 1024 (App Store) y 512 (Google Play). Proveedores: OpenAI (`OPENAI_API_KEY`, modelo `gpt-image-2.5-flare` por defecto, o `gpt-image-2.5-sunburst` para más calidad; `gpt-image-1` se retiró el 23 de octubre de 2026, calidad `OPENAI_IMAGE_QUALITY`) o Google (`GEMINI_API_KEY`, `gemini-2.5-flash-image` por defecto, o un modelo `imagen-*`). Con una clave basta; `IMAGE_PROVIDER` elige cuando hay las dos. Cada imagen cuesta dinero en la cuenta del proveedor.

- **Vídeo**: anima el conjunto de screenshots guardado (los textos entran con un fundido, el móvil hace un zoom lento, transiciones de fundido o deslizamiento) y lo codifica en el navegador con WebCodecs (H.264 High 4.0, 10 Mb/s) y [`mp4-muxer`](https://github.com/Vanilagy/mp4-muxer) en 886×1920 (app preview de App Store, que exige entre 15 y 30 s y avisa si no se cumple), 1080×1920 (YouTube/Shorts, que es lo que Google Play enlaza) o 1080×1080. Sin sonido. Si el navegador no tiene WebCodecs con H.264 (Firefox, Safari antiguo), graba un WebM a tiempo real con `MediaRecorder`. Los ajustes del vídeo no se guardan.

El diseño de cada tipo se guarda en la tabla `asset_designs` (uno por app y tipo); las capturas subidas viajan en base64, por lo que el límite del cuerpo de las server actions está en 4 MB (`next.config.ts`).

## Novedades y resumen semanal

Cada consulta de posiciones (la diaria y el botón «Actualizar posiciones») compara cada keyword con su consulta anterior y crea avisos en **Novedades**:

- entra o sale del TOP 10;
- sube o baja 5 posiciones o más dentro de las 50 primeras;
- deja de aparecer en los resultados;
- cambia el nº 1 (o pasas a serlo);
- una ficha vigilada cambia.

El menú lateral muestra cuántos avisos quedan sin leer.

**Resumen semanal** compara la última posición de cada keyword con la de hace una semana: cuántas suben y bajan, cuántas están en el TOP 10, la cuota de visibilidad y las que más se mueven. Para recibirlo por email cada lunes:

1. Crea una cuenta gratuita en [Resend](https://resend.com) y una API key.
2. Añade `RESEND_API_KEY` y `ALERT_EMAIL` (tu correo) en Vercel. Sin dominio propio, Resend solo deja enviar al correo de tu cuenta desde `onboarding@resend.dev`; con dominio verificado, define también `EMAIL_FROM`.
3. Opcional: `APP_URL` con la dirección pública de la app para los enlaces del email (en Vercel se detecta sola).

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

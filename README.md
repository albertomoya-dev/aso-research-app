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
| 15 | Candado de calidad, comprobador de normas de las tiendas y detector de marcas | Hecho |
| 16 | Alertas útiles (sin ruido, agrupadas y con preferencias), profundidad real del ranking y resumen sin movimientos falsos | Hecho |
| 17 | Estacionalidad fiable: señal mínima, picos sostenidos, popularidad mínima, calendario y aviso 3 semanas antes | Hecho |
| 18 | Reseñas de la competencia: cualquier app del TOP 5, selector de país, oportunidades para la ficha y lo que pide la categoría | Hecho |
| 19 | Fichas por idioma y país (borradores por locale, fichas personalizadas de Play, adaptación con IA, matriz de cobertura) y notas de la versión | Hecho |
| 20 | Google Play Console: publicar el borrador con vista previa y confirmación, responder reseñas con borradores de IA e importar los términos de búsqueda reales | Hecho (sin probar contra una cuenta real) |
| 21 | App Store Connect: enviar el borrador a la versión en preparación con vista previa y confirmación, y ver los informes de analítica disponibles | Hecho (sin probar contra una cuenta real) |
| 22 | Anotaciones automáticas (la consulta diaria guarda la ficha propia y anota cada cambio; también cada publicación desde Rankeo), impacto por keyword ±14 días y registro de experimentos de ficha | Hecho |
| 23 | Creativos con capturas actuales (subida múltiple y de carpetas, fecha y versión de cada captura con aviso de capturas antiguas, script `adb` opcional), keyword por pantalla entre las relevantes y con visión, colores del icono actual y pista de audio en el vídeo | Hecho (la parte de navegador sin probar a mano) |
| 24 | Interfaz: tabla de keywords con columna fija y scroll dentro de su tarjeta, competidores vigilados resaltados en el TOP 5, pantalla de Ajustes con el estado y la prueba de cada integración, y panel de salud ASO en la portada de cada app | Hecho (sin medir en un móvil real) |
| 25 | Sistema visual: claro por defecto con oscuro opcional, tokens nuevos, componentes base en `components/ui/` (Radix, cmdk, sonner, lucide), escaparate `/dev/ui` y pruebas e2e con Playwright y axe | Hecho |
| 26 | Productos y mercados: la tabla `products` y una app con varios países (`apps` = mercado), URLs `/a/[app]/[país]/…`, redirecciones 308 desde `/apps/[id]/…` y portada y barra lateral agrupadas por app | Hecho |
| 26b | Datos de la app en el producto: ficha de producto, marcas excluidas y creativos por `product_id` (migración 0020, que fusiona los países). Se conservan al dejar de seguir un país. Los borradores siguen siendo de cada país y el editor avisa si dos países tienen el mismo idioma | Hecho |
| 27 | Navegación: barra lateral global (selector de app, Inicio, Actividad, Integraciones) y barra lateral de cada app (Resumen, Keywords, Mercado, Optimizar, Ajustes de la app), cabecera fija con selector de mercado y «Actualizar posiciones», paleta ⌘K, barra inferior en el móvil, páginas Actividad, Integraciones y Añadir app, Ajustes de la app con pestañas (Producto, Mercados, Marcas, Datos de Play Console, Zona de peligro) y redirecciones 308 de las páginas globales antiguas | Hecho |
| 28 | Inicio (KPIs de todas las apps, una fila por mercado con mini-gráfico, TOP 10 y 30, posición media, valoración y salud, y «Qué hacer hoy») y Resumen de cada mercado (KPIs, visibilidad a 30, 90 o 180 días con los cambios marcados y su impacto, próximos pasos, movimientos de la semana y competencia en una línea) | Hecho |
| 29 | Keywords: tabla de Seguimiento con buscador, filtros por facetas, «Vistas» (columnas y densidad), selección con barra flotante, tarjetas en el móvil y panel de detalle (`?k=`) con el TOP 10; pantalla única **Encontrar** (Autocompletado, Ideas con IA, TOP 10 y Reseñas) con popularidad estimada, «Medir» y descartes que no vuelven (migración 0021) | Hecho |
| 30 | Ficha de la tienda: barra superior (idiomas del mercado y «+ Añadir idioma», Publicada / Borrador / Comparar, «Optimizar con IA», «Adaptar a…», «Guardar»), editor con contador en barra, keywords subrayadas y avisos de normas en ondulado sobre las palabras exactas, panel con Vista previa de Google Play / App Store (capturas publicadas o de Creativos), Cobertura que resalta en el texto, Normas y Notas de la versión, y la propuesta de la IA como diff por palabras con «Aceptar campo» (`lib/word-diff.ts`, `phraseRanges`, `Issue.field` y `Issue.ranges`) | Hecho |
| 31 | Mercado: **Competidores** (cuota en áreas apiladas con tu app, 4 competidores y «Otros», o barras con un solo día; tabla con la cuota en la fila y el interruptor «Vigilar»; panel del competidor; línea de tiempo de cambios), **Reseñas** (columna de fuentes con el punto de «reseñas nuevas», análisis en tarjetas, «Lo que pide la categoría» arriba y el país del mercado activo; migración 0022) y **Tendencias** (escala de un tono, filas sin datos plegadas y «Próximos picos» con «Preparar») | Hecho |
| 32 | Creativos como editor de diseño: el estudio de capturas dividido en módulos (`components/screenshot-studio/`), barra superior con «Guardar», miniaturas que se reordenan arrastrando o con el teclado, lienzo con zoom y vista del set completo, inspector plegable (Texto, Captura, Dispositivo, Estilo, Fondo), plantillas en un diálogo que pregunta antes de pisar tus colores e ideas de fondo de la IA aparte (H23), aviso «Mejor en un ordenador» y sin scroll horizontal en Creativos y Vídeo. Cambios y pruebas: línea de tiempo por meses con el impacto agregado de cada cambio, «Añadir cambio» en un diálogo y experimentos en un tablero de tres columnas con edición en un panel lateral | Hecho |
| 33 | Pulido y móvil: Ajustes › Producto con funciones en tarjetas (chip de estado y edición en un panel lateral), versiones igual, «Importar desde CHANGELOG» en un diálogo y el aviso «La IA anuncia N funciones; M son de la X.Y.Z»; una sola acción principal por pantalla («Actualizar posiciones» pasa a secundaria); la Ficha lee `?focus=` de Tendencias; estados vacíos con una acción, esqueletos con la forma de cada pantalla, operaciones largas de la IA con pasos, sin bloquear la navegación y con «Ver resultado»; textos largos a `HelpTip`; axe sin fallos graves en todas las rutas y en los dos temas; en el móvil hace scroll el documento | Hecho |

## Stack

Next.js (App Router) y TypeScript, Postgres con Drizzle ORM, Tailwind 4, componentes sobre Radix (`radix-ui`), cmdk, sonner y lucide-react, Vitest y Playwright. Pensado para desplegarse en Vercel con el plan gratuito.

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

Cada día a las 05:00 UTC, Vercel Cron llama a `/api/cron/rankings` (configurado en `vercel.json`). Para cada keyword, tienda y país se hace una sola búsqueda (se piden 200 resultados) y se guarda la posición de cada app que la sigue, el TOP 5, el TOP 10 (desde la migración 0021; las posiciones anteriores solo tienen el TOP 5) y cuántos resultados devolvió la tienda. Si la app no aparece, se guarda «fuera de los N primeros», nunca 0. También puedes lanzarla a mano con «Actualizar posiciones», y las keywords nuevas se consultan nada más añadirlas.

La profundidad real depende de la tienda: App Store devuelve hasta 200 resultados; Google Play suele devolver unos 30, aunque el scraper ya pide más páginas (es un límite de Google, no nuestro). Por eso cada posición «> N» lleva su propio N, el de ese día y esa búsqueda: al pulsarla (o al pasar el ratón o el foco del teclado) se explica «Fuera de los N resultados que devuelve la tienda». El histórico y el gráfico de cada keyword usan el N de cada día, no el de hoy.

En App Store la posición es aproximada: la API pública no siempre ordena igual que la app de la tienda.

La consulta diaria va en este orden: posiciones → avisos → picos de temporada → competidores → email de los lunes → ficha propia → relevancia de las keywords sin valorar. Cuenta el tiempo desde el inicio, sobre los 300 s del límite:

- No empieza a medir la popularidad pasados 180 s.
- No consulta más fichas propias pasados 200 s.
- No empieza lotes de relevancia pasados 240 s, y cada petición a Claude se abandona a los 40 s.
- Toda petición a Claude se cancela como muy tarde a los 290 s.

Si un paso falla, los demás siguen y su error aparece en la respuesta JSON.

En la tabla de keywords, la columna **TOP 5** marca tu app con un borde azul y los competidores que vigilas (Competidores) con uno naranja; la leyenda está en el menú «Vistas», y el nombre de cada icono sale al pasar el cursor y lo leen los lectores de pantalla. Ver *Keywords › Seguimiento*.

## Popularidad, dificultad y oportunidad

Las tiendas no publican cuántas veces se busca una palabra, así que son estimaciones de 0 a 100:

- **Popularidad**: se escribe la keyword letra a letra en el buscador de la tienda (autocompletado) hasta que la tienda la sugiere. Cuantas menos letras hagan falta, y cuanto más arriba salga, más se busca. Se recalcula cada semana.
  - Se escriben las 12 primeras letras una a una, después las dos primeras de cada palabra siguiente y, por último, la keyword entera, con un máximo de 16 peticiones. Así una keyword cuya primera palabra es larga («recordatorio pastillas») se mide.
  - La fórmula es `popularidad = 100 × f × (1 − 0,05 × puesto en la lista)`, como mínimo 1, con `L' = min(longitud, max(12, primera palabra + 4))`.
    - Mientras las letras escritas no pasen de `L'`, `f = 1 − (letras escritas − 1) / L'`. Por encima queda una cola pequeña (de 1 a 5) que sigue bajando.
    - Las keywords cortas conservan la escala de siempre, y una frase larga sugerida tarde no puntúa más que una corta y muy buscada.
    - Ejemplo: «recordatorio pastillas», sugerida al escribir «recordatorio p», da 19.
  - Las keywords de más de 12 letras medidas antes del 3 de noviembre de 2026 (con la fórmula anterior) se vuelven a medir con la fórmula nueva: como mucho 25 en cada consulta de posiciones (la diaria, o al actualizar o seguir una app), primero las más antiguas. Si una ya se volvió a medir antes de esa fecha y su valor no deja saber con qué fórmula se midió (un 0, o un valor que dan las dos escalas), puede volver a medirse en los días siguientes hasta el 3 de noviembre.
  - **0** quiere decir que la tienda no la sugiere ni escrita entera. **–** quiere decir que aún no se ha medido.
- **Dificultad**: fuerza del TOP 10 de la búsqueda: cuántas apps llevan la keyword en el título, su valoración y, en App Store, su número de valoraciones. Se recalcula cada día.
- **Oportunidad**: `popularidad × (1 − 0,7 × dificultad / 100) × factor de relevancia`. La relevancia de 1 a 5 da un factor de 0,6 a 1; una keyword **sin valorar cuenta como 0,7**, así una palabra genérica muy buscada ya no gana a una frase central valorada con un 5 (ver *Relevancia e higiene de keywords*).
- **Google Trends**: interés semanal en Google de los últimos 12 meses en el país, relativo al pico de la propia keyword. Sirve para ver la estacionalidad, no para comparar keywords. Google Trends no tiene API pública y limita mucho las peticiones: se descargan como máximo 20 keywords por día y se refrescan cada semana.

Antes de seguir una keyword, **Encontrar** da una popularidad **estimada** sin pedir nada nuevo a la tienda, y «Medir popularidad» la mide de verdad para unas pocas (ver *Keywords › Encontrar*).

## Relevancia e higiene de keywords

Una lista con cientos de keywords mezcla frases que de verdad traen usuarios con ruido: palabras vacías de las descripciones («además», «puedes», «etc», «com»), búsquedas donde la gente quiere otra cosa («tomas omitidas» da *Thomas y sus amigos*) y palabras sueltas demasiado amplias («móvil», «alarma»). Ese ruido infla la oportunidad, llena Novedades de avisos y mete apps como «Reloj» entre tus competidores.

- **Palabras vacías** (`lib/stopwords.ts`): listas por idioma (es, en, pt, fr, de, it) de artículos, preposiciones, conectores, adverbios, verbos auxiliares y modales con sus formas habituales y restos web (com, www, etc). Además, palabras genéricas de cualquier descripción («datos», «configurar», «experiencia»): nunca son keyword solas, pero sí dentro de una frase («copia de datos», «el tiempo», «tiempo hoy»). Si la relevancia es 4 o más (o la has puesto tú a 3 o más), una palabra genérica deja de contar como vacía: «tiempo» es la keyword de una app del tiempo. *Keywords del TOP 10* ya no las propone.
- **Relevancia para todas**: al añadir keywords, Claude valora de 1 a 5 cuánto encaja cada una con tu app, usando la ficha de producto (o la ficha publicada si no la hay), en lotes de 10 por petición, 4 a la vez. Cada lote se guarda en cuanto responde.
  - Si tarda más de 20 segundos, sigue en segundo plano. La keyword sale como «calculando…» durante los 3 primeros minutos, y la tabla se recarga cada 15 segundos durante 2,5 minutos como máximo; después muestra «Sigue en segundo plano: recarga más tarde».
  - Si un lote falla, o la IA no valora alguna keyword, la tabla dice por qué no tiene relevancia. Mientras tanto cuenta como 0,7.
  - La consulta diaria vuelve a valorar las que faltan:
    - Hasta 200 al día, en lotes de 10 (3 a la vez), primero las que nunca se han intentado.
    - Va al final, después de los avisos y de la ficha propia, así que un aviso usa la relevancia nueva al día siguiente.
    - No empieza lotes pasados 240 segundos desde el inicio, y cada petición a Claude se abandona a los 40 segundos sin reintentar.
  - Si falla todo, las keywords se añaden igual.
  - **Recalcular con IA** (barra de la selección) vuelve a valorar las marcadas, menos las que has valorado tú.
- **Tu relevancia manda**: en el panel de cada keyword (y en la columna opcional «Relevancia editable») hay un selector de 1 a 5 que indica si la puso la IA o tú; «Cambiar relevancia» la fija para toda la selección. La que pones tú no la cambia nunca la IA (columna `relevance_source`).
- **Intención ajena**: las tiendas no dan la categoría de las apps en los resultados de búsqueda, así que no se puede comparar categorías. Con cada keyword se le pasan a Claude los títulos de las 5 primeras apps de hoy y se le pide marcar `foreign` cuando al menos 4 son otro tipo de app (juegos, dibujos, mensajería, relojes). Es una estimación del modelo, no un dato de la tienda; si no estás de acuerdo, súbele la relevancia a 3 o más y deja de contar como ajena.
- **Filtro Relevancia › «Probablemente irrelevante»** (`?f=noise` sigue funcionando): relevancia 2 o menos, intención ajena o palabra vacía. Una keyword a la que tú has dado relevancia 3 o más nunca entra en el filtro. Puedes marcar varias y pulsar **Quitar** en la barra de la selección: un aviso deja **Deshacer** durante 15 segundos, que recupera las keywords con su origen y su relevancia. El histórico de posiciones no se borra al quitar una keyword.
- **Presupuesto**: por encima de 150 keywords seguidas la tabla avisa de que alertas y cuota pierden precisión.
- En **Encontrar**, «Seleccionar todas» deja fuera las palabras vacías y las de relevancia 2 o menos. **Estimar relevancia con IA** valora las candidatas sin guardar nada (una petición por cada 100, hasta 200 por clic).
- El origen de cada keyword (`keyword_source`) distingue Manual, IA, Autocompletado (antes «Descubrir»), TOP 10 y **Reseñas** (desde la migración 0021; las seguidas antes desde Reseñas constan como IA y no se pueden recuperar).
- Para filtrar keywords «relevantes» en otras partes: `isRelevantKeyword` y `isLikelyIrrelevant` de `lib/relevance.ts`. Prompt versión `rel-1`.

## Keywords › Seguimiento

La tabla de `/a/[app]/[país]/keywords` (`components/keyword-table.tsx` sobre `DataTable`, `components/ui/data-table.tsx`):

- **Barra de herramientas:** buscador (sin tildes ni mayúsculas), filtros por facetas en chips (**Estado**: TOP 10, Al alcance, Bajando, Fuera; **Relevancia**: de 5 a 1, sin valorar y «Probablemente irrelevante»; **Origen**: Manual, IA, Reseñas, TOP 10, Autocompletado; **Dificultad**: baja, media, alta, sin datos), con el número de filas de cada opción, y **Vistas**: columnas y densidad (filas de 44 o 36 px), guardadas en `localStorage` (`rk-keyword-view-v1`), con la leyenda del TOP 5. Las opciones de una faceta se suman; las facetas se combinan. El filtrado y el orden se hacen en el navegador sobre las filas que manda el servidor (`lib/data-table.ts`, `lib/keyword-table.ts`).
- **Columnas por defecto:** Keyword (con su origen y la relevancia en puntos), Posición (`RankBadge` y el cambio desde ayer), Evolución 30 d, Popularidad, Dificultad, Oportunidad (el orden por defecto) y TOP 5. Opcionales: Variación 7 días, Relevancia editable y, en Google Play con el CSV importado, Visitantes de Play. Cada cabecera lleva su «?» con la definición; la cabecera es fija y las cifras van alineadas a la derecha.
- **«+ Añadir keywords»** abre un diálogo con **Escribir** (una por línea o separadas por comas) y **Pegar CSV**: lee la columna «keyword», «término», «search term»… (o la primera), con comas, punto y coma o tabuladores, y salta la cabecera (`parseKeywordCsv`).
- **Selección:** al marcar filas sale una barra flotante con **Cambiar relevancia**, **Recalcular con IA**, **Exportar CSV** y **Quitar** (con **Deshacer** durante 15 segundos).
- **Panel de detalle** (480 px, `?k=<id>` en la URL; se abre al pulsar una fila y Atrás lo cierra): posición a 90 días con las anotaciones y la media antes y después, el TOP 10 (o el TOP 5 en las posiciones anteriores a la 0021) con tu app y los competidores vigilados marcados, la relevancia y la intención editables, **Dónde aparece en tu ficha** (los campos del borrador principal o, sin borrador, de la ficha publicada que tienen la frase exacta, con `weightedCoverage`), **Analizar TOP 10** (abre Encontrar › TOP 10 con esa keyword) y **Quitar**. `/keywords/[id]` sigue existiendo para los enlaces directos, con Google Trends y las anotaciones.
- **En el móvil** (menos de 640 px) la tabla pasa a tarjetas (keyword, posición con su cambio, mini-gráfico y oportunidad) y los filtros se abren en una hoja inferior.

## Keywords › Encontrar

Una sola pantalla, `/a/[app]/[país]/encontrar`, con un campo **Semilla o tema** y cuatro vistas (`?fuente=`): **Pendientes**, **Autocompletado**, **Ideas con IA** y **TOP 10**. Todas dan la **misma lista de candidatas** (`components/candidate-list.tsx`): keyword, fuente, relevancia (la de la idea, o la que estimes con IA), popularidad, el porqué y una casilla, con **Seguir N**, **Descartar**, **Medir popularidad** y **Exportar CSV**.

- **Autocompletado** (antes Descubrir): la semilla sola y seguida de cada letra de la «a» a la «z», para encontrar frases long tail.
- **Ideas con IA:** ver abajo. La semilla es el enfoque de las ideas.
- **TOP 10:** lee la ficha completa de las 10 primeras apps de la búsqueda, sin contar la tuya. De su título, descripción corta (Google Play) y descripción saca palabras y frases de 1 a 3 palabras, sin artículos ni preposiciones; el porqué dice en cuántas apps y en cuántos títulos aparece. Las que solo usa una app se descartan porque suelen ser nombres de marca. En App Store no se lee el subtítulo porque la API pública no lo devuelve. `?kw=all` (de la antigua página) busca tus 8 primeras keywords.
- **Pendientes:** la bandeja de lo que aún no has decidido: las ideas con IA pendientes, las **palabras de las reseñas** (fuente «Reseñas»: llegan al analizar las reseñas de tu país y al abrir Encontrar, desde el último análisis de cada app) y las candidatas que has medido. Su número es el contador de «Encontrar» en la barra lateral.
- **Popularidad estimada:** sale del autocompletado ya leído, sin peticiones nuevas: el mejor `autocompleteScore` entre las listas donde aparece, con las letras escritas y su puesto (`estimatePopularity` en `lib/candidates.ts`). Se marca «estimada». **Medir popularidad** hace la medida real (la de las keywords seguidas, hasta 16 peticiones cada una) para como mucho **10** candidatas por clic, de 2 en 2, y la guarda.
- **Descartar** funciona igual en todas las fuentes, y lo descartado no vuelve en ninguna: una idea con IA se marca en `ai_suggestions`; el resto se guarda en la tabla `keyword_candidates` (migración 0021).
- **Seguir** añade las marcadas con el origen de su fuente (Autocompletado, IA, TOP 10 o Reseñas), consulta su posición en el momento y valora su relevancia.

**Modelo de datos.** Las ideas con IA siguen en `ai_suggestions` (con su estado, relevancia, competencia y modelo). `keyword_candidates` (`app_id`, `term`, `source` = autocomplete, ai, top10 o reviews, `status` = pending, followed o dismissed, `reason`, `relevance`, `popularity_estimate`, `popularity_measured`, único por app, término y fuente) guarda lo demás: las palabras de las reseñas y las candidatas de Autocompletado y TOP 10 en cuanto las descartas, las sigues o las mides (si no, se calculan en cada búsqueda). Una fila con fuente `ai` solo guarda la popularidad medida de una idea. Las dos tablas se unen en un mismo tipo `Candidate` con `mergeCandidates`, que quita repetidas, seguidas y descartadas.

### Ideas con IA

**Encontrar › Ideas con IA** pide a Claude (`claude-opus-5-5`, con la API de Anthropic) keywords nuevas para la app. Antes de llamar al modelo se reúnen señales reales: la ficha, las keywords que ya sigues y las que descartaste, el autocompletado de la tienda para las palabras del título y la categoría, y las apps que salen en el TOP 5 de tus keywords.

- La respuesta llega como JSON estructurado y se valida con Zod. Se quitan repetidas (también plurales y acentos), las que ya sigues o descartaste y las que contienen marcas de otras apps.
- Las ideas quedan pendientes hasta que eliges cuáles seguir. Nada se añade solo.
- La relevancia y la competencia son estimaciones de la IA, no datos de la tienda. La popularidad se puede medir antes de seguirla («Medir popularidad») y la dificultad se mide al seguirla.
- Cada idea guarda el modelo que respondió y la versión del prompt (`PROMPT_VERSION` en `lib/suggestions.ts`).
- Si el modelo rechaza una petición, la API la reintenta con el modelo alternativo que recomienda Anthropic (fallback del lado del servidor).
- Sin `ANTHROPIC_API_KEY` la pantalla lo indica y el resto de la app funciona igual.
- «Descartar» actúa sobre todas las ideas marcadas y dice cuántas ha descartado. Las descartadas no vuelven a proponerse.

## Ficha de la tienda

La pantalla **Ficha de la tienda** (`/a/[app]/[país]/ficha`, antes «Editor de ficha») sirve para preparar la próxima versión del texto. El borrador se guarda en la base de datos, uno por idioma (ver «Fichas por idioma y país»); para publicarlo se copia a App Store Connect o Google Play Console, o se envía desde «Publicar» si la consola está conectada. Tiene tres zonas:

- **Barra superior.** El selector de idioma muestra solo los idiomas del mercado y los que tienen borrador; el resto, y en Google Play las fichas personalizadas por país, salen de **«+ Añadir idioma»**. Al lado, el conmutador **Publicada | Borrador | Comparar** y las acciones **«Optimizar con IA»** (la principal), **«Adaptar a…»** y **«Guardar»**. «Adaptar a…» lista los idiomas del mercado en otra lengua: elegir uno abre esa ficha y empieza a adaptarla (`?adaptar=1`, que se quita de la URL al arrancar para que recargar no repita la llamada). Sin `ANTHROPIC_API_KEY` solo queda «Guardar».
- **Editor (60 %).** Campos grandes que crecen con el texto: el título a 20 px y la descripción a toda altura. Cada campo tiene un contador con barra, ámbar desde el 90 % del límite y rojo al pasarse (App Store: nombre 30, subtítulo 30, campo de keywords 100; Google Play: título 30, descripción corta 80, descripción 4000). Las keywords cubiertas salen subrayadas en azul suave y los avisos de normas, en ondulado rojo sobre las palabras exactas, como un corrector. Los avisos de cada campo también se listan debajo, en texto.
- **Panel (40 %)**, con pestañas:
  - **Vista previa**: la ficha como se ve en el móvil. En Google Play, icono, título, desarrollador, «Instalar», las 3 primeras capturas y la descripción corta en «Información de la app»; en el App Store, nombre y subtítulo junto al icono y «Obtener». Las capturas son las publicadas (`meta.screenshots`) o, si el producto tiene un diseño en **Creativos**, sus 3 primeras pantallas dibujadas con el mismo motor del estudio. El texto es el del editor y cambia mientras escribes.
  - **Cobertura**: las keywords agrupadas en «En título», «En descripción corta», «En descripción» (o los campos del App Store), «Solo palabras sueltas» y «Falta», con la cobertura ponderada. Al pulsar una se resalta en el texto (la frase o, si está suelta, cada palabra) y el editor va al campo.
  - **Normas**: los avisos de límites y normas, con su enlace oficial, y cuántas marcas de la competencia hay detectadas, con enlace a Ajustes › Marcas.
  - **Notas de la versión**: el generador de siempre.
- **Publicada** muestra la ficha leída de la tienda (sustituye al antiguo bloque «Ficha publicada»). **Comparar** muestra, campo a campo, la publicada frente al borrador como diff por palabras.
- En móvil las zonas se apilan: barra, editor y panel debajo.

**Propuesta de la IA como diff.** La propuesta de «Optimizar» o «Adaptar» sale encima del editor, campo a campo, como cambios sobre el texto actual: lo añadido en verde y lo quitado tachado en rojo (`<ins>`/`<del>`). Cada campo tiene «Aceptar campo» y «Descartar»; abajo, «Aceptar todo» (secundario) y «Descartar». Dentro del bloque van la cobertura ponderada antes y después, **Gana / Pierde / Cambia de campo**, «Construida alrededor de», los avisos de la IA (por ejemplo, palabras sin traducir al adaptar) y los avisos de normas si lo aceptas todo. El aviso en rojo del candado de calidad se mantiene.

**Bajo el capó.**
- `lib/word-diff.ts`: `wordDiff(antes, después)`, un diff LCS por palabras que conserva espacios y saltos de línea (palabras, signos y espacios son unidades; se recortan primero el principio y el final comunes). Une el espacio suelto entre dos cambios y pone lo quitado antes que lo añadido. Una descripción de 4000 caracteres tarda milisegundos.
- `phraseRanges(texto, frase)` (en `lib/text.ts`, reexportada desde `lib/metadata-check.ts`): las posiciones `[inicio, fin)` de cada aparición en el **texto original**, con la misma comparación que la cobertura (sin acentos ni mayúsculas, palabra a palabra). Usa `foldWithMap`, que ahora vive en `lib/text.ts`, así que los acentos descompuestos (NFD) quedan dentro del subrayado.
- Los avisos (`Issue`) llevan `field` y `ranges`. Las reglas de texto de `lib/policy-check.ts` (promoción, emojis, mayúsculas, símbolos, llamadas a la acción, otras marcas, salud, precios, campo de keywords) marcan las palabras exactas; la densidad marca cada repetición de la frase y el relleno sin repeticiones, el párrafo o la ventana de 300 caracteres peor. Los límites de longitud marcan lo que sobra. Los avisos de todo un campo (aviso médico) tienen campo pero no posiciones, y la declaración de salud de Play Console, que es de toda la ficha, no tiene ni campo (`PolicyRule.listing`): sale solo en Normas.
- El subrayado es una capa espejo detrás de un `<textarea>` transparente, con el mismo texto y tipografía (`components/highlight-textarea.tsx`); el espejo también da la altura, así que no hay scroll que sincronizar.
- `/dev/ui` incluye una demo de la propuesta con datos fijos, que la prueba e2e usa porque no tiene clave de IA.

### Fichas por idioma y país

Cada app tiene un borrador por idioma, guardado en la tabla `listing_drafts` (migración `0015_listing_drafts`): `locale` (BCP 47: `es-ES`, `en-US`, `zh-Hans`…), `country` y el texto. `country` vale `""` para la ficha principal del idioma y un código de país (`mx`) para una **ficha personalizada por país** de Google Play. Se eligió `""` y no `NULL` porque en Postgres dos `NULL` nunca chocan en un índice único: con `""` basta el índice `(app_id, locale, country)` y el guardado es un upsert.

- **Selector de idioma** en la barra superior (`?locale=en-US&country=mx` en la URL). Ofrece la ficha principal (el `locale` del país de la app en `lib/countries.ts`), en el App Store los otros idiomas que Apple indexa en ese país (`extraLocales`) y los borradores guardados. El resto de idiomas y, en Google Play, la «Ficha personalizada por país» están en «+ Añadir idioma».
- `extraLocales` sale de la tabla [App Store localizations](https://developer.apple.com/help/app-store-connect/reference/app-store-localizations) de Apple, leída el **30 oct 2026**: por ejemplo, en Estados Unidos también cuentan el español (México), el chino, el francés, el coreano, el portugués (Brasil), el ruso, el árabe y el vietnamita; en España, el catalán y el inglés (Reino Unido). Apple la cambia de vez en cuando: verifícala antes de fiarte. De la India solo se guarda el hindi de sus 11 idiomas extra.
- **Antigüedad del borrador**: «Borrador del 27 oct · la ficha publicada cambió el 29 oct…» en amarillo cuando la tienda actualizó la app (`meta.updatedAt`) después de guardar el borrador; si la tienda no da fecha, solo dice cuándo se leyó la ficha (`metaFetchedAt`).
- **Adaptar a otro idioma** con IA (`localizeListing`, prompt `loc-4` en `lib/localize.ts`): parte de la ficha principal (borrador o publicada) y usa el autocompletado de la tienda y los títulos del TOP en el país de destino (`lib/locale-market.ts`: 1 lectura de la ficha, hasta 4 autocompletados y 2 búsquedas, con caché de 6 horas por servidor), más la ficha de producto. No es una traducción literal.
  - Si el idioma cambia, tus keywords se envían solo como conceptos que cubrir, no como keywords. Si sigues la app en el país de destino, se envían primero sus keywords.
  - Todos los campos tienen que estar en el idioma de destino. `lib/language-detect.ts` lo comprueba con las palabras vacías de cada idioma. Hay dos fallos que bloquean: un campo en otro idioma y un campo copiado sin traducir. En ese caso se reintenta una vez; si vuelve a fallar, sale un error en lugar de la propuesta.
  - Las palabras sueltas de la ficha original que se quedan sin traducir, o las keywords copiadas, no bloquean: se piden corregir en el reintento y, si siguen, salen como aviso en la propuesta. No cuentan como palabras sin traducir los nombres propios (Google Fit, iPhone), el nombre de la app aunque no esté declarado como marca (si lo parece: palabras en mayúscula que no son corrientes, como «Pill Buddy»; un título descriptivo como «Recordatorio De Medicamentos» no cuenta), ni las palabras que usa el mercado de destino. Las palabras que se escriben igual en los dos idiomas («diabetes», «control») pueden salir como aviso: revísalo.
  - Si no sigues la app en ese país, el editor avisa antes de adaptar y ofrece «Seguir también en <país>».
  - La propuesta sale como diff campo a campo, igual que la del optimizador, pasa por el comprobador de normas (con un reintento si rompe un límite, la marca declarada o una norma con nivel de error) y no se guarda hasta que pulsas «Guardar».
- **Idioma sin borrador**: si un idioma no tiene borrador (también después de «Borrar borrador»), el editor parte de la ficha publicada solo cuando es el mismo idioma. Si no, los campos quedan vacíos con el aviso «Aún no hay ficha en <idioma>: usa «Adaptar a <locale>»». Nunca se precarga texto de otro idioma.
- Tus keywords son las del país de la app: en un borrador de otro idioma el editor no las mide y lo dice. Para medir otro idioma, añade ese país en **Ajustes de la app › Mercados**.
- **Cobertura por idioma**: cuando hay más de una ficha, una tabla con tus 25 keywords relevantes de más oportunidad × cada ficha guardada, con la cobertura ponderada de cada una y el campo que cubre cada keyword.
- `apps.draft` se copió a `listing_drafts` en la migración (con el locale del país de la app) y ya no se escribe; se borrará en una versión posterior.
- Para leer un borrador desde otro módulo (la publicación en Google Play de la fase 20): `getListingDraft(appId, locale, country = "")` en `lib/listing-draft-queries.ts`, o `getListingDrafts(appId)` para todos. El `locale` es BCP 47 con región; Play Console usa algunos códigos propios (`es-419` para Latinoamérica), el mapeo está en `lib/play-console/locales.ts` (ver «Google Play Console»).

### Notas de la versión

La pestaña **Notas de la versión** del panel de la ficha escribe el texto de «Novedades de esta versión» en el idioma abierto (`writeReleaseNotes`, prompt `rn-1` en `lib/release-notes.ts`).

- Parte de las funciones **Próxima versión** de la ficha de producto, las notas de la última versión declarada y el CHANGELOG que pegues (hasta 10.000 caracteres). Usa el tono de la marca y, solo si encajan con naturalidad, tus 10 keywords relevantes de más oportunidad (si el idioma es el de tus keywords).
- Límites: Google Play, **500** caracteres por idioma; App Store, **4000**. Si la IA se pasa, el texto se corta en la última línea completa, se avisa y se pide una segunda versión más corta.
- Texto plano para la tienda: quita el markdown y usa viñetas «•».
- Comprobador de normas reducido: términos de precio, promoción o ranking, otras marcas, testimonios, afirmaciones de salud y precios concretos, más la longitud. Se repite en el navegador mientras editas el texto.
- No se guarda: se edita en la tarjeta y se copia con «Copiar» a la consola de la tienda.

### Candado de calidad

Una propuesta de la IA no puede salir como recomendada si cubre peor tus keywords que el texto actual.

- **Cobertura ponderada** (`weightedCoverage` en `lib/metadata-check.ts`), de 0 a 100: cada keyword relevante (no es palabra vacía, no tiene intención ajena y su relevancia es 3 o más, o aún no está valorada) vale su oportunidad (como mínimo 1), multiplicada por el peso del campo donde está la frase exacta. Pesos: Google Play, título 3, descripción corta 2, descripción 1; App Store, nombre 3, subtítulo 2, campo de keywords 1,5, descripción 0 (Apple no la indexa). Si están todas las palabras pero no la frase junta, cuenta una parte del peso del campo más débil que hace falta: el 80 % en App Store (Apple combina las palabras de nombre, subtítulo y campo de keywords) y la mitad en Google Play. Se divide por el máximo posible (todas en el título).
- El editor, el optimizador y el aviso al guardar usan la misma función, así que ven la misma cifra.
- **Optimizar con IA** envía al modelo todas las keywords relevantes (hasta 150, las mejores primero), con dónde las cubre hoy la ficha y una lista «no pierdas estas» con las 20 cubiertas de más oportunidad. Pide repetir cada frase 2 o 3 veces en la descripción, el mismo umbral que el comprobador de densidad, y no cerrar la descripción con un párrafo que solo resume keywords. Solo conserva al principio del título la **marca declarada** en la ficha de producto; sin marca declarada, el título se puede reescribir entero. Prompt `lst-4`.
- Si la primera propuesta baja la puntuación, pierde una keyword con oportunidad 40 o más, rompe una norma con nivel de error, se pasa de un límite o quita la marca del título, se pide **una segunda** con la lista concreta de lo que perdió y de las normas rotas. Se queda la mejor de las dos (primero la que respeta los límites, luego la que tiene menos errores de normas y luego la de más puntuación).
- Si aun así es peor, sale con un aviso en rojo: puedes aceptar campo a campo lo que te convenza.
- La propuesta enseña la puntuación antes y después, las keywords que **gana**, **pierde** y las que **cambian de campo** (ordenadas por oportunidad) y sus propios avisos de normas, antes de aplicarla.
- Al guardar un borrador que cubre peor que el anterior (o que la ficha publicada si no había borrador), se guarda igual pero aparece un aviso con lo que deja de cubrir.

### Comprobador de normas

`lib/policy-check.ts` revisa la ficha contra las normas de Google Play y App Store. Cada regla tiene id, tienda, campo, nivel (**error**: la norma lo prohíbe; **aviso**: probable problema de revisión o de posicionamiento; **info**: conviene saberlo), mensaje en español, enlace a la norma oficial y fecha de revisión. Los avisos salen en la pestaña **Normas** de la ficha, subrayados en ondulado sobre las palabras exactas (`Issue.field` y `Issue.ranges`) y en el bloque de la propuesta, y los errores se envían al modelo en el reintento.

Fuentes leídas el **30 oct 2026** (descargadas y leídas, no de memoria):
[Google Play, política de metadatos](https://support.google.com/googleplay/android-developer/answer/9898842),
[Google Play, contenido y servicios de salud](https://support.google.com/googleplay/android-developer/answer/16679511),
[App Store Review Guidelines 2.3 y 1.4.1](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata) (actualizadas el 16 oct 2026) y
[Apple, Creating your product page](https://developer.apple.com/app-store/product-page/) (campo de keywords).

| Regla | Tienda | Campo | Nivel | Qué comprueba |
| --- | --- | --- | --- | --- |
| `play.title.emoji` | Play | Título | Error | Emojis y emoticonos |
| `play.title.symbols` | Play | Título | Error | Símbolos decorativos (★, ✓, ►…) o repetidos (!!!) |
| `play.title.caps` | Play | Título | Aviso | MAYÚSCULAS sostenidas fuera de la marca |
| `play.title.promo` | Play | Título | Error | Rendimiento, ranking, precio, promoción o «nuevo» (gratis, mejor, nº 1, top, oferta, descuento, bonificación…) en es, en, pt, fr, de e it |
| `play.short.promo` | Play | Descripción corta | Aviso | Ranking o precio |
| `play.description.promo` | Play | Descripción | Aviso | Precio o promoción y afirmaciones como «la mejor app» o «nº 1» |
| `play.title.cta` | Play | Título y descripción corta | Aviso | Llamadas a la acción («descarga ya», «download now»). La norma actual no las nombra literalmente: se deriva de «texto engañoso o no descriptivo» |
| `play.description.density` | Play | Descripción | Aviso | Una frase seguida más de 3 veces, o una palabra suelta más de 6 veces y más de 4 por cada 1000 caracteres |
| `play.description.keyword-list` | Play | Descripciones | Aviso | Listas de palabras sin frases («Keywords:», 6 o más elementos cortos seguidos, o keywords seguidas separadas por comas) |
| `play.description.keyword-share` | Play | Descripción | Aviso | Relleno sin repeticiones: más del 38 % de las palabras de un párrafo o de unos 300 caracteres pertenecen a keywords seguidas. El candado de calidad lo trata como error |
| `play.description.testimonial` | Play | Descripción | Aviso | Testimonios con estrellas o citas sin firmar o firmadas «— un usuario» |
| `other-apps` | Ambas | Textos visibles | Aviso | Marcas de otras apps (las del detector de marcas) |
| `play.health.declaration` | Play | – | Info | Categoría de salud o medicina: rellenar la declaración de apps de salud en Play Console |
| `health.claims` | Ambas | Textos visibles | Aviso | Afirmar que la app diagnostica, cura, trata o previene enfermedades (no salta en frases con negación o de aviso legal) |
| `health.disclaimer` | Ambas | Descripción | Info | Falta el aviso de que no es un dispositivo médico ni sustituye el consejo médico |
| `ios.name.price` | App Store | Nombre y subtítulo | Error | Precios o promociones |
| `ios.name.claims` | App Store | Nombre y subtítulo | Aviso | Afirmaciones que no se pueden comprobar (mejor, nº 1, top) |
| `ios.description.price` | App Store | Descripción | Aviso | Precios concretos (2,99 €) |
| `ios.keywords.plural` | App Store | Campo de keywords | Aviso | Plurales de palabras que ya están en singular |
| `ios.keywords.category` | App Store | Campo de keywords | Aviso | Nombre de la categoría o la palabra «app» |
| `ios.keywords.other-apps` | App Store | Campo de keywords | Error | Nombres de otras apps o marcas |

Las reglas son heurísticas: avisan, no deciden. Si una norma cambia, actualiza la regla y su `reviewedAt` (constante `REVIEWED_AT`).

### Marcas detectadas

La IA evita las marcas de otras apps en la ficha y en las ideas. El detector (`competitorBrands` en `lib/suggestions.ts`) mira las 25 apps que más aparecen en el TOP 5 de tus keywords y toma como marca la parte del título antes de un separador («MyTherapy: …»), el título si es de una sola palabra, la primera palabra si es rara («Medisafe Recordatorio Pastillas») y el nombre del desarrollador. Para no confundir palabras genéricas con marcas:

- nunca es marca una palabra o frase de tu título, de tus keywords seguidas, de tu ficha de producto o de tus excepciones;
- una cabeza de título que usan 3 o más apps distintas es una frase común, no una marca («Notas», «Recordatorio de pastillas - …»);
- un desarrollador hecho solo de palabras genéricas («Apps Studio») tampoco cuenta;
- las palabras se comparan por su raíz, sin acentos, y en el idioma del país y en inglés: «antibiotic» no es marca si sigues «antibiótico cada 8 horas»;
- una marca necesita al menos una palabra que no sea corriente. Son corrientes las palabras vacías, las genéricas, las habituales en títulos (pill, reminder, tracker, lady, app, free, pro…) y las que salen en 3 o más títulos;
- en un título sin separador, solo cuenta como marca una primera palabra en mayúscula que no sea corriente, o un nombre inventado como «PillPal».

Los nombres de desarrollador van en un grupo aparte, «Desarrolladores», plegado. La IA y el comprobador de normas siguen evitando las dos listas.

**Ajustes de la app › Marcas** muestra la lista **Marcas detectadas** (con las keywords del mercado en el que estás) con «No es una marca» para corregir errores (se guarda por app en la tabla `brand_exceptions`, migración `0012_brand_exceptions`) y la lista de las que marcaste, con «Es una marca» para deshacerlo. La ficha de la tienda no las lista: en la pestaña Normas dice cuántas hay, con el enlace «Revisar en Ajustes › Marcas», y avisa (subrayada en el texto) si una aparece en tu texto.

## Ficha de producto

La ficha publicada en la tienda siempre va por detrás del producto: si la IA solo la lee, describe funciones viejas y se olvida de las nuevas. La pestaña **Producto** de Ajustes de la app (`/a/[app]/ajustes/producto`) guarda lo que hace la app contado por su dueño, y el optimizador de ficha, las ideas de keywords, los textos e iconos de Creativos y el análisis de reseñas la usan como **fuente de verdad** (bloque `PRODUCT FACTS` en el prompt).

- Resumen: **marca** (opcional), qué es, para quién, diferenciales, lo que la ficha nunca debe decir (por ejemplo, «no hacer afirmaciones médicas»), tono e idiomas.
- La **marca** es lo único que el optimizador y «Adaptar» conservan sin traducir al principio del título. Se propone a partir del título publicado, pero solo se guarda si la confirmas. Muchos títulos de Google Play son solo keywords: en ese caso déjala vacía. Migración `0018_product_brand`.
- Funciones con estado: **publicada**, **próxima versión**, **planeada** o **retirada**, la versión en que llegó y si se puede anunciar. Se ven como **tarjetas** con un chip de estado; al pulsar una se edita en un panel lateral, y «Añadir función» abre el mismo panel vacío. Las versiones, igual: una fila por versión que se edita en el panel.
- Arriba, una línea dice lo que ve la IA: «La IA anuncia 25 funciones; 20 son de la 3.0.0» (y cuántas más con la próxima versión). Sale de `aiFeatureNotice()` en `lib/product-facts.ts`. Las planeadas y las retiradas nunca se describen como disponibles: llegan a la IA solo en una línea «no las menciones», para que las quite si la ficha actual aún las nombra. Las que no se anuncian no llegan nunca.
- En la ficha de la tienda, en «Para la IA», eliges «Versión publicada» (solo funciones publicadas) o «Próxima versión» (también las de la próxima). Ideas y Creativos usan la próxima versión; las reseñas, la publicada. Al analizar un competidor también se pasan, marcadas, las funciones de la próxima versión, para detectar qué quejas resolverá (prompt `rv-6`).
- **Importar desde CHANGELOG** (botón de la tarjeta Funciones, en un diálogo): pegas el texto, Claude propone las funciones con su estado y las versiones, y tú marcas qué se guarda. Nada se guarda sin tu confirmación. La propuesta sigue ahí si cierras el diálogo o cambias de página mientras Claude lee.
- Sin ficha de producto todo funciona como antes (la IA solo usa la ficha publicada) y el editor lo avisa.
- La lógica está en `lib/product-facts.ts` (`factsForPrompt`); al cambiar los prompts se subieron sus versiones (`lst-2`, `kw-2`, `crt-2`, `rv-2`).

## Google Play Console

Conexión opcional con la **Google Play Developer API** (Android Publisher v3) mediante una cuenta de servicio. Sin configurarla, el resto de Rankeo funciona igual y la ficha se sigue copiando a mano.

### Configurarla

1. En [Google Cloud Console](https://console.cloud.google.com/), en un proyecto tuyo, activa la **Google Play Android Developer API**.
2. Crea una **cuenta de servicio** y descarga una **clave JSON**.
3. En **Play Console › Usuarios y permisos**, invita el correo de la cuenta de servicio (`…@….iam.gserviceaccount.com`) con acceso a la app y permisos para editar la ficha de Play Store y responder reseñas.
4. Pega el JSON (tal cual o en base64) en la variable de entorno del servidor `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (en Vercel › Settings › Environment Variables).
5. Por defecto la conexión es de **solo lectura**: Rankeo lee la ficha y las reseñas pero no cambia nada. Para publicar y responder, añade `GOOGLE_PLAY_ALLOW_WRITE=1`.

La clave solo se usa en el servidor: Rankeo firma con ella un JWT (RS256, con `node:crypto`, sin librerías nuevas), lo cambia por un token de acceso en `https://oauth2.googleapis.com/token` con el permiso `androidpublisher` y guarda el token en memoria hasta que caduca (1 hora). Nunca llega al navegador ni a los logs.

### Publicar el borrador

En la ficha de la tienda, **Publicar en Google Play** (botón secundario) abre una vista previa con lo que hay **ahora mismo** en la consola (leído en una edición temporal que se borra) frente al **borrador guardado**, campo a campo: título, descripción corta y descripción. Solo se publica lo guardado, no lo que estés escribiendo.

- Al confirmar: `edits.insert` → `edits.listings.patch` → `edits.validate` → `edits.commit`. Si un paso falla, se borra la edición y no queda nada a medias. Se usa `patch` y no `update` para no borrar el vídeo promocional, que Rankeo no edita; si ese idioma aún no tiene ficha, se crea con `update` (PUT), que es el método que la crea. Si la consola ya tiene ese texto, no se envía nada.
- Si Google acepta la publicación pero no se puede guardar el historial, se muestra como publicada y se avisa de que falta el registro.
- El envío usa `changesInReviewBehavior=ERROR_IF_IN_REVIEW`: si tienes cambios en revisión en Google, se rechaza en lugar de cancelarlos (la API, por defecto, los cancelaría).
- Google revisa los cambios antes de mostrarlos en la tienda: puede tardar desde minutos hasta días.
- No se publica si el borrador cambió desde que abriste la vista previa, si un texto pasa del límite o si el título queda vacío.
- **Idiomas**: Play usa sus propios códigos (`lib/play-console/locales.ts`, de la [lista de idiomas de Play Console](https://support.google.com/googleplay/android-developer/answer/9844778), leída el 30 oct 2026). El español de cualquier país de Latinoamérica va a `es-419`, el hebreo a `iw-IL` y el chino simplificado a `zh-CN`. Las variantes que Play no tiene (`en-NZ`, `de-AT`, `fr-BE`…) no se publican, para no pisar la ficha que ven otros países; se sugieren las parecidas.
- **Fichas personalizadas por país**: la API no las incluye (comprobado en su documento de descubrimiento), así que se copian a mano.
- Cada intento, también los que fallan, queda en la tabla `publications` (app, tienda, locale de Rankeo y código de la consola, campos que cambian con su valor antes y después, estado y error) y se ve en el **Historial de publicaciones** de esa página. En los fallidos, «antes» queda vacío porque no se llegó a leer. La fase 22 la usará para las anotaciones automáticas: `getPublications(appId)` y `recordPublication` en `lib/publication-queries.ts`.

### Responder reseñas

En **Reseñas**, con tu app seleccionada, la tarjeta **Responder reseñas** (dato oficial) lista las reseñas escritas o editadas en los **últimos 7 días**, que es lo que permite `reviews.list`, con tu respuesta actual si la hay.

- **Redactar respuesta con IA** (`draftReviewReply`, prompt `rr-1` en `lib/review-replies.ts`): relee la reseña desde Google (no se fía de lo que mande el navegador) y usa la ficha de producto en modo «versión publicada» y el tono de la marca. No promete funciones planificadas ni pide subir la nota. Máximo **350 caracteres** (límite de `reviews.reply`); si la IA se pasa, se recorta en la última frase completa y se avisa.
- **Responder** solo aparece con `GOOGLE_PLAY_ALLOW_WRITE=1` y pide confirmación. En solo lectura puedes copiar la respuesta a Play Console.
- Cuota de la API: 200 lecturas por hora y 2000 respuestas al día por app.

### Términos de búsqueda reales (dato oficial)

En **Ajustes de la app › Datos de Play Console** (solo Google Play), **Términos de búsqueda reales** importa el CSV de Play Console con los visitantes de la ficha y las adquisiciones (visitantes que instalaron) por término de búsqueda. Es la única cifra oficial de Rankeo; la popularidad sigue siendo una estimación del autocompletado y nunca se mezclan.

- Formatos: el informe mensual de Cloud Storage `store_performance_[paquete]_[aaaaMM]_traffic_source.csv` (UTF-16, una fila por día; [formato documentado](https://support.google.com/googleplay/android-developer/answer/6135870), leído el 30 oct 2026) o la descarga de la pantalla de términos de búsqueda, en UTF-8 o UTF-16, con comas, punto y coma o tabuladores y cabeceras en español o inglés. Si el CSV no tiene fecha, indica el periodo que elegiste al descargarlo. El formato exacto de la descarga desde las pantallas no está documentado: el lector reconoce las columnas por palabras («término», «visitantes», «adquisiciones»…), y si no las encuentra lo dice.
- Se ignoran las filas sin término y el cajón «Other», donde Google agrupa los términos con pocas visitas.
- Se guarda en `search_term_stats` (una fila por término y día, o por término y periodo). Reimportar el mismo periodo sustituye sus datos.
- En la tabla de keywords, las que coinciden llevan la etiqueta **Oficial** con visitantes e instalaciones de los últimos 30 días importados (o del periodo de la última exportación, si es más largo); en el detalle de la keyword salen como dos cifras aparte de la popularidad estimada. Debajo del formulario, las búsquedas que te traen visitas y aún no sigues.
- La API de Google Play no da estos datos: solo están en la consola y en los informes de Cloud Storage.
- Los archivos de más de 3,5 MB se rechazan en el navegador, antes de enviarlos.

### Qué está verificado y qué no

Endpoints, parámetros y límites comprobados el **30 oct 2026** en la [referencia REST de la Android Publisher API v3](https://developers.google.com/android-publisher/api-ref/rest/v3/edits) (edits, edits.listings, reviews) y en su documento de descubrimiento (revisión 20261029), en la guía [Reply to Reviews](https://developers.google.com/android-publisher/reply-to-reviews) y en [OAuth 2.0 para cuentas de servicio](https://developers.google.com/identity/protocols/oauth2/service-account). Los tests cubren la firma del JWT con una clave generada en el propio test, el intercambio del token, el orden de las llamadas, el borrado de la edición si algo falla, el mapeo de idiomas y el lector de CSV, siempre con un `fetch` simulado. **No se ha probado contra una cuenta real de Play Console**: la primera vez, revisa la vista previa con calma antes de confirmar.

## App Store Connect

Conexión opcional con la **App Store Connect API** mediante una clave de API de equipo. Sin configurarla, todo lo demás funciona igual.

### Configurarla

1. En **App Store Connect › Usuarios y acceso › Integraciones › App Store Connect API**, crea una clave de equipo con el rol **App Manager** (o **Admin** si también quieres pedir los informes de analítica) y descarga el archivo `.p8` (solo se puede descargar una vez).
2. Añade en las variables de entorno del servidor `ASC_ISSUER_ID` (arriba en esa página), `ASC_KEY_ID` (columna «ID de clave») y `ASC_PRIVATE_KEY` (el contenido del `.p8`; si tu panel no admite varias líneas, escribe los saltos como `\n`).
3. Por defecto es de **solo lectura**. Para guardar textos y pedir informes desde Rankeo, añade `ASC_ALLOW_WRITE=1`.

Rankeo firma en el servidor un JWT ES256 (con `node:crypto`; cabecera `alg`, `kid`, `typ`; carga `iss`, `iat`, `exp` a 15 minutos y `aud: appstoreconnect-v1`, como pide Apple, que rechaza tokens de más de 20 minutos) y lo reutiliza hasta 2 minutos antes de caducar. La clave nunca llega al navegador ni a los logs.

### Enviar el borrador

En el editor de una app del App Store, **Enviar a App Store Connect** (secundario) abre la vista previa de la **versión en preparación**: nombre y subtítulo (`appInfoLocalizations`), campo de keywords y descripción (`appStoreVersionLocalizations`), con lo que hay ahora en App Store Connect frente al borrador guardado. Debajo puedes escribir el **texto promocional** (170 caracteres) y las **novedades de esta versión** (4000); empiezan con el texto actual y, si los dejas igual o vacíos, no cambian.

- Solo se guarda en la versión en preparación (estados `PREPARE_FOR_SUBMISSION`, `READY_FOR_REVIEW`, `DEVELOPER_REJECTED`, `REJECTED`, `METADATA_REJECTED` o `INVALID_BINARY`, según la página [App and submission statuses](https://developer.apple.com/help/app-store-connect/reference/app-and-submission-statuses), que marca los editables con iconos: la lista sale de sus descripciones). Si no hay ninguna, Rankeo pide crearla en App Store Connect. **No envía la versión a revisión**: eso sigue haciéndose en App Store Connect.
- La API pública del App Store no devuelve el subtítulo ni el campo de keywords, así que un borrador que parte de la ficha publicada los tiene vacíos: un campo vacío en el borrador **nunca borra** el de App Store Connect, se mantiene y se avisa. El nombre y el subtítulo solo se tocan si la información de la app está en un estado editable.
- Se re-lee App Store Connect al confirmar y solo se envían los campos que cambian (un `PATCH` para nombre y subtítulo y otro para el resto). No se envía si el borrador cambió desde la vista previa o si un texto pasa del límite.
- **Idiomas**: Apple usa sus códigos ([locale shortcodes](https://developer.apple.com/documentation/appstoreconnectapi/managing-metadata-in-your-app-by-using-locale-shortcodes), leídos el 30 oct 2026), unos con región (`es-MX`, `en-GB`) y otros sin ella (`it`, `ja`, `ko`): `it-IT` va a `it`, cualquier árabe a `ar-SA`, `zh-TW` a `zh-Hant`. Las variantes que Apple no tiene (`es-AR`, `en-NZ`, `de-AT`…) no se envían: esos países ven otra localización y se sugieren las del mismo idioma. Si la versión no tiene aún ese idioma, hay que añadirlo antes en App Store Connect.
- La app se busca por su Apple ID (el `storeId` de Rankeo) y, si la clave no la ve, por el bundle id.
- Cada intento queda en `publications` igual que en Google Play, con estado «Guardada en App Store Connect» o «Falló». Si el primer `PATCH` entra y el segundo falla, se guarda qué campos llegaron y cuáles no («Guardado a medias»).

### Informes de analítica

En la misma página, **Informes de analítica** lista las peticiones de informes de la app y los informes que Apple ha generado (`GET /v1/apps/{id}/analyticsReportRequests?include=reports`), agrupados por categoría (interacción en el App Store, comercio, uso de la app, rendimiento…). Si no hay ninguna petición activa, con `ASC_ALLOW_WRITE=1` puedes pedirlos (`POST /v1/analyticsReportRequests`, acceso `ONGOING`, con confirmación); Apple tarda 1 o 2 días en generar los primeros y deja de hacerlo si nadie los descarga durante un tiempo (`stoppedDueToInactivity`).

Qué ofrece la Analytics Reports API ([Downloading Analytics Reports](https://developer.apple.com/documentation/appstoreconnectapi/downloading-analytics-reports), leído el 30 oct 2026): una petición (`ONGOING` para datos diarios, semanales y mensuales desde ese día, o `ONE_TIME_SNAPSHOT` para el histórico) genera informes por categoría; cada informe tiene **instancias** por granularidad y fecha de proceso, y cada instancia uno o varios **segmentos** (los archivos del informe) con su URL de descarga, tamaño y checksum. Apple añade ruido o umbrales de privacidad a algunos informes. **Aún no se descargan ni se cruzan con las keywords**: requiere guardar y procesar archivos grandes, y queda para más adelante. Hasta entonces, las cifras de impresiones y visitas siguen viéndose en App Store Connect.

### Qué está verificado y qué no

Endpoints, atributos, estados y límites comprobados el **30 oct 2026** en la [referencia de la App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi) (apps, appStoreVersions, appStoreVersionLocalizations, appInfos, appInfoLocalizations, analyticsReportRequests) y en [Generating Tokens for API Requests](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests), leyendo el JSON de cada página. Los tests firman y verifican el JWT ES256 con una clave P-256 generada en el propio test, y comprueban las URLs, los cuerpos JSON:API, la elección de la versión editable, el mapeo de idiomas y que un campo vacío no borra el de la consola, siempre con un `fetch` simulado. **No se ha probado contra una cuenta real de App Store Connect.**

## Competidores

La pantalla **Competidores** usa el TOP 5 guardado de cada keyword:

- **Cuota de visibilidad**: cada keyword vale su popularidad (1 si aún no se ha medido) y se reparte entre las cinco primeras posiciones con pesos 40, 22, 15, 12 y 11 %, parecidos a la proporción de clics de las tiendas. El gráfico apila, en 30, 90 o 180 días (`?dias=`), tu app (en `--series-own`, abajo), las cuatro apps más visibles (con el mismo color que en Resumen) y «Otros» con lo que queda hasta el 100 %. Con un solo día de datos dibuja barras horizontales de ese día (`lib/competitor-view.ts`).
- **Tabla de competidores** (`DataTable`): app, cuota con una barra dentro de la fila (escalada al líder; la cifra es la real), keywords en el TOP 5, mejor posición, valoración y el interruptor **«Vigilar»**. Las apps vigiladas que ya no salen en el TOP 5 siguen en la tabla para poder dejar de vigilarlas; apagar el interruptor pide confirmación porque borra su historial.
- **Panel del competidor**: al pulsar una fila se abre un panel con su ficha guardada (descripción corta, inicio de la descripción, versión, categoría y capturas), sus cambios, las keywords que comparte contigo (su posición y la tuya en ese TOP 5) y «Analizar reseñas», que abre Reseñas con esa app.
- **Fichas vigiladas**: la consulta diaria lee la ficha de cada app vigilada y guarda una copia cuando cambia el título, la descripción corta, la descripción, la versión, el precio, la categoría, el icono o las capturas. «Cambios en fichas vigiladas» los muestra como línea de tiempo bajo la tabla, con las palabras añadidas y quitadas.

## Cambios y pruebas

**Optimizar › Cambios y pruebas** junta todo lo que ha cambiado en la ficha y lo que provocó en las posiciones:

- **Línea de tiempo.** Una línea vertical por meses, de lo más reciente a lo más antiguo, con los cambios de los últimos 180 días. Cada entrada lleva su tipo: los detectados (Ficha, Versión, Icono, Capturas y Publicación, con un punto azul) y los manuales (campañas, prensa…, con un punto gris). Al lado va su impacto agregado a 14 días, «12 keywords afectadas · posición media 23 → 18» con un `DeltaBadge` (▲5), más las que entran o salen de los resultados. «Ver las keywords afectadas» despliega la tabla por keyword. El tipo y el agrupado por meses salen de `lib/timeline.ts` (`timelineKind`, `groupByMonth`, `impactLine`), y el impacto, de `aggregateImpact`.
- **«Añadir cambio»** (la acción principal) abre un diálogo con la fecha y el texto. Borrar una entrada pide confirmación en otro diálogo.
- **Experimentos** en un tablero de tres columnas: Planeado, En marcha y Terminado. Cada tarjeta enseña nombre, fechas, métrica y lo aprendido, y se edita en un panel lateral. «Nuevo experimento» abre el mismo panel vacío.

De dónde sale cada cosa:

- **Anotaciones automáticas.** La consulta diaria lee también la ficha de cada app seguida (lo mismo hace «Actualizar ficha») y la guarda en `app_snapshots` solo cuando cambia algo: título, descripción corta, descripción, versión, precio, categoría, icono o capturas (igual que con los competidores, `lib/listing-diff.ts`). Cada cambio crea una anotación de origen «Automática» con un texto corto («Ficha: título y descripción cambiaron (v3.0)») y el detalle de las palabras añadidas y quitadas. La primera lectura solo guarda la ficha de partida, sin anotación. Si la consulta diaria se acerca a su límite de 300 s, deja las fichas que falten para el día siguiente.
- **Publicaciones.** Al enviar un borrador a Google Play o guardarlo en App Store Connect desde Rankeo, se crea una anotación de origen «Publicación» ese mismo día. Cuando la tienda muestre el cambio, la consulta diaria no repite la anotación de los textos publicados desde Rankeo en los últimos 14 días (mismo idioma); sí anota lo demás que cambie, como la versión o el icono.
- **Impacto por keyword.** Para cada anotación se compara la posición media de los 14 días anteriores con la de los 14 posteriores (el día del cambio no cuenta) en las keywords afectadas: las que contienen una palabra añadida o quitada, sin distinguir acentos. Los días en que la app no salía entre los resultados no entran en la media, porque no sabemos en qué puesto estaba; se cuentan aparte, igual que los días sin consulta, para que se vea en cuántos datos se apoya cada media. Si antes no salía nunca y después sí, se marca «Entra en resultados» (y al revés, «Sale»). Para las anotaciones sin palabras (manuales, icono, versión) se muestran las 10 keywords que más se movieron. Es una correlación: la competencia y la tienda también mueven las posiciones.
- **Experimentos de ficha.** Una plantilla para planificar una prueba A/B (nombre, hipótesis, variante, métrica, fechas y estado) y apuntar después el resultado y lo aprendido (tabla `experiments`). La prueba se crea y se sigue en Play Console (Experimentos de ficha de Play Store) o en App Store Connect (Prueba de la página de producto); Rankeo no lee esos resultados.

La anotación sigue apareciendo en el gráfico de cada keyword, ahora con su origen. Migración 0017 (`annotations.source`, por defecto `manual`, y `annotations.detail`; tablas `app_snapshots` y `experiments`).

## Reseñas

La pantalla **Reseñas** tiene a la izquierda la columna de **fuentes**: tu app arriba, después los competidores vigilados y las apps que ya analizaste, cada una con su valoración y la fecha del último análisis, y debajo las apps del TOP 5 aún sin analizar. Al elegir una fuente, su análisis se muestra en tarjetas: valoraciones, Resumen, Temas (con su tono y una barra con el porcentaje), **Ideas para tu ficha** (destacadas), Quejas, Peticiones y Palabras de los usuarios. Lee hasta 300 reseñas recientes (App Store: feed RSS de Apple; Google Play: `google-play-scraper`) de tu app, de un competidor que vigiles o de cualquier app que haya salido en el TOP 5 de tus keywords en los últimos 30 días (se comprueba en el servidor con los TOP 5 guardados), y Claude resume:

- los temas más mencionados, con su tono, cuántas reseñas los mencionan y una cita;
- las quejas y las peticiones más repetidas;
- ideas concretas para la ficha;
- las frases con las que los usuarios describen la app, que puedes seguir como keywords (con el origen «Reseñas») y que también llegan a Keywords › Encontrar › Pendientes, donde se pueden descartar.

La distribución de estrellas y la media se calculan con las reseñas leídas, no con IA. Cada análisis se guarda, así que puedes comparar la media entre análisis.

- **País.** El del mercado activo: para leer las reseñas de otro país, añade ese mercado en Ajustes de la app › Mercados. Cada análisis guarda su país (`review_analyses.country`, migración 0014).
- **Reseñas nuevas.** Un punto junto a la fuente avisa de que la tienda tiene reseñas posteriores a la más reciente que leyó el último análisis (`stats.to`). Las reseñas no se guardan: la consulta diaria pide a la tienda solo la reseña más reciente de cada fuente (tu app, las vigiladas y las ya analizadas), una petición por fuente y día y como mucho 80, y guarda su fecha en `review_freshness` (migración 0022, `lib/review-freshness.ts`). Va antes de la relevancia y no empieza ninguna lectura pasados 215 s; lo que falte se lee al día siguiente. La página nunca llama a la tienda para el punto.
- **Sin reseñas.** Si la tienda no devuelve reseñas recientes, no es un error pasajero: se guarda la comprobación (sin llamar a Claude) y la página lo sigue diciendo al recargar, con la fecha y un botón para comprobar de nuevo.
- **Por dónde empezar.** Mientras no hay análisis, la página sugiere las 3 apps con más cuota de visibilidad en tu TOP 5.
- **Oportunidades.** Al analizar un competidor, Claude recibe tu ficha de producto (versión publicada) y devuelve las quejas y peticiones de sus usuarios que tu app ya resuelve, con la función que lo hace y una cita: material para el texto y las capturas de tu ficha. Los análisis anteriores a `rv-3` no las tienen.
- **Ideas para tu ficha (competidor).** Son siempre para tu app, sacadas de las quejas de sus usuarios: por ejemplo, «sus usuarios se quejan de la suscripción → destaca que la tuya es gratis». Nunca son consejos para el competidor, ni proponen pruebas, suscripciones o funciones que tu ficha de producto no tiene. Desde el prompt `rv-4`; los análisis anteriores pueden traer consejos para el competidor hasta que los repitas.
- **Lo que pide la categoría.** Arriba de la pantalla, junta las quejas y peticiones del último análisis de cada competidor en ese país, en tres columnas (las tres primeras de cada una y el resto en «Ver N más»):
  - **«Ya lo resuelves → cuéntalo»:** coincide con una función publicada.
  - **«Lo resuelve la próxima versión»:** coincide con una función de la próxima versión; cuéntalo en la ficha nueva.
  - **«Oportunidades»:** el resto, posibles funciones futuras.
- **Cómo se decide la coincidencia.** Es por palabras, sin IA. Hacen falta al menos 2 raíces significativas en común con el nombre de la función (confianza alta) o 3 con el nombre y el resumen (confianza media). Se ignoran palabras demasiado comunes («medicamento», «función», «app»…). Las coincidencias que propone la IA en el análisis salen como «Según la IA». Conviene revisarlas.

## Estacionalidad y otros países

La pantalla **Tendencias** (antes Estacionalidad) convierte los datos de Google Trends de cada keyword en un mapa de calor por meses (0–100 respecto a su mejor mes, en cinco tramos de un solo tono: tokens `--heat-1…5`, con texto AA en los dos temas) y, arriba, muestra los **Próximos picos** en tarjetas: keyword, mes y «Empieza en N semanas» (o «En temporada ahora»), con los picos de los próximos tres meses (`nextSeasons`, como mucho 6). Los meses de pico van en negrita y subrayados, y las keywords sin datos (poca señal o aún sin descargar) se pliegan tras «Mostrar N sin datos».

- **Preparar.** El botón de cada tarjeta crea una anotación «Preparar temporada: <keyword>» fechada tres semanas antes de que empiece el pico (o hoy, si ese día ya ha pasado) y abre la Ficha de la tienda con el enfoque estacional en `?focus=`, que rellena el campo «Para la IA» de «Optimizar con IA» (sin la clave de Anthropic, la ficha lo muestra en una nota). **No crea un borrador**: hay un borrador por app, idioma y país, y uno nuevo pisaría el principal; los borradores con nombre quedan para más adelante. Todo sale de `lib/seasonality.ts`, también el «Pico de interés en …» de la página de cada keyword. Para no anunciar temporadas que no existen:

- **Señal mínima.** Una serie con más de la mitad de las semanas a 0, o con interés en menos de 6 meses, no tiene datos suficientes: va con las filas plegadas «sin datos», en lugar de un mapa de calor engañoso (una semana a 100 entre 51 ceros pintaría un pico enorme).
- **Pico sostenido.** Un mes es pico si su media supera en un 25 % la media del año **y** tiene al menos 3 semanas por encima de ese umbral. Además, tiene que destacar sobre el ruido semanal: su media debe superar la del año en al menos 3 errores estándar (la desviación de cada semana respecto a la media de su mes, dividida entre la raíz del número de semanas del mes). Una semana viral no es una temporada, y una serie plana con mucho ruido tampoco.
- **Mes en curso.** El último mes descargado aún no ha terminado, así que no cuenta; si hay datos del mismo mes del año anterior, se usan esos, y si no, la casilla sale vacía.
- **Popularidad mínima.** No se anuncia ningún pico si la popularidad en la tienda es menor de 10 (o aún no se ha medido): que la gente lo busque en Google no significa que lo busque en la tienda. Los «Próximos picos» solo incluyen además keywords relevantes.
- **Aviso en Novedades.** La consulta diaria crea un aviso «entra en temporada alta» entre 21 y 27 días antes del primer día del pico (una vez por keyword y pico, así que un segundo pico de la misma keyword también se avisa; tipo `seasonal_peak`, se puede desactivar en las preferencias de avisos). Respeta la relevancia mínima de esas preferencias y no avisa de palabras vacías ni de búsquedas donde la gente quiere otro tipo de app.

En **Ajustes de la app › Mercados**, «Añadir mercado» sigue la misma app en otra tienda nacional (mismo id) y, si quieres, copia las keywords de uno de sus mercados. Cada país es un mercado del mismo producto (ver [Productos y mercados](#productos-y-mercados)), con sus posiciones y su histórico.

## Creativos: screenshots e icono

La pestaña **Creativos** monta los recursos gráficos de la ficha en el navegador (canvas), sin servicios externos.

**El editor de screenshots** (fase 32) se ordena como una herramienta de diseño:

- **Barra superior:** dispositivo y tamaño, «Vista del set completo» (todas las pantallas en fila, como en la tienda), «Descargar ZIP», «⋯» (PNG de la pantalla actual) y «Guardar», que es la acción principal.
- **Izquierda (200 px):** las pantallas en miniatura y en vertical, y «Añadir pantalla». Se reordenan arrastrándolas, con los botones ↑ y ↓ o con Alt+↑/↓ sobre la miniatura (las flechas solas cambian de pantalla). Cada movimiento se anuncia en la línea de estado.
- **Centro:** el lienzo grande de la pantalla elegida, con zoom del 50 al 200 % y «Ajustar».
- **Derecha (320 px):** el inspector, con secciones plegables:
  - **Texto**: titular, subtítulo, posición, keyword y «Textos con IA»;
  - **Captura**: subir, modo y recorte;
  - **Dispositivo**;
  - **Estilo**: plantilla, combinaciones, «Colores de la app», colores del texto y tipografía;
  - **Fondo**: liso, degradado o IA.
- **Plantillas en un diálogo** con su miniatura. Si tus colores no son los de la plantilla actual, elegir otra pregunta antes: «Mantener mis colores» aplica solo la composición, y «Usar los de la plantilla» los sustituye. El fondo con IA se conserva siempre, y el aviso de después ofrece «Deshacer» (H23). La lógica está en `lib/assets/studio-edits.ts` (`customLook`, `templateWouldOverwrite`, `applyTemplateWith` y `reorder`).
- **Ideas de fondo de Claude**, aparte y con otro aspecto: cada idea es un prompt con su etiqueta «Prompt» y por qué encaja. Elegirla solo rellena el prompt; nada cambia hasta «Generar fondo».
- **Móvil:** por debajo de 1024 px aparece «Mejor en un ordenador», pero se puede usar: las zonas se apilan y las miniaturas pasan a una fila con scroll propio.
- El código está en `components/screenshot-studio/`. El estado y las ediciones van en `use-studio`, el redibujado de los lienzos en `use-previews`, la subida en `use-upload`, la IA en `use-ai` y el guardado y la exportación en `use-export`. Hay un archivo por zona y por sección del inspector.

Lo que puede hacer cada herramienta:

- **Screenshots**: una pantalla por captura con marco de iPhone, iPad o Android (o sin marco), fondo liso o degradado, titular y subtítulo. Puedes subir tus capturas (se reducen a 1800 px de alto para que el conjunto quepa en un guardado) o usar las que ya tienes publicadas en la tienda, que pasan por `/api/assets/image` para que el canvas pueda exportarlas. Los tamaños son los que aceptan las tiendas: iPhone 6,9" (1320×2868), 6,7" (1290×2796), 6,5" (1284×2778), iPad 13" (2064×2752) y Android 1080×1920, 1440×2560 y tablet 1440×2560. En el titular, las palabras entre `*asteriscos*` se pintan con el color de acento. Se descargan como PNG o todas en un ZIP. Hay una galería de 12 **plantillas** (Clásico, Inclinado, Dúo, Panorámica, Tarjeta, Resplandor, Minimal, Ola, Rayas, Puntos, Gran titular y Flotante) que aplican de golpe fondo, adorno, pose del móvil y texto al conjunto; cada una se puede afinar después con la inclinación y el desplazamiento del móvil, la alternancia de lado por pantalla, el segundo móvil con la siguiente pantalla detrás, el adorno de fondo y el tamaño del texto. Los adornos panorámicos (círculos) continúan de una pantalla a la siguiente en la galería de la tienda. Los diseños guardados antes de las plantillas siguen cargando con los valores por defecto. Con un proveedor de imágenes configurado, **Fondo con IA** genera un fondo vertical (9:16) según la temática de la app (Claude propone tres prompts a partir de la ficha, las keywords y el tema actual) que se dibuja debajo del adorno y del móvil en todas las pantallas, con un velo regulable del color de fondo para que el texto siga legible; los fondos se guardan en `generated_images` con `kind = 'background'`. Las capturas publicadas en la tienda suelen ser montajes ya terminados (con su texto y su móvil), así que cada pantalla tiene la casilla «usarla tal cual», que la dibuja a sangre sin marco ni texto.
  - **Estilo → Colores de la app** aplica de un clic los colores del icono a la plantilla: fondo, degradado, titular, subtítulo y acento. El titular y el subtítulo se ajustan para tener contraste AA (4,5:1) con el fondo, y el acento 3:1.
  - La casilla «Usar los colores de la app en el fondo con IA» solo afecta al fondo generado.
- **Subir capturas actuales**: «Subir capturas» acepta varios archivos a la vez, y también puedes arrastrar archivos o una carpeta entera sobre el estudio (las carpetas se leen en Chrome, Edge, Firefox y Safari). Se ordenan por nombre en orden natural («2» antes que «10») y se colocan en pantallas consecutivas desde la seleccionada, añadiendo pantallas hasta el máximo de 10. Cada captura guarda en el diseño su fecha (la de modificación del archivo) y la versión publicada al subirla; si es anterior a la última actualización de la ficha o se subió con otra versión, el estudio avisa. Las capturas de la tienda no tienen fecha y no se avisan.
- **Capturas desde Android (opcional)**: `node scripts/push-screenshots.mjs --count 5 --out capturas` usa `adb exec-out screencap -p` para guardar una captura del móvil o del emulador cada vez que pulsas Enter (`01.png`, `02.png`…). Solo escribe archivos en tu equipo; luego arrastras la carpeta al estudio. Necesita `adb` (Android platform-tools) en el PATH; con varios dispositivos, `--serial`.
- **Textos con IA**: Claude escribe un titular (2–5 palabras) y un subtítulo por pantalla a partir de la ficha de producto y de las keywords seguidas **relevantes** (las mismas que usa el optimizador: sin ruido ni búsquedas de otro tipo de app), ordenadas por oportunidad, y elige para cada pantalla la keyword que mejor la describe. Por defecto le envía también una imagen pequeña de cada pantalla (JPEG de 768 px, el recorte si lo hay) para que lea lo que muestra y no titule una pantalla con una función que no aparece; la casilla lo desactiva (la petición cuesta algo menos). El campo «Keyword de esta pantalla» sugiere tus keywords relevantes. Las keywords que no se siguen se descartan. Versión de prompt `crt-3`; los demás prompts de creativos (icono, logo, fondos) también reciben solo las relevantes.
- **Icono**: un diseño vectorial (fondo liso o degradado, letra o símbolo, placa opcional, brillo y sombra) que se previsualiza con la máscara de App Store y la circular de Google Play y a 64, 40 y 29 px, junto al icono actual. Si aún no hay un diseño guardado, arranca con los colores del icono actual (se leen en el navegador con `paletteFromImages`; si no se puede, con el lavanda por defecto), y el botón «Usar los colores del icono actual» los vuelve a aplicar. Avisa si el símbolo contrasta poco o casi toca el borde. Se exporta a 1024×1024 (App Store) y 512×512 (Google Play). Claude propone cuatro conceptos en ese mismo sistema.

- **Logo con IA**: Claude no dibuja, así que esta pantalla llama a un proveedor de imágenes con un prompt (que Claude puede escribir a partir de la ficha y las keywords, en tres direcciones visuales). Las imágenes se guardan en la tabla `generated_images` en base64 y se sirven por `/api/assets/generated/[id]`; se descargan reencodadas a PNG de 1024 (App Store) y 512 (Google Play). Proveedores: OpenAI (`OPENAI_API_KEY`, modelo `gpt-image-2.5-flare` por defecto, o `gpt-image-2.5-sunburst` para más calidad; `gpt-image-1` se retiró el 23 de octubre de 2026, calidad `OPENAI_IMAGE_QUALITY`) o Google (`GEMINI_API_KEY`, `gemini-2.5-flash-image` por defecto, o un modelo `imagen-*`). Con una clave basta; `IMAGE_PROVIDER` elige cuando hay las dos. Cada imagen cuesta dinero en la cuenta del proveedor.

- **Vídeo**: anima el conjunto de screenshots guardado (los textos entran con un fundido, el móvil hace un zoom lento, transiciones de fundido o deslizamiento) y lo codifica en el navegador con WebCodecs (H.264 High 4.0, 10 Mb/s) y [`mp4-muxer`](https://github.com/Vanilagy/mp4-muxer) en 886×1920 (app preview de App Store, que exige entre 15 y 30 s y avisa si no se cumple), 1080×1920 (YouTube/Shorts, que es lo que Google Play enlaza) o 1080×1080. **Sonido opcional**: subes una pista (MP3, M4A, WAV u OGG; Rankeo no genera música), se decodifica con `AudioContext.decodeAudioData` a 48 kHz, se corta a la duración del vídeo con un fundido de salida de 1,5 s (si es más corta, suena una vez y el final queda en silencio) y se codifica con `AudioEncoder` en AAC-LC (`mp4a.40.2`), que es lo que pide App Store Connect, o en Opus si el navegador no tiene AAC; el resultado dice si lleva sonido. Si el navegador no tiene WebCodecs con H.264 (Firefox, Safari antiguo), graba un WebM a tiempo real con `MediaRecorder`, con el audio sonando en la grabación. Los ajustes del vídeo no se guardan.

El diseño de cada tipo se guarda en la tabla `asset_designs` (uno por app y tipo); las capturas subidas viajan en base64, por lo que el límite del cuerpo de las server actions está en 4 MB (`next.config.ts`).

## Novedades y resumen semanal

Cada consulta de posiciones (la diaria y el botón «Actualizar posiciones») compara cada keyword con su consulta anterior y crea avisos, que se ven en **Actividad** (`/actividad`, antes Novedades):

- entra o sale del TOP 10;
- sube o baja 5 posiciones o más dentro de las 50 primeras;
- deja de aparecer en los resultados, solo si la tienda devolvió más resultados que tu posición anterior (si estabas el #35 y Google Play solo devuelve 30, no sabemos si has bajado y no se avisa);
- cambia el nº 1, solo donde compites: tu app está entre las 30 primeras (antes o ahora), el nº 1 nuevo o el anterior es un competidor vigilado, o ganas o pierdes tú el nº 1;
- una ficha vigilada cambia;
- un pico de temporada de una keyword relevante empieza en unas 3 semanas (ver Estacionalidad).

Para que no se llene de ruido:

- Las keywords con relevancia por debajo del mínimo (3 por defecto) o cuya búsqueda busca otro tipo de app solo avisan cuando entras o sales del TOP 10 o ganas o pierdes el nº 1. Las que aún no tienen relevancia cuentan como relevantes.
- Los cambios de nº 1 de otras apps de un mismo día van juntos en un único aviso, «7 keywords cambiaron de nº 1», con el detalle de cada una. Si vuelves a consultar posiciones ese día, el aviso se actualiza en lugar de repetirse.
- Dentro de cada día aparece primero lo que le pasa a tu app y después los cambios de nº 1 y de fichas de competidores.
- En **Qué avisos quieres recibir** (el engranaje de Actividad) eliges, por app, qué tipos de aviso quieres y la relevancia mínima (tabla `alert_prefs`). Se aplica desde la siguiente consulta.

Actividad filtra por periodo (hoy, 7 o 30 días), por app y por tipo (posición, competidor o temporada), y arriba muestra el resumen de la semana de cada app en una tabla compacta. La barra lateral muestra cuántos avisos quedan sin leer, y la entrada Resumen de cada app los de su mercado.

**Resumen semanal** (`/actividad?vista=semana`, antes `/resumen`) compara la última posición de cada keyword con la de hace una semana: cuántas suben y bajan, cuántas están en el TOP 10, la cuota de visibilidad y las que más se mueven. Si la app lleva menos de una semana, compara con la consulta más antigua y lo dice («frente al 26 oct»). Distingue «sin datos» de «fuera de los N»: pasar de «> 30» a #18 se cuenta como «entra en los primeros 30», no como una subida de 183 puestos que no podemos medir, y las keywords sin consulta en la fecha de referencia salen aparte como «nuevas sin comparación». Para recibirlo por email cada lunes:

1. Crea una cuenta gratuita en [Resend](https://resend.com) y una API key.
2. Añade `RESEND_API_KEY` y `ALERT_EMAIL` (tu correo) en Vercel. Sin dominio propio, Resend solo deja enviar al correo de tu cuenta desde `onboarding@resend.dev`; con dominio verificado, define también `EMAIL_FROM`.
3. Opcional: `APP_URL` con la dirección pública de la app para los enlaces del email (en Vercel se detecta sola).

## Integraciones

La pantalla **Integraciones** (`/integraciones`, antes Ajustes) muestra una tarjeta por integración con su estado: base de datos, contraseña de la app, consulta diaria, Claude (Anthropic), imágenes generativas, email (Resend), Google Play Console y App Store Connect. Para cada una dice si está configurada, sin configurar o mal configurada (con el motivo, por ejemplo «Falta ALERT_EMAIL» o «no es un JSON válido»), qué permite hacer en Rankeo, qué variables de entorno usa y cuáles están puestas, y si las consolas están en solo lectura o con escritura activada (`GOOGLE_PLAY_ALLOW_WRITE`, `ASC_ALLOW_WRITE`). **Nunca muestra el valor de una variable**, solo si existe: el cálculo (`lib/settings.ts`) es puro, recibe el entorno y no devuelve más que nombres y presencia, y los tests comprueban que ningún secreto aparece en la salida.

Las pruebas son de solo lectura y se muestran en la misma tarjeta:

- **Claude**: lista un modelo con `GET /v1/models`; comprueba que la clave es válida sin generar nada, así que no cuesta dinero.
- **Google Play Console**: solo pide un token de acceso con la cuenta de servicio. Si Google lo da, la clave es buena; que vea tus apps depende de los permisos en Play Console.
- **App Store Connect**: firma el token y lista como mucho una app de la cuenta.
- **Email**: «Enviar email de prueba» manda un correo corto a `ALERT_EMAIL` con Resend.

Las imágenes generativas no tienen prueba porque cada imagen se cobra. Los avisos de «falta tal clave» del resto de pantallas enlazan aquí.

Cada tarjeta muestra «Probar» cuando está conectada y «Cómo conectar» cuando no: un panel con los pasos numerados y los nombres de las variables, con un botón para copiarlos y pegarlos en Vercel (`lib/integration-guides.ts`). Las variables y si están puestas quedan dentro de «Detalles técnicos».

## Inicio

`/` resume todas las apps que sigues. Está en `lib/home.ts` (`getHomeOverview`) y `components/home-overview.tsx`.

- **KPIs del conjunto:** keywords en el TOP 10 y en el TOP 30, visibilidad media y avisos sin leer, con el cambio frente a hace una semana. El cambio solo cuenta las keywords que tenían consulta en las dos fechas, así que una keyword añadida esta semana no parece una subida. Los mercados sin una semana de datos no suman al cambio.
- **Una fila por mercado** (en el móvil, una tarjeta), ordenadas por app y país. Al pulsarla se abre su Resumen. Columnas:
  - el mini-gráfico de tu cuota de visibilidad en los últimos 30 días;
  - el TOP 10 con su cambio y el TOP 30;
  - la **posición media**: la de las 5 keywords relevantes con más oportunidad. Las que están fuera de los resultados no cuentan, porque no sabemos su posición, y lo indica «(3/5)»;
  - la valoración de la ficha;
  - la salud en pocas palabras («2 por atender · 1 mejorable»).
- **Coste:** todos los mercados salen de una sola ronda de 3 consultas (los mercados con sus avisos sin leer, las posiciones de 30 días de las keywords seguidas y las keywords con sus métricas). De cada consulta solo se lee el número de apps del TOP 5, no las apps. La salud de cada fila llega después, por streaming, y no llama a las tiendas: la línea de reseñas, que pregunta a Google Play, solo está en el Resumen. Con `LOG_TIMING=1` el servidor escribe cuánto tarda la ronda.
- **Qué hacer hoy:** de 3 a 5 tareas con la app, el país y un botón (`whatToDoToday` en `lib/today.ts`). Salen de la salud de cada mercado, de los avisos sin leer de los últimos 14 días y de los picos de temporada. Por orden:

  | Tarea | Puntos |
  | --- | --- |
  | Línea de salud que necesita atención / mejorable | 100 / 60, más un desempate: ficha frente a producto, normas, cobertura, reseñas, irrelevantes y capturas |
  | Pierdes el nº 1 / sales del TOP 10 / dejas de aparecer / bajas 5 o más | 90 / 85 / 80 / 70 |
  | Pico en temporada ahora / que empieza en 35 días o menos (más cerca, más puntos) | 75 / 60–70 |
  | Aviso de temporada / ficha vigilada que cambia / nuevo nº 1 de otra app | 65 / 45 / 35 |

  Las subidas no son tareas. Un aviso de temporada y el pico de la misma keyword son una sola tarea, la del pico, que dice cuánto falta. Las capturas y la línea «Ficha frente a tu producto» son de la app, así que la misma tarea sale una vez aunque la sigas en dos países. Hay una tarea por keyword y mercado, y como mucho dos picos por mercado.
- **Sin apps**, la página es un buscador grande que lleva a Añadir app.

## Resumen de la app

`/a/[app]/[país]` es el Resumen del mercado (`components/market-summary.tsx`). La tabla de keywords está en `/a/[app]/[país]/keywords` (Seguimiento). Cada bloque llega por streaming con un esqueleto de su forma, y las keywords y la cuota se leen una vez por petición.

1. **KPIs:** visibilidad (tu cuota del TOP 5, con el cambio en puntos), keywords en el TOP 10 y en el TOP 30 (con su cambio, contado como en Inicio) y la valoración con el número de valoraciones.
2. **Visibilidad a 30, 90 o 180 días** (`?dias=90`), con tu app en `--series-own` (`getShareHistory` en `lib/competitor-queries.ts`). Las anotaciones de Cambios son líneas verticales con una marca. Al pasar el ratón por un día se ven los cambios desde el punto anterior y su impacto a 14 días en una línea: «12 keywords · 23 → 18 ▲» (`aggregateImpact` en `lib/impact.ts`, la media de las posiciones medias de las keywords medidas antes y después; las que entran o salen de los resultados se cuentan aparte). Debajo, la lista de esos cambios, que también lee un lector de pantalla.
3. **Próximos pasos:** las líneas de la salud ASO como tareas, primero las que necesitan atención y después las mejorables, cada una con su botón. Las que están bien se pliegan en «4 en orden».
4. **Movimientos de la semana:** «Suben» y «Bajan», con la posición anterior → la actual, y «Nuevos nº 1 donde compites», que son los avisos de cambio de nº 1 de la semana.
5. **Competencia en una línea:** «MyTherapy 33 % · Medisafe 15 % · Tú 3 %» como barra apilada, con los mismos colores que en Competidores y un enlace a esa página.

## Panel de salud

El Resumen de cada app convierte la **Salud ASO** en «Próximos pasos». Inicio la resume por fila. Cada señal tiene un estado (bien, mejorable, necesita atención o sin datos) y un enlace a la pantalla donde se arregla. La decisión está en `lib/health.ts` (puro y con tests). Los datos se cargan en `lib/health-queries.ts` (`loadHealth`, y `loadHealthDetail` con todos los picos que vienen para Inicio) en una sola ronda de consultas en paralelo, reutilizando las keywords ya leídas. Todo llega por streaming (Suspense).

| Señal | De dónde sale | Umbrales |
| --- | --- | --- |
| Cobertura de keywords | Cobertura ponderada (la del candado de calidad) del borrador principal o, sin borrador, de la ficha publicada, con las keywords relevantes | Bien desde 60/100; mejorable desde 35 |
| Keywords irrelevantes | Las del filtro «Probablemente irrelevantes» y el máximo recomendado de 150 | Mejorable con alguna; necesita atención con 20 o más o por encima de 150 keywords |
| Ficha frente a tu producto | Última versión de la ficha de producto frente a la versión (o la fecha) de la tienda, y funciones marcadas para la próxima versión | Necesita atención si tu producto va por una versión más nueva: «tu ficha describe una versión anterior» |
| Capturas | Capturas subidas en Creativos más antiguas que la ficha publicada o de otra versión (solo las fechas: el diseño no se descarga entero) | Mejorable con alguna; necesita atención si lo están todas. Las de la tienda no tienen fecha y no cuentan |
| Normas de las tiendas | Comprobador de normas sobre el borrador principal o la ficha publicada, con las marcas detectadas | Necesita atención con errores; mejorable con avisos |
| Reseñas sin responder | Reseñas de la última semana de Google Play Console, solo si está conectada; se piden aparte para no frenar la portada | Mejorable con alguna; necesita atención con 10 o más. En App Store y sin Play Console sale «sin datos» con un enlace a Ajustes |
| Próximo pico estacional | El pico más cercano de las keywords relevantes con popularidad suficiente (Estacionalidad) | Mejorable si está en temporada o empieza en 35 días o menos |

## Productos y mercados

Una app se sigue en uno o varios países. Cada país es un **mercado**, con sus keywords, posiciones, reseñas, competidores y borradores de ficha; la app en conjunto es un **producto**, uno por tienda e id de la tienda.

- **En la base de datos** (`db/schema.ts`): la tabla `products` (`store`, `store_id`, `slug` único, título e icono del primer mercado) y la tabla `apps`, que **es la de mercados**. No se ha renombrado, para no cambiar ids ni claves ajenas: cada fila de `apps` es la app en un país y apunta a su producto con `product_id`, obligatorio y con borrado en cascada. En el código, `App` y `Market` son el mismo tipo.
- **La migración `0019_products`** crea un producto por cada par (tienda, id) que ya existía y enlaza todas las filas de `apps`, sin cambiar ningún id: las apps que se seguían en dos países (por ejemplo, Recordatorio en España y en Estados Unidos) quedan en un mismo producto con dos mercados.
- **El slug** sale del final del id de Google Play (`com.moyalogames.recordatorio` → `recordatorio`) o, si es un número (App Store), del título. Va en minúsculas, sin tildes, con guiones y con 40 caracteres como máximo. Si ya existe, se le añade `-2`, `-3`… Se guarda y no cambia aunque cambie el título. Está en `lib/market-path.ts` (`slugify`, `productSlugBase`, `uniqueSlug`), y la migración aplica la misma regla en SQL.
- **Seguir una app** (Añadir app, `/apps/nueva`) crea el producto la primera vez. **Añadir mercado** (Ajustes de la app › Mercados) añade otro país al mismo producto.
- **Datos de la app en conjunto:** la ficha de producto (`product_facts`, `product_features`, `product_releases`), las marcas excluidas (`brand_exceptions`) y los creativos (`asset_designs`, `generated_images`) cuelgan de `product_id`, así que son los mismos en todos los países. Las consultas y las acciones reciben el id de cualquier mercado y lo traducen con `marketProductId()` (`lib/products.ts`).
- **La migración `0020_product_owned_data`** movió esas tablas de `app_id` a `product_id` y fusionó lo que cada país tenía guardado. Se queda lo del mercado principal (el `apps.id` más bajo con datos) y de los demás solo se toma lo que falta:
  - en la ficha, los textos vacíos. Las listas (diferenciadores, restricciones, idiomas) se unen: primero las del principal y después las de los otros países que no estuvieran ya, sin distinguir mayúsculas, tildes ni espacios;
  - las funciones con un nombre que no estuviera ya (con la misma comparación), al final de la lista. Las que solo se parecen («Historial de tomas» y «Historial de tomas por días») se quedan las dos;
  - las versiones que no estuvieran. Si una versión estaba en dos países, se queda la del principal: su fecha vacía se rellena y las notas distintas se añaden debajo de una línea `---`;
  - todas las marcas excluidas;
  - el diseño de cada tipo que el principal no tuviera. Si los dos tenían uno, el del otro país se copia a la tabla `asset_designs_merged_0020`, que no está en el esquema, y la migración avisa de sus ids con un NOTICE;
  - todas las imágenes generadas.
- **La columna `app_id` antigua** sigue en esas tablas, opcional y sin usarse. Ya no se escribe y pasa a `NULL` si se deja de seguir su país. **Ojo al desplegar:** el código anterior a la fase 26 solo puede *leer* con la 0019 y la 0020 aplicadas, y falla al guardar (seguir apps, ficha de producto, creativos). Hay que aplicar las migraciones y desplegar a continuación, sin usar la app entre medias. Una migración de limpieza posterior la quitará, junto con `asset_designs_merged_0020` cuando ya no haga falta.
- **Dejar de seguir un país** borra solo ese mercado: sus keywords, posiciones, reseñas, competidores, borradores y publicaciones. Los datos del producto se conservan mientras sigas la app en otro país, y la confirmación lo dice. Al dejar de seguir el último país se borra el producto y, en cascada, su ficha, sus marcas excluidas y sus creativos.
- **Los borradores de ficha y las publicaciones** (`listing_drafts`, `publications`) se quedan en el mercado (`app_id`). Cada uno se escribe y se mide con las keywords de su país. Pero la consola de la tienda tiene una sola ficha por app e idioma. Por eso el editor avisa cuando otro país del mismo producto tiene un borrador del mismo idioma y la misma ficha (`sharedListingNotice` en `lib/listing-drafts.ts`): si publicas desde los dos, la última publicación sustituye a la anterior.

### URLs

| Página | URL |
| --- | --- |
| Inicio (todas las apps) | `/` |
| Actividad (novedades) y resumen semanal | `/actividad` y `/actividad?vista=semana` (filtros `periodo`, `app`, `tipo`) |
| Integraciones | `/integraciones` |
| Añadir app (buscar en las tiendas) | `/apps/nueva` |
| Resumen del mercado | `/a/[app]/[país]` (`?dias=90` o `180` para el gráfico) |
| Keywords › Seguimiento, su panel y una keyword | `/a/[app]/[país]/keywords` (`?k=[id]` abre el panel), `/a/[app]/[país]/keywords/[id]` |
| Keywords › Encontrar | `/a/[app]/[país]/encontrar` (`?fuente=pendientes`, `autocompletado`, `ia` o `top10`; `seed`: semilla o tema) |
| Mercado › Competidores, Reseñas, Tendencias | `/a/[app]/[país]/competidores`, `/resenas`, `/tendencias` |
| Optimizar › Ficha de la tienda y su publicación | `/a/[app]/[país]/ficha`, `/a/[app]/[país]/ficha/publicar` |
| Optimizar › Creativos (iguales en todos los países) | `/a/[app]/creativos`, `/creativos/icono`, `/creativos/logo`, `/creativos/video` |
| Optimizar › Cambios y pruebas | `/a/[app]/[país]/cambios` |
| Ajustes de la app | `/a/[app]/ajustes` (= `/ajustes/producto`), `/ajustes/mercados`, `/ajustes/marcas`, `/ajustes/play`, `/ajustes/peligro` |

`[app]` es el slug y `[país]` el código del país en minúsculas (`es`, `us`). Los enlaces se construyen siempre con `marketPath()` y `productPath()` (`lib/market-path.ts`), y las server actions revalidan las rutas nuevas con `revalidateMarket()` y `revalidateProduct()` (`lib/revalidate.ts`).

### Navegación

- **Fuera de una app** (`app/(global)/layout.tsx`): barra lateral con el selector de app (búsqueda con iconos, agrupado por app con sus mercados), Inicio, Actividad (con los avisos sin leer) e Integraciones, y al pie el tema y la versión.
- **Dentro de una app** (`app/a/[app]/layout.tsx`): la barra lateral pasa a ser la de la app, con «← Todas las apps», Resumen, los grupos KEYWORDS, MERCADO y OPTIMIZAR y Ajustes de la app al pie. La configuración está en `lib/app-nav.ts` (`NAV_GROUPS`). Los contadores (candidatas pendientes de Encontrar y avisos sin leer del mercado) y la fecha de la última consulta salen de **una sola consulta** por producto (`marketCounters` en `lib/nav-queries.ts`) y llegan por streaming.
- **Cabecera fija de 56 px:** icono y nombre de la app, tienda, selector de mercado (cambiar de mercado mantiene la subpágina, `switchMarketPath()`), «Posiciones del…», «Actualizar posiciones» (secundario, con su icono: la acción principal es la de cada pantalla) y el menú «⋯» (Actualizar ficha, Ver en la tienda, Ajustes de la app).
- **El mercado en las páginas de la app en conjunto** (Creativos, Ajustes): los enlaces de la barra lateral llevan `?m=[país]`, y el último mercado visto se guarda en la cookie `rk-m-[app]`. Así «Seguimiento» vuelve al país del que venías, y Marcas y Datos de Play Console usan ese país (`loadContextMarket()`). Sin ninguno de los dos, el mercado principal.
- **⌘K / Ctrl+K** (o «Buscar» en la cabecera) abre la paleta: apps y mercados, secciones de la app, keywords del mercado activo (búsqueda en el servidor, como mucho 8) y las acciones «Actualizar posiciones», «Optimizar ficha» y «Generar ideas».
- **Tamaños:** por debajo de 640 px la barra lateral pasa a una barra inferior (Inicio, Actividad, Apps y Más) y las secciones de la app se abren desde la cabecera; de 640 a 1024 px la barra lateral muestra solo iconos.
- **Scroll:** desde 640 px hace scroll el contenido (`<main>`) y la barra lateral y la cabecera quedan quietas. En el móvil hace scroll la página entera, con la cabecera de la app pegada arriba, para que el navegador pueda recoger su barra de direcciones.

### Esperas y operaciones largas

- **Carga:** cada pantalla tiene su `loading.tsx` con un esqueleto de su forma (tabla, editor, línea de tiempo…), en `components/page-skeleton.tsx`.
- **IA que tarda** (ideas, «Optimizar con IA», «Adaptar a…», análisis de reseñas, notas de la versión, «Recalcular con IA» e importar el CHANGELOG): la pantalla muestra los pasos («Leyendo hasta 300 reseñas… Analizando temas… Escribiendo el informe…») y puedes seguir navegando. Si te vas, un aviso abajo enseña el paso y, al terminar, «… listo» con **Ver resultado**, que te devuelve a la pantalla con el resultado. Los pasos avanzan por tiempo, porque el servidor no informa del progreso; la acción es la misma de siempre. El resultado se guarda en memoria del navegador (`lib/long-operations.ts`): se pierde al recargar la página, como antes.
- **Dejar de seguir** un país solo está en Ajustes de la app › Zona de peligro, en un diálogo que pide escribir el nombre de la app.

### Redirecciones

Las URLs antiguas `/apps/[id]/…`, que siguen en emails y marcadores, responden con un **308** a la nueva, conservando la query: `/apps/1/metadata` → `/a/recordatorio/es/ficha`, `/apps/4` → `/a/recordatorio/us/keywords`, `/apps/1/producto` → `/a/recordatorio/ajustes/producto`, `/apps/1/creativos/logo` → `/a/recordatorio/creativos/logo`. Están en `app/apps/[id]/[[...rest]]/route.ts`, que busca el id en la base de datos, y el mapa está en `legacyAppRedirect()`. Es un route handler y no una página porque una página se serviría en streaming detrás de `app/loading.tsx`, y la redirección llegaría como una etiqueta `<meta>` con estado 200. Un id que no es un número (como `/apps/nueva`, que además es una ruta estática), uno que no existe o una subpágina desconocida dan 404.

Las tres páginas de Encontrar de la fase 27 (`/a/[app]/[país]/descubrir`, `/ideas`, `/top10`) responden con un **308** a `encontrar?fuente=autocompletado`, `ia` o `top10`, conservando la query (`seed`, `kw`): `FIND_REDIRECTS` en `lib/redirects.ts`. Las antiguas `/apps/[id]/descubrir…` van directamente a su destino final, sin pasar por ellas (`findPath()` en `lib/market-path.ts`).

Las páginas globales antiguas también responden con un **308**, conservando la query: `/novedades` → `/actividad`, `/resumen` → `/actividad?vista=semana`, `/ajustes` → `/integraciones` y `/buscar` → `/apps/nueva`. El mapa está en `lib/redirects.ts` y lo aplica `next.config.ts` (`redirects()`). `/apps/nueva` es una ruta estática y gana a `app/apps/[id]/[[...rest]]/route.ts`.

## Desarrollo: interfaz y pruebas e2e

### Componentes y diseño
- Las reglas visuales están en `DESIGN.md` y los tokens en `app/globals.css`. Los componentes base viven en `components/ui/`.
- **`/dev/ui`** muestra todos los componentes en claro y en oscuro, uno al lado del otro. Solo existe con `npm run dev`: en producción responde 404, salvo que el servidor se arranque con `ENABLE_DEV_UI=1` (lo hace la prueba e2e).
- El tema claro es el predeterminado. El oscuro se elige en la barra lateral; sin elección guardada se sigue la preferencia del sistema.

### Pruebas e2e (Playwright y axe)
- Necesitan una **base de datos de prueba**: una rama de Neon creada a partir de producción. **Nunca la de producción**: las pruebas pulsan botones y pueden cambiar datos.
- Se le pasa con `E2E_DATABASE_URL` o con `E2E_DATABASE_URL_FILE` (un archivo con la URL). Si coincide con el `DATABASE_URL` de `.env.local`, la prueba se niega a arrancar.
- La primera vez: `npx playwright install chromium`.
- `E2E_DATABASE_URL_FILE=ruta/al/archivo npm run test:e2e` compila la app y la arranca con `next start -p 3200` (otro puerto con `E2E_PORT`), sin contraseña y sin claves de IA, correo ni consolas de las tiendas. Para repetir sin compilar: `npx playwright test`.
- **`e2e/routes.spec.ts`**: todas las rutas, para todas las apps de la base de datos, a 390 y 1440 px. Comprueba que responden 200 y que no hay errores en la consola. Falla si el documento o `<main>` hacen scroll horizontal a 390 o 1440 px, en cualquier ruta (desde la fase 32 no hay excepciones). El desbordamiento se deja también en `test-results/overflow.md`.
- **`e2e/creativos.spec.ts`**: el editor de screenshots (fase 32). La prueba de humo elige una pantalla, cambia el titular y descarga el ZIP (pasó igual antes y después de dividir el estudio en módulos). También comprueba que el inspector se pliega, que las miniaturas se reordenan con los botones y con Alt+flechas, que una plantilla pregunta antes de pisar tus colores («Mantener mis colores», «Usar los de la plantilla» y «Deshacer»), el aviso del móvil sin scroll horizontal y axe AA en los dos temas. No guarda nada.
- **`e2e/cambios.spec.ts`**: Cambios y pruebas. Añade un cambio manual desde el diálogo, comprueba su entrada en la línea de tiempo con el impacto («keywords medidas · posición media…» o «Sin datos suficientes») y lo borra. También comprueba las tres columnas de experimentos y el panel lateral (sin guardar) y axe AA en los dos temas. Si algo falla a medias, borra al final sus anotaciones `e2e cambio…`.
- **`e2e/navigation.spec.ts`**: la navegación de la fase 27. Redirecciones 308 de las páginas globales, sin pestañas horizontales, «Dejar de seguir» solo en la zona de peligro (abre el diálogo, nunca lo envía), cambio de mercado con la misma subpágina, ⌘K y la barra inferior del móvil.
- **`e2e/summary.spec.ts`**: Inicio y Resumen (fase 28). Comprueba los KPIs, una fila por mercado que abre su Resumen, «Qué hacer hoy», las tarjetas en el móvil, el gráfico con una marca por anotación (si la base de datos de prueba tiene alguna en 30 días) y el cambio de periodo. También que no hay scroll horizontal a 390 y 1440 px y que el contenido pasa axe AA en los dos temas. Anota el tiempo de Inicio.
- **`e2e/keywords.spec.ts`**: la fase 29. Seguimiento con 25 botones visibles como mucho sin selección (antes, 106) y la barra de la selección; `?k=` abre el panel de 480 px y cerrarlo lo quita de la URL; a 390 px tarjetas, filtros en una hoja inferior y sin scroll horizontal; en Encontrar, lo descartado no vuelve tras recargar (inserta y borra su propia candidata); redirecciones 308 de las páginas antiguas de Encontrar.
- **`e2e/axe.spec.ts`**: `/dev/ui` en los dos temas debe pasar WCAG 2.1 AA, y **todas las rutas** del primer mercado de la base de datos, en los dos temas, sin fallos graves ni críticos (los leves se anotan). El informe queda en `test-results/axe-routes-light.json` y `axe-routes-dark.json`.
- **`e2e/polish.spec.ts`**: la fase 33. En todas las rutas, a 390 y 1440 px, como mucho **un botón principal** visible (`.btn-primary`), y a 1440 px ningún párrafo de más de 2 líneas en `<main>` fuera de un `HelpTip`, un `EmptyState` o un texto marcado `data-content` (reseñas, fichas, salida de la IA). El detalle queda en `test-results/polish.json`. También abre una función de Ajustes › Producto en su panel lateral (sin guardar).
- La lista de rutas que recorren `routes`, `polish` y `axe` está en `e2e/route-list.ts`.
- **`e2e/ficha.spec.ts`**: la ficha de la tienda de «recordatorio» en España. La vista previa enseña icono, título, descripción corta y 3 capturas; pulsar una keyword de Cobertura la resalta; Publicada y Comparar; `?focus=` (de Tendencias › «Preparar») rellena el enfoque de «Optimizar con IA»; la propuesta de la IA se acepta campo a campo (con la demo de `/dev/ui`); sin scroll horizontal a 390 y 1440 px, y sin fallos graves de axe en los dos temas. No guarda nada.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (Vitest; el de la migración 0019 ejecuta todas las migraciones en un Postgres en memoria con PGlite) |
| `npm run test:e2e` | Compila y recorre la app con Playwright contra una base de datos de prueba (ver «Desarrollo: interfaz y pruebas e2e») |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint |
| `npm run db:generate` | Genera una migración tras cambiar `db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones |

## Estructura

```
app/            páginas y server actions
components/     UI (components/ui/: componentes base del sistema visual)
db/             esquema Drizzle y migraciones
lib/stores/     adaptadores de App Store y Google Play
lib/            utilidades (países, keywords, formato)
scripts/        utilidades opcionales de línea de comandos (capturas con adb)
tests/          tests de Vitest
e2e/            pruebas de Playwright y axe
```

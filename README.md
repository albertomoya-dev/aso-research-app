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

Cada día a las 05:00 UTC, Vercel Cron llama a `/api/cron/rankings` (configurado en `vercel.json`). Para cada keyword, tienda y país se hace una sola búsqueda (se piden 200 resultados) y se guarda la posición de cada app que la sigue, el TOP 5 y cuántos resultados devolvió la tienda. Si la app no aparece, se guarda «fuera de los N primeros», nunca 0. También puedes lanzarla a mano con «Actualizar posiciones», y las keywords nuevas se consultan nada más añadirlas.

La profundidad real depende de la tienda: App Store devuelve hasta 200 resultados; Google Play suele devolver unos 30, aunque el scraper ya pide más páginas (es un límite de Google, no nuestro). Por eso cada posición «> N» lleva su propio N, el de ese día y esa búsqueda: al pulsarla (o al pasar el ratón o el foco del teclado) se explica «Fuera de los N resultados que devuelve la tienda». El histórico y el gráfico de cada keyword usan el N de cada día, no el de hoy.

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

La pantalla **Editor de ficha** sirve para preparar la próxima versión del texto: cuenta caracteres con los límites de cada tienda (App Store: nombre 30, subtítulo 30, campo de keywords 100; Google Play: título 30, descripción corta 80, descripción 4000), avisa de espacios y palabras repetidas en el campo de keywords y muestra qué keywords seguidas quedan cubiertas. El borrador se guarda en la base de datos, uno por idioma (ver «Fichas por idioma y país»); para publicarlo hay que copiarlo a App Store Connect o Google Play Console.

### Fichas por idioma y país

Cada app tiene un borrador por idioma, guardado en la tabla `listing_drafts` (migración `0015_listing_drafts`): `locale` (BCP 47: `es-ES`, `en-US`, `zh-Hans`…), `country` y el texto. `country` vale `""` para la ficha principal del idioma y un código de país (`mx`) para una **ficha personalizada por país** de Google Play. Se eligió `""` y no `NULL` porque en Postgres dos `NULL` nunca chocan en un índice único: con `""` basta el índice `(app_id, locale, country)` y el guardado es un upsert.

- **Selector de idioma** encima del editor (`?locale=en-US&country=mx` en la URL). Ofrece la ficha principal (el `locale` del país de la app en `lib/countries.ts`), en el App Store los otros idiomas que Apple indexa en ese país (`extraLocales`), los borradores guardados y el resto de idiomas. En Google Play, además, «Ficha personalizada por país».
- `extraLocales` sale de la tabla [App Store localizations](https://developer.apple.com/help/app-store-connect/reference/app-store-localizations) de Apple, leída el **30 oct 2026**: por ejemplo, en Estados Unidos también cuentan el español (México), el chino, el francés, el coreano, el portugués (Brasil), el ruso, el árabe y el vietnamita; en España, el catalán y el inglés (Reino Unido). Apple la cambia de vez en cuando: verifícala antes de fiarte. De la India solo se guarda el hindi de sus 11 idiomas extra.
- **Antigüedad del borrador**: «Borrador del 27 oct · la ficha publicada cambió el 29 oct…» en amarillo cuando la tienda actualizó la app (`meta.updatedAt`) después de guardar el borrador; si la tienda no da fecha, solo dice cuándo se leyó la ficha (`metaFetchedAt`).
- **Adaptar a otro idioma** con IA (`localizeListing`, prompt `loc-1` en `lib/localize.ts`): parte de la ficha principal (borrador o publicada) y usa el autocompletado de la tienda y los títulos del TOP en el país de destino (`lib/locale-market.ts`: 1 lectura de la ficha, hasta 4 autocompletados y 2 búsquedas, con caché de 6 horas por servidor), más la ficha de producto. No es una traducción literal. La propuesta sale campo a campo como la del optimizador, pasa por el comprobador de normas (con un reintento si rompe un límite, la marca o una norma con nivel de error) y no se guarda hasta que pulsas «Guardar borrador».
- Tus keywords son las del país de la app: en un borrador de otro idioma el editor no las mide y lo dice. Para medir otro idioma, sigue la app en ese país desde «Otros países».
- **Cobertura por idioma**: cuando hay más de una ficha, una tabla con tus 25 keywords relevantes de más oportunidad × cada ficha guardada, con la cobertura ponderada de cada una y el campo que cubre cada keyword.
- `apps.draft` se copió a `listing_drafts` en la migración (con el locale del país de la app) y ya no se escribe; se borrará en una versión posterior.
- Para leer un borrador desde otro módulo (la publicación en Google Play de la fase 20): `getListingDraft(appId, locale, country = "")` en `lib/listing-draft-queries.ts`, o `getListingDrafts(appId)` para todos. El `locale` es BCP 47 con región; Play Console usa algunos códigos propios (`es-419` para Latinoamérica), el mapeo está en `lib/play-console/locales.ts` (ver «Google Play Console»).

### Notas de la versión

La tarjeta **Notas de la versión** del editor escribe el texto de «Novedades de esta versión» en el idioma abierto (`writeReleaseNotes`, prompt `rn-1` en `lib/release-notes.ts`).

- Parte de las funciones **Próxima versión** de la ficha de producto, las notas de la última versión declarada y el CHANGELOG que pegues (hasta 10.000 caracteres). Usa el tono de la marca y, solo si encajan con naturalidad, tus 10 keywords relevantes de más oportunidad (si el idioma es el de tus keywords).
- Límites: Google Play, **500** caracteres por idioma; App Store, **4000**. Si la IA se pasa, el texto se corta en la última línea completa, se avisa y se pide una segunda versión más corta.
- Texto plano para la tienda: quita el markdown y usa viñetas «•».
- Comprobador de normas reducido: términos de precio, promoción o ranking, otras marcas, testimonios, afirmaciones de salud y precios concretos, más la longitud. Se repite en el navegador mientras editas el texto.
- No se guarda: se edita en la tarjeta y se copia con «Copiar» a la consola de la tienda.

### Candado de calidad

Una propuesta de la IA no puede salir como recomendada si cubre peor tus keywords que el texto actual.

- **Cobertura ponderada** (`weightedCoverage` en `lib/metadata-check.ts`), de 0 a 100: cada keyword relevante (no es palabra vacía, no tiene intención ajena y su relevancia es 3 o más, o aún no está valorada) vale su oportunidad (como mínimo 1), multiplicada por el peso del campo donde está la frase exacta. Pesos: Google Play, título 3, descripción corta 2, descripción 1; App Store, nombre 3, subtítulo 2, campo de keywords 1,5, descripción 0 (Apple no la indexa). Si están todas las palabras pero no la frase junta, cuenta una parte del peso del campo más débil que hace falta: el 80 % en App Store (Apple combina las palabras de nombre, subtítulo y campo de keywords) y la mitad en Google Play. Se divide por el máximo posible (todas en el título).
- El editor, el optimizador y el aviso al guardar usan la misma función, así que ven la misma cifra.
- **Optimizar con IA** envía al modelo todas las keywords relevantes (hasta 150, las mejores primero), con dónde las cubre hoy la ficha y una lista «no pierdas estas» con las 20 cubiertas de más oportunidad. Pide repetir cada frase 2 o 3 veces en la descripción, el mismo umbral que el comprobador de densidad. Prompt `lst-3`.
- Si la primera propuesta baja la puntuación, pierde una keyword con oportunidad 40 o más, rompe una norma con nivel de error, se pasa de un límite o quita la marca del título, se pide **una segunda** con la lista concreta de lo que perdió y de las normas rotas. Se queda la mejor de las dos (primero la que respeta los límites, luego la que tiene menos errores de normas y luego la de más puntuación).
- Si aun así es peor, sale con un aviso en rojo y «Aplicar todo» pasa a botón secundario: puedes aplicar campo a campo lo que te convenza.
- La propuesta enseña la puntuación antes y después, las keywords que **gana**, **pierde** y las que **cambian de campo** (ordenadas por oportunidad) y sus propios avisos de normas, antes de aplicarla.
- Al guardar un borrador que cubre peor que el anterior (o que la ficha publicada si no había borrador), se guarda igual pero aparece un aviso con lo que deja de cubrir.

### Comprobador de normas

`lib/policy-check.ts` revisa la ficha contra las normas de Google Play y App Store. Cada regla tiene id, tienda, campo, nivel (**error**: la norma lo prohíbe; **aviso**: probable problema de revisión o de posicionamiento; **info**: conviene saberlo), mensaje en español, enlace a la norma oficial y fecha de revisión. Los avisos salen en el panel **Avisos** del editor y en el de la propuesta, y los errores se envían al modelo en el reintento.

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
| `play.description.keyword-list` | Play | Descripciones | Aviso | Listas de palabras sin frases («Keywords:», 6 o más elementos cortos seguidos) |
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
- un desarrollador hecho solo de palabras genéricas («Apps Studio») tampoco cuenta.

El editor muestra la lista **Marcas detectadas** con «No es una marca» para corregir errores (se guarda por app en la tabla `brand_exceptions`, migración `0012_brand_exceptions`) y la lista de las que marcaste, con «Es una marca» para deshacerlo.

## Ficha de producto

La ficha publicada en la tienda siempre va por detrás del producto: si la IA solo la lee, describe funciones viejas y se olvida de las nuevas. La pestaña **Producto** guarda lo que hace la app contado por su dueño, y el optimizador de ficha, las ideas de keywords, los textos e iconos de Creativos y el análisis de reseñas la usan como **fuente de verdad** (bloque `PRODUCT FACTS` en el prompt).

- Resumen: qué es, para quién, diferenciales, lo que la ficha nunca debe decir (por ejemplo, «no hacer afirmaciones médicas»), tono e idiomas.
- Funciones con estado: **publicada**, **próxima versión**, **planeada** o **retirada**, la versión en que llegó y si se puede anunciar. Las planeadas y las retiradas nunca se describen como disponibles: llegan a la IA solo en una línea «no las menciones», para que las quite si la ficha actual aún las nombra. Las que no se anuncian no llegan nunca.
- En el editor de ficha eliges «Ficha para la versión publicada» (solo funciones publicadas) o «Ficha para la próxima versión» (también las de la próxima). Ideas y Creativos usan la próxima versión; las reseñas, la publicada.
- **Importar desde CHANGELOG**: pegas el texto, Claude propone las funciones con su estado y las versiones, y tú marcas qué se guarda. Nada se guarda sin tu confirmación.
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

En el editor de ficha, **Publicar en Google Play** (botón secundario) abre una vista previa con lo que hay **ahora mismo** en la consola (leído en una edición temporal que se borra) frente al **borrador guardado**, campo a campo: título, descripción corta y descripción. Solo se publica lo guardado, no lo que estés escribiendo.

- Al confirmar: `edits.insert` → `edits.listings.patch` → `edits.validate` → `edits.commit`. Si un paso falla, se borra la edición y no queda nada a medias. Se usa `patch` y no `update` para no borrar el vídeo promocional, que Rankeo no edita. Si la consola ya tiene ese texto, no se envía nada.
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

En la portada de la app (solo Google Play), **Términos de búsqueda reales** importa el CSV de Play Console con los visitantes de la ficha y las adquisiciones (visitantes que instalaron) por término de búsqueda. Es la única cifra oficial de Rankeo; la popularidad sigue siendo una estimación del autocompletado y nunca se mezclan.

- Formatos: el informe mensual de Cloud Storage `store_performance_[paquete]_[aaaaMM]_traffic_source.csv` (UTF-16, una fila por día; [formato documentado](https://support.google.com/googleplay/android-developer/answer/6135870), leído el 30 oct 2026) o la descarga de la pantalla de términos de búsqueda, en UTF-8 o UTF-16, con comas, punto y coma o tabuladores y cabeceras en español o inglés. Si el CSV no tiene fecha, indica el periodo que elegiste al descargarlo. El formato exacto de la descarga desde las pantallas no está documentado: el lector reconoce las columnas por palabras («término», «visitantes», «adquisiciones»…), y si no las encuentra lo dice.
- Se ignoran las filas sin término y el cajón «Other», donde Google agrupa los términos con pocas visitas.
- Se guarda en `search_term_stats` (una fila por término y día, o por término y periodo). Reimportar el mismo periodo sustituye sus datos.
- En la tabla de keywords, las que coinciden llevan la etiqueta **Oficial** con visitantes e instalaciones de los últimos 30 días importados (o del periodo de la última exportación, si es más largo); en el detalle de la keyword salen como dos cifras aparte de la popularidad estimada. Debajo del formulario, las búsquedas que te traen visitas y aún no sigues.
- La API de Google Play no da estos datos: solo están en la consola y en los informes de Cloud Storage.

### Qué está verificado y qué no

Endpoints, parámetros y límites comprobados el **30 oct 2026** en la [referencia REST de la Android Publisher API v3](https://developers.google.com/android-publisher/api-ref/rest/v3/edits) (edits, edits.listings, reviews) y en su documento de descubrimiento (revisión 20261029), en la guía [Reply to Reviews](https://developers.google.com/android-publisher/reply-to-reviews) y en [OAuth 2.0 para cuentas de servicio](https://developers.google.com/identity/protocols/oauth2/service-account). Los tests cubren la firma del JWT con una clave generada en el propio test, el intercambio del token, el orden de las llamadas, el borrado de la edición si algo falla, el mapeo de idiomas y el lector de CSV, siempre con un `fetch` simulado. **No se ha probado contra una cuenta real de Play Console**: la primera vez, revisa la vista previa con calma antes de confirmar.

## Competidores

La pantalla **Competidores** usa el TOP 5 guardado de cada keyword:

- **Cuota de visibilidad**: cada keyword vale su popularidad (1 si aún no se ha medido) y se reparte entre las cinco primeras posiciones con pesos 40, 22, 15, 12 y 11 %, parecidos a la proporción de clics de las tiendas. Se muestra la cuota actual (última posición de cada keyword) y su evolución en 30 días para tu app y las cuatro apps más visibles.
- **Fichas vigiladas**: al pulsar «Vigilar ficha» en una app, la consulta diaria lee su ficha y guarda una copia cuando cambia el título, la descripción corta, la descripción, la versión, el precio, la categoría, el icono o las capturas. La lista de cambios muestra qué palabras añadió o quitó.

## Reseñas

La pestaña **Reseñas** lee hasta 300 reseñas recientes (App Store: feed RSS de Apple; Google Play: `google-play-scraper`) de tu app, de un competidor que vigiles o de cualquier app que haya salido en el TOP 5 de tus keywords en los últimos 30 días (se comprueba en el servidor con los TOP 5 guardados), y Claude resume:

- los temas más mencionados, con su tono, cuántas reseñas los mencionan y una cita;
- las quejas y las peticiones más repetidas;
- ideas concretas para la ficha;
- las frases con las que los usuarios describen la app, que puedes seguir como keywords.

La distribución de estrellas y la media se calculan con las reseñas leídas, no con IA. Cada análisis se guarda, así que puedes comparar la media entre análisis.

- **País.** Por defecto, el de la app; el selector lee las reseñas de otra tienda nacional. Cada análisis guarda su país (`review_analyses.country`, migración 0014; los anteriores se rellenan con el país de la app).
- **Sin reseñas.** Si la tienda no devuelve reseñas recientes, no es un error pasajero: se guarda la comprobación (sin llamar a Claude) y la página lo sigue diciendo al recargar, con la fecha y un botón para comprobar de nuevo.
- **Por dónde empezar.** Mientras no hay análisis, la página sugiere las 3 apps con más cuota de visibilidad en tu TOP 5.
- **Oportunidades.** Al analizar un competidor, Claude recibe tu ficha de producto (versión publicada) y devuelve las quejas y peticiones de sus usuarios que tu app ya resuelve, con la función que lo hace y una cita: material para el texto y las capturas de tu ficha. Los análisis anteriores a `rv-3` no las tienen.
- **Lo que piden los usuarios de la categoría.** Junta las quejas y peticiones del último análisis de cada competidor en ese país. Las que coinciden con una función publicada de tu ficha de producto (por palabras, sin IA, así que conviene revisarlo) salen como «ya lo resuelves»; el resto, como posibles funciones futuras.

## Estacionalidad y otros países

La pestaña **Estacionalidad** convierte los datos de Google Trends de cada keyword en un mapa de calor por meses (0–100 respecto a su mejor mes) y avisa de las keywords cuyo pico empieza en los próximos dos meses, para cambiar la ficha con margen. Todo sale de `lib/seasonality.ts`, también el «Pico de interés en …» de la página de cada keyword. Para no anunciar temporadas que no existen:

- **Señal mínima.** Una serie con más de la mitad de las semanas a 0, o con interés en menos de 6 meses, no tiene datos suficientes: su fila sale en gris, «Sin datos suficientes», en lugar de un mapa de calor engañoso (una semana a 100 entre 51 ceros pintaría un pico enorme).
- **Pico sostenido.** Un mes es pico si su media supera en un 25 % la media del año **y** tiene al menos 3 semanas por encima de ese umbral. Una semana viral no es una temporada.
- **Mes en curso.** El último mes descargado aún no ha terminado, así que no cuenta; si hay datos del mismo mes del año anterior, se usan esos, y si no, la casilla sale vacía.
- **Popularidad mínima.** No se anuncia ningún pico si la popularidad en la tienda es menor de 10 (o aún no se ha medido): que la gente lo busque en Google no significa que lo busque en la tienda. La lista «Picos que empiezan pronto» y el calendario solo incluyen además keywords relevantes.
- **Calendario de picos.** Los 12 meses con las keywords que están en temporada alta en cada uno, marcando el mes en que empieza.
- **Aviso en Novedades.** La consulta diaria crea un aviso «entra en temporada alta» entre 21 y 27 días antes del primer día del pico (una vez por keyword y pico; tipo `seasonal_peak`, se puede desactivar en las preferencias de avisos).

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
- deja de aparecer en los resultados, solo si la tienda devolvió más resultados que tu posición anterior (si estabas el #35 y Google Play solo devuelve 30, no sabemos si has bajado y no se avisa);
- cambia el nº 1, solo donde compites: tu app está entre las 30 primeras (antes o ahora), el nº 1 nuevo o el anterior es un competidor vigilado, o ganas o pierdes tú el nº 1;
- una ficha vigilada cambia;
- un pico de temporada de una keyword relevante empieza en unas 3 semanas (ver Estacionalidad).

Para que no se llene de ruido:

- Las keywords con relevancia por debajo del mínimo (3 por defecto) o cuya búsqueda busca otro tipo de app solo avisan cuando entras o sales del TOP 10 o ganas o pierdes el nº 1. Las que aún no tienen relevancia cuentan como relevantes.
- Los cambios de nº 1 de otras apps de un mismo día van juntos en un único aviso, «7 keywords cambiaron de nº 1», con el detalle de cada una. Si vuelves a consultar posiciones ese día, el aviso se actualiza en lugar de repetirse.
- Dentro de cada día aparece primero lo que le pasa a tu app y después los cambios de nº 1 y de fichas de competidores.
- En **Qué avisos quieres recibir** eliges, por app, qué tipos de aviso quieres y la relevancia mínima (tabla `alert_prefs`). Se aplica desde la siguiente consulta.

El menú lateral muestra cuántos avisos quedan sin leer.

**Resumen semanal** compara la última posición de cada keyword con la de hace una semana: cuántas suben y bajan, cuántas están en el TOP 10, la cuota de visibilidad y las que más se mueven. Si la app lleva menos de una semana, compara con la consulta más antigua y lo dice («frente al 26 oct»). Distingue «sin datos» de «fuera de los N»: pasar de «> 30» a #18 se cuenta como «entra en los primeros 30», no como una subida de 183 puestos que no podemos medir, y las keywords sin consulta en la fecha de referencia salen aparte como «nuevas sin comparación». Para recibirlo por email cada lunes:

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

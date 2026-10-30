# Plan de desarrollo: auditoría de Rankeo (fases 13–24)

## Contexto

`docs/AUDITORIA_Y_PLAN_DE_MEJORA.md` (30 oct 2026, sin commitear) audita producción en `6d0ca10` usando el caso real «Recordatorio pastillas y toma» (Play ES, 298 keywords). El fallo de fondo: la IA solo conoce la ficha publicada y trabaja sobre keywords con mucho ruido, así que optimiza mal, alerta de ruido y anuncia picos falsos. He contrastado cada hallazgo con el código con tres agentes. **Todas las causas existen**, pero hay errores y huecos que cambian la implementación (abajo). El objetivo es ejecutar el plan de la auditoría corregido, una fase = una PR `Fase N: …`, con tests y README actualizados.

## Correcciones a la auditoría (verificadas en código)

| Hallazgo | Corrección |
|---|---|
| H1 | La regla «no inventes» está en **tres** prompts: `listing-optimizer.ts:29`, `suggestions.ts:54`, `assets/creative-ai.ts:65`. El optimizador usa el borrador del formulario, no solo `apps.meta`. `buildReviewPrompt` no recibe nada de la app. `meta.releaseNotes`/`version` nunca llegan a ningún prompt. |
| H2 | Causa estructural no citada: `MAX_PROMPT_KEYWORDS = 60` (el modelo ve 60 de 298) y el prompt no conoce la cobertura actual. El reintento (`ai-actions.ts:207-214`) no se revalida y descarta el primer intento aunque sea mejor. Prompt «2–4, nunca >5» vs validador «>6». La cobertura «120→102» solo se calcula en cliente (`metadata-editor.tsx:41-45,159`) y sin ponderar. |
| H3 | El null→1 está en `relevanceFactor` (`suggestions.ts:173-176`), no en `popularity.ts`; test `suggestions.test.ts:93` lo fija. **0,6 ya es el factor de relevancia 1** (el mínimo): usar **0,7** para «sin medir». «com» sale porque «.» separa cláusulas. No existe valor de origen `top10`. Ninguna UI muestra ni edita la relevancia. |
| H4 | Peor de lo descrito: con separador en el título, toda la primera parte es «marca» («recordatorio de pastillas - X»); el developer se añade sin filtro; en el optimizador entran los TOP 5 de las 298 keywords sin tope. En Ideas, `filterSuggestions` descarta en silencio ideas buenas que contienen esas «marcas». `top5` no guarda descripciones: usar señales disponibles (nº de apps distintas que usan la palabra en el título, palabras propias y keywords seguidas). |
| H5 | El texto «Pico de interés» del detalle viene de **otra** función, `peakMonth` (`lib/trends.ts:77-90`), más laxa; hay que unificarla con `lib/seasonality.ts`. La página de estacionalidad no carga popularidad. El mes en curso es parcial. |
| H6 | `proposed.issues` se calcula y **no se muestra**: los problemas de la propuesta solo aparecen tras aplicarla. `Issue` no tiene `info`, id ni enlace. `metadata-check.test.ts:45-47` usa `issues.at(-1)`: añadir las reglas nuevas sin romperlo. |
| H7 | `lost_ranking` salta en falso cuando Play devuelve menos resultados (falta `depth` en `RankPoint`). El índice de deduplicado no cubre las alertas de competidor (`keywordId` null). |
| H8 | **Bug mayor**: `summarizeWeek` está en `lib/alerts.ts:74-91` (no en `summary.ts`). Trata «sin snapshot hace una semana» igual que «fuera» (201), y por eso cada keyword nueva sale como «fuera → #18». El scraper **ya pagina** (token de continuación): la poca profundidad es de Google, no nuestra. El detalle de keyword aplica el `depth` de hoy a todo el histórico (`keywords/[keywordId]/page.tsx:50`). «200» aparece en `app/apps/[id]/page.tsx:207-209` y en el README. |
| H11 | .1: la tabla ya hace scroll dentro de la `Card` (`min-w-[1180px]`); hay que volver a medir en el navegador antes de rediseñar. .2: los iconos ya son de 26 px con `title`; lo que falta es resaltar a los competidores vigilados. .5: el tooltip existe (`rank.tsx`), pero es un `title` nativo que no se ve en táctil ni con teclado. .6: el editor de ficha no guarda la fecha del borrador; «Guardado el…» es de los estudios de creativos. |
| F8 | El cron nunca refresca la ficha propia; `annotations` no tiene columna de origen. Patrón que se puede reutilizar: `trackCompetitors` + `diffListings`. |

## Reglas transversales (de la auditoría §9 y AGENTS.md)

- Antes de cada fase, leer las guías de Next relevantes: `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `forms.md`, `03-api-reference/03-file-conventions/proxy.md`.
- UI según `DESIGN.md`: tokens de `app/globals.css`, controles con `min-h-11 md:min-h-8`, tablas con scroll dentro de su tarjeta.
- Migraciones nuevas desde **0010** con `npm run db:generate`; nunca editar las existentes. `boolean` aún no está importado en `db/schema.ts`.
- Subir la versión de prompt al tocarlo: `lst-1`, `kw-1`, `crt-1`, `rv-1`.
- Cada nueva llamada a la IA es un export de `lib/claude.ts` sobre el `askClaude` privado (Zod y errores `AiError` en español).
- Nada se borra, se sigue ni se publica sin confirmación (`components/confirm-button.tsx`).
- Fixture del caso real en `tests/fixtures/recordatorio/` (ficha v2, ficha de producto v3 del Anexo A, 60 keywords buenas y ruidosas, propuesta observada). Se crea en la fase 13 y la reutilizan las fases 14–17.
- La fase 13 incluye el commit de `docs/AUDITORIA_Y_PLAN_DE_MEJORA.md` y añade al README las filas que faltan (optimizador #14, diseño #13/#15).

## Fases

### Fase 13 — Ficha de producto (H1, F1) · P0
- **Schema y migración 0010:** `product_facts`, `product_features` (enum `feature_status`: shipped, next_release, planned, retired), `product_releases`, como en la §7 de la auditoría.
- **Lógica:** nuevo `lib/product-facts.ts` con `factsForPrompt(facts, features, mode: "published" | "next")`. Devuelve un bloque de texto: `shipped` siempre, `next_release` solo en modo `next`, nunca `planned` ni `retired`, y las restricciones. Sin ficha, devuelve null.
- **IA:** nuevo `importChangelog(text, current)` en `lib/claude.ts`. Propone funciones con su estado; nada se guarda hasta que el usuario lo confirma.
- **Prompts:** cambiar la regla en los tres prompts al texto propuesto por la auditoría. Añadir `facts` a `ListingPromptInput`, `PromptInput`, `CreativeInput` (vía `describeApp`, que cubre los cuatro builders de creativos) y a `buildReviewPrompt`. Incluir `meta.releaseNotes` y `meta.version`. Subir las cuatro versiones de prompt.
- **Cargadores:** `gatherContext` y `optimizeListing` (`app/ai-actions.ts`), `creativeInput` (`app/asset-actions.ts:23`), `analyzeReviewsAction`.
- **UI:**
  - Pantalla `app/apps/[id]/producto/page.tsx`: pitch, público, diferenciales, restricciones, tono, idiomas; lista de funciones editable; importar CHANGELOG. Acciones en un nuevo `app/product-actions.ts`.
  - Pestaña en `components/app-tabs.tsx`.
  - Selector «versión publicada / próxima versión» y aviso de ficha vacía en el editor.
- **Tests:** `tests/product-facts.test.ts` y ampliación de `tests/listing-optimizer.test.ts`:
  - shipped entra, planned y retired no, next_release solo en modo next;
  - sin ficha, el prompt sale como hoy;
  - criterio del Anexo A: entra «escanear el código de barras», no entra «doble toma».

### Fase 14 — Higiene de keywords (H3, F3) · P0
- **Palabras vacías:** nuevo `lib/stopwords.ts`, moviendo `STOPWORDS` y `stopwordsFor` desde `lib/top-keywords.ts`.
  - Ampliar con adverbios, modales y conectores, sin acentos, en es, en, pt, fr, de e it.
  - Añadir los restos web (com, www, etc).
  - Unificar en `lib/text.ts` el `fold`, hoy triplicado.
- **Schema y migración 0011:** en `app_keywords`, `relevance_source` (ai | user), `intent` (own | foreign) y `relevance_checked_at`. Añadir `top10` y `discover` a `keyword_source`; TOP 10 deja de enviar `manual` (`top-keywords-table.tsx:62`). `followInCountry` copia también el origen.
- **Relevancia con IA:** nuevo `lib/relevance.ts` con prompt, schema y troceo en lotes de 100, más `rateRelevance` en `lib/claude.ts`.
  - Usa la ficha de producto de la fase 13.
  - Se lanza al añadir keywords (`followKeywords`) y con «Recalcular relevancia».
  - No pisa las relevancias fijadas por el usuario.
- **Fórmula:** `relevanceFactor(null) = 0.7`. Actualizar `suggestions.test.ts:93`. El optimizador ordena por factor, no por relevancia en bruto (`listing-optimizer.ts:76`).
- **Intención ajena:** marcar `intent = foreign` cuando ≥ 4 de las apps del TOP 5 no comparten categoría con la app. Dato del `top5` guardado y, si hace falta, de la categoría de `fetchTopApps`.
- **UI:**
  - Columna de relevancia con selector 1–5 en la tabla de `app/apps/[id]/page.tsx`.
  - Filtro `?f=noise` «Probablemente irrelevantes»: relevancia ≤ 2, ajena o palabra vacía.
  - Selección múltiple con «Quitar seleccionadas», que necesita un componente cliente; reutilizar el patrón de selección de `top-keywords-table.tsx`.
  - Deshacer durante unos segundos: la acción devuelve los ids y sus filas, y «Deshacer» los reinserta.
  - Relevancia visible y relevancia ≤ 2 desmarcada por defecto en TOP 10 y en Descubrir.
  - Aviso de presupuesto por encima de 150 keywords.
- **Tests:** `top-keywords` (ademas, ahora, puedes, etc y com no salen), `relevance` con el modelo simulado, `suggestions` (factor 0,7), y el fixture del caso real (el filtro propone el ruido y respeta las frases centrales).

### Fase 15 — Candado, normas y marcas (H2, H4, H6, F4, F5) · P0
- **`weightedCoverage(store, draft, keywords: {term, opportunity}[])`** en `lib/metadata-check.ts`:
  - pesos por campo: Play 3/2/1, iOS 3/2/1,5/0;
  - amplía `Coverage` con las coincidencias por campo;
  - reutiliza `FIELDS`, `tokens`, `containsPhrase` y `countPhrase`.
- **Comparación de fichas:** `keywordDiff(before, after)` devuelve las keywords ganadas, perdidas y movidas de campo, ordenadas por oportunidad.
- **Prompt del optimizador:**
  - pasar a todas las keywords relevantes (≥ 3), no solo a las 60 primeras;
  - incluir la cobertura actual y la lista de «no pierdas estas»;
  - pedir densidad de 2–3 repeticiones, alineada con el validador.
- **Reintento con revalidación** en `optimizeListing`:
  - se calcula la puntuación de las dos propuestas y se queda la mejor;
  - el feedback lista las keywords perdidas y los errores de normas;
  - si la propuesta sigue siendo peor, `ListingProposal.regression = true`: aviso con `danger` y «Aplicar todo» como botón secundario.
- **Normas:** nuevo `lib/policy-check.ts`. Cada regla es `{ id, store, field, level, test, message, link, reviewedAt }`, con listas por idioma según el Anexo C. Antes de escribir las reglas, verificar el texto vigente en las fuentes oficiales y guardar el enlace y la fecha en cada una.
  - `Issue` pasa a `{ level: error|warn|info, text, ruleId?, link? }`.
  - Avisos de la propuesta en el panel junto a los del borrador.
  - Densidad por cada 1000 caracteres.
  - Reglas de salud cuando la categoría es «Medical» o «Health».
- **Marcas** (`competitorBrands` en `lib/suggestions.ts:110-121`):
  - nunca son marca las palabras del título propio, las keywords seguidas ni las de la ficha de producto;
  - una cabeza de título solo cuenta como marca si es de una sola palabra o no aparece en el título de 3 o más apps distintas;
  - el developer solo si no es genérico;
  - limitar a 25 apps del TOP 5 más frecuentes.
  - Tabla `brand_exceptions` (migración 0012) y lista editable «Marcas detectadas» en el editor.
  - Mantener verdes los casos de `suggestions.test.ts:21-40`.
- **Borrador:** al guardar uno manual que empeora la cobertura, aviso no bloqueante.
- **Tests:**
  - `policy-check.test.ts`: un caso positivo y uno negativo por regla; el caso real da avisos por «gratis» y por densidad.
  - `weightedCoverage`, `keywordDiff` y el feedback de regresión.
  - Marcas: «notas», «control» y «recordatorios» no salen como marca; «mytherapy» y «medisafe» sí.

### Fase 16 — Alertas útiles, profundidad real y resumen (H7, H8, H11.3, H11.5)
Se puede adelantar porque la parte de profundidad no depende de nada. El filtro por relevancia sí depende de la fase 14.
- **Datos para las alertas:** `RankPoint` gana `depth` y `relevance`. `generateRankAlerts` hace join con `app_keywords` y carga los `competitors.storeId` de cada app.
- **Reglas:**
  - `new_leader` solo si la app propia está en el TOP 30 o el nº 1 nuevo o el anterior es un competidor vigilado;
  - `lost_ranking` solo si la posición anterior era menor que el `depth` de hoy;
  - ignorar relevancia ≤ 2 salvo en movimientos de la app propia.
- **Agrupar:** los cambios de nº 1 del día van en un único aviso «N keywords cambiaron de nº 1», con el detalle en el campo `detail`. `alert_prefs` (migración 0013) guarda qué tipos quiere ver el usuario.
- **Novedades:** primero lo que afecta a la app propia.
- **Resumen:**
  - `summarizeWeek` distingue «sin datos» (sin snapshot) de «fuera de los N»;
  - pasar de fuera a #18 se describe como «entra en los primeros N», no como un salto de +183;
  - `WeekRow` gana los dos `depth`.
  - `getWeeklySummaries` cae al snapshot más antiguo disponible por app si no hay uno de hace 7 días, y expone `baselineDate`. La página y el email dicen «frente al 26 oct».
- **Profundidad:**
  - el histórico conserva el `depth` de cada fila (`getKeywordDetail`, `HistoryPoint`);
  - quitar «200» de la UI y del README y documentar la profundidad real de Play;
  - `Position` con texto accesible que funcione en táctil (popover o `aria-describedby`), no solo con `title`.
- **Tests:**
  - `alerts.test.ts`: un nº 1 nuevo fuera del TOP 30 sin competidores no genera aviso; `lost_ranking` respeta el `depth`; la agrupación.
  - Reescribir el caso `:41-53` de `summarizeWeek`.

### Fase 17 — Estacionalidad fiable (H5, F6)
- **Señal mínima:** `signalQuality(points)` en `lib/seasonality.ts` descarta la serie si más del 50 % de las semanas valen 0 o hay menos de 6 meses con media > 0.
- **Pico sostenido:** exige 3 o más semanas por encima del umbral dentro del mes y excluye el mes en curso, que es parcial.
- **Popularidad:** no se anuncia ningún pico si la popularidad es < 10. La página hace join con `keyword_metrics`.
- **Unificación:** `peakMonth` (`lib/trends.ts`) pasa a usar `monthlyProfile` y `peakMonths`. Se mueven sus tests de `popularity.test.ts`.
- **UI:** fila «Sin datos suficientes» en gris. Calendario anual por app. Aviso en Novedades 3 semanas antes de cada pico (tipo nuevo `seasonal_peak`).
- **Tests:** 51 ceros y un 100 → null; un pico sostenido en diciembre se sigue detectando.

### Fase 18 — Reseñas de la competencia (H9, F10)
- **Estado vacío:** uno solo y claro. «No hay reseñas» deja de ser un error transitorio.
- **Analizar cualquier app del TOP 5** aunque no esté vigilada: relajar la comprobación de `review-actions.ts:22-27` contra el `top5` guardado. Botones para los 3 competidores con más cuota (`lib/visibility.ts`).
- **País:** selector de país; `review_analyses.country` en la migración 0014.
- **Prompt:** recibe la ficha de producto y devuelve `opportunities`, es decir, las quejas de los competidores que la app ya resuelve. Vista agregada «Lo que piden los usuarios de la categoría». Versión `rv-2`.

### Fase 19 — Notas de versión y fichas por idioma y país (F7, F11)
- **Fichas por idioma:** `listing_drafts` (locale, country, draft, updatedAt) en la migración 0015, con migración de datos desde `apps.draft`, que se mantiene sin borrar.
  - Selector de locale en el editor.
  - Resuelve H11.6: «Borrador del … · la ficha publicada cambió el …», comparando con `metaFetchedAt` y `meta.updatedAt`.
- **Locales:** `lib/countries.ts` gana los locales y los idiomas indexados extra por país.
- **Traducción adaptada:** usa el autocompletado y el TOP 10 del país de destino.
- **Notas de versión:** generador a partir de las funciones `next_release` y el CHANGELOG. Límites de 500 en Play y 4000 en iOS. Pasan por el comprobador de normas.

### Fase 20 — Google Play Console (F2 Play)
- **Credenciales:** cuenta de servicio en variables de entorno del servidor. Modo solo lectura por defecto.
- **Publicar el borrador:** `edits.insert` → `listings.update` → `commit`, con vista previa del diff y confirmación. Cada publicación queda registrada (tabla `publications`) y alimenta la fase 22.
- **Reseñas:** `reviews.list` y `reviews.reply`, con borradores escritos por Claude.
- **Datos de rendimiento:** importación del CSV de Play Console con los términos de búsqueda reales, marcados como «oficial» frente a «estimación».
- **Antes de implementar:** verificar la API y la librería (`googleapis` o REST con JWT) en la documentación oficial.

### Fase 21 — App Store Connect (F2 iOS)
- Clave de API (JWT ES256) para actualizar los metadatos de la versión en preparación, más los informes de analítica que estén disponibles. Mismo patrón que la fase 20.

### Fase 22 — Anotaciones automáticas y experimentos (F8)
- **Ficha propia en el cron:** añadir `trackOwnListings` a `app/api/cron/rankings/route.ts`, reutilizando `toListing`/`diffListings` y el patrón de `trackCompetitors`. Requiere tabla `app_snapshots`.
- **Anotaciones automáticas:** `annotations.source` (manual | auto | publish) y el diff de cada cambio.
- **Impacto por keyword:** extender el cálculo de `averagePosition` a ±14 días en las keywords afectadas.
- **Experimentos:** plantilla de experimento de ficha de Play (variante, hipótesis, resultado).

### Fase 23 — Creativos (H10, F9)
- **Capturas:**
  - subida múltiple y por arrastre, asignada por orden: hoy es `screenshot-studio.tsx:846-853`, un solo archivo;
  - fecha y versión de cada captura en el spec, con aviso si son anteriores a `meta.updatedAt`;
  - script `scripts/push-screenshots` (adb), que es opcional.
- **Keyword por pantalla:** se sugiere entre las relevantes (fase 14) usando la ficha de producto y visión.
- **Icono:** `defaultIconSpec` (`lib/assets/icon.ts:80`) arranca con `paletteFromImages` del icono actual.
- **Vídeo:** pista de audio subida por el usuario, con AudioEncoder en `video-encode.ts` y `mp4-muxer`.

### Fase 24 — Interfaz y panel de salud (H11, F12)
- **Tabla de keywords:** volver a medir el desbordamiento móvil y, si se confirma, tarjetas por debajo de `md` o primera columna fija.
- **TOP 5:** resaltar a los competidores vigilados.
- **Ajustes:** `app/ajustes/page.tsx` con el estado de las integraciones (Anthropic, imágenes, Resend, Play, ASC) y una prueba de envío del email.
- **Panel de salud** en la portada de cada app, con enlaces a la acción concreta.

**Primera entrega recomendada:** fases 13, 14 y 15. Con ellas, la IA conoce el producto, trabaja sobre keywords limpias y no puede empeorar la ficha. La parte de profundidad y resumen de la fase 16 es independiente y se puede adelantar si se quiere un arreglo rápido de los movimientos falsos.

## Verificación (cada fase)

1. `npm run lint`, `npm run typecheck` y `npm test` en verde; CI ejecuta además `npm run build`.
2. `npm run db:generate` produce una sola migración nueva y `npm run db:migrate` la aplica en una rama de Neon antes de producción.
3. Prueba manual con `npm run dev` sobre la app 1, repitiendo el recorrido del Anexo B y comparando con la línea base. Objetivos:
   - Fase 13: la propuesta menciona el escaneo del código de barras.
   - Fase 14: «Reloj» deja de estar entre los competidores principales.
   - Fase 15: ninguna propuesta que empeore la cobertura sale como recomendada.
   - Fase 16: menos de 10 alertas al día.
   - Fase 17: «Picos que empiezan pronto» queda vacía o solo con keywords con señal.
4. Las llamadas a la IA nunca aparecen en los tests; se usan salidas simuladas desde fixtures.

# Plan de desarrollo: rediseño UX (fases 25–33)

**Para quién:** el agente o desarrollador que implemente `docs/REDISENO_UX.md`. Ese documento dice *qué* hay que conseguir; este dice *cómo* hacerlo sobre el código actual, con las correcciones que salieron al contrastarlo (rama `fix/revision-2026-10-30`, commit `6314c9a`, 03-11-2026).

**Regla de lectura:** si este plan y el documento de rediseño chocan, manda este plan en lo técnico (modelo de datos, librerías, rutas) y el documento en lo visual y de producto.

---

## 0. Antes de empezar

1. **Desplegar las correcciones H12–H22.** Están en `fix/revision-2026-10-30` y aún no en `main`. Antes hay que aplicar la migración `0018_product_brand` en producción. El rediseño parte de esa rama ya integrada en `main`.
2. **H23 sigue abierto.** Está en `docs/ERRORES_REVISION_2026-10-30.md`, líneas 287–299: los fondos de la IA se confunden con las plantillas, y una plantilla pisa los colores sin avisar. Se resuelve en la fase 32.
3. **H24: las ideas descartadas siguen pendientes.** Está en `ERRORES_REVISION_2026-10-30.md`. El código no tiene un botón «Descartar todas», solo «Seleccionar todas» y «Descartar», y leído parece correcto.
   - Antes de tocarlo, ejecutar `select status, count(*) from ai_suggestions where app_id = 1 group by 1` en producción y reproducir el fallo en el navegador.
   - Hay que sospechar del envío con `formAction` dentro de un formulario con `useActionState`.
   - Se corrige al principio de la fase 25, con test y aviso de cuántas se han descartado, porque no espera al rediseño.

---

## 1. Correcciones al documento de rediseño (verificadas en el código)

| Punto del documento | Realidad | Consecuencia para el plan |
|---|---|---|
| «No cambia la lógica de negocio (`lib/`)» | Falso. El modelo de mercados, los KPIs de Inicio, la popularidad previa en Encontrar, los subrayados de normas, el diff de la propuesta, el TOP 10 en el panel y el origen «Reseñas» necesitan lógica o esquema nuevos | Cada fase lista su trabajo en `lib/` y su migración |
| §4 «Modelo de datos»: tabla `markets`, todo pasa a `market_id` | Cada fila de `apps` **ya es un mercado**: el índice único es `(store, store_id, country)`. Llevar 13 tablas a `market_id` toca unos 85 de 92 archivos y obliga a fusionar con colisiones de claves, sin tests de base de datos | **Opción B**: tabla padre `products` y la columna `apps.product_id` (ver §2.1) |
| D2: «la barra de pestañas provoca scroll horizontal en toda la página» | Las pestañas ya tienen su propio scroll (`app-tabs.tsx:24-25`) y `main` tiene `min-w-0`. Los 1556 px son probablemente el `scrollWidth` de la lista, no del `body` | Medirlo con Playwright en la fase 25 antes de darlo por causa. El rediseño quita las pestañas igualmente |
| D9: «Dejar de seguir» en la cabecera de cualquier app | Solo está en la cabecera de la pestaña Keywords (`app/apps/[id]/page.tsx:127-136`), con `window.confirm`. El riesgo es real: borra en cascada y no se puede deshacer | Se mueve a la zona de peligro (fase 27) |
| D13: selector de 60 países | Son 58 (`lib/countries.ts`). Hay un cuarto sitio: `/buscar` | — |
| 6.1: «posición media de las 5 keywords principales» | No está definido | Definición propuesta: las 5 keywords relevantes con más oportunidad, contando «fuera de los resultados» como desconocida (fase 28) |
| 6.2: impacto a 14 días en el gráfico de visibilidad | `annotationImpact` mide posiciones de una en una; el gráfico muestra cuota. No hay una media agregada del tipo «23 → 18» | Nueva función agregada en `lib/impact.ts` (fases 28 y 32) |
| 6.3: TOP 10 en el panel de la keyword | Solo se guarda el `top5` (`lib/ranking.ts:11`, `rank_snapshots.top5`) | Guardar el `top10` en una columna nueva; la búsqueda ya devuelve hasta 200 resultados (fase 29) |
| 6.3: origen «Reseñas» | `keyword_source` no lo tiene, y las palabras de Reseñas se siguen como `ai` (`resenas/page.tsx:325`) | Nuevo valor de enum en una migración. Las ya añadidas no se pueden recuperar como «Reseñas» |
| 6.4: popularidad antes de seguir | Medir cuesta hasta 16 peticiones por keyword, y Play responde 429 con carga. Una candidata no tiene fila en `keywords` | Estimación barata con el autocompletado ya leído, más «Medir» bajo demanda con tope (fase 29) |
| 6.4: descartar en las 3 fuentes | Solo las ideas con IA tienen estado. Descubrir, TOP 10 y Reseñas se recalculan en cada carga | Tabla `keyword_candidates` (o `ai_suggestions` con columna `source`) |
| 6.6: punto de «reseñas nuevas» | Las reseñas no se guardan. Solo existe `stats.to` del último análisis | Comprobación en el cron con caché, no en cada carga de página (fase 31) |
| 6.7: «Preparar ficha estacional» crea un borrador | Hay un borrador único por (app, idioma, país): pisaría el principal | En esta versión solo crea la anotación y abre el editor con el enfoque; los borradores con nombre quedan para más adelante |
| 6.8: subrayados de cobertura y normas | `Issue` no tiene campo ni posiciones, y `containsPhrase` trabaja sobre texto plegado y devuelve sí o no | Añadir `field` y `ranges` a los avisos, y una función de coincidencias con posiciones en el texto original (fase 30) |
| 6.8: propuesta como diff | `listing-diff.ts` da conjuntos de palabras sin orden, y no hay diff por palabras | Diff LCS por palabras en `lib/word-diff.ts` (fase 30) |
| §7.3: Tremor | `@tremor/react` está hecho para Tailwind 3 y React 18. Aquí hay Tailwind 4.3 y React 19 | No instalarlo. Tomar los patrones de Tremor Raw sobre Recharts 3, que ya está instalado |
| §7.3: shadcn/ui | Funciona con Tailwind 4 y React 19, pero sus tokens chocan con los nuestros (`muted` es un fondo en shadcn y un texto aquí) | Pegar los componentes y adaptar sus clases a nuestros tokens; no usar su `globals.css` |
| §7.1: tokens nuevos | Renombrar tocaría unas 1.200 clases en unos 65 archivos | **Mantener los nombres y cambiar los valores**, con alias para los nombres nuevos (ver §2.2) |
| §7.1: `--brand` oscuro `#7B93FF` | El blanco sobre ese azul da 2,9:1 y suspende AA en el botón principal | `--on-brand` oscuro `#0E1013` |

---

## 2. Decisiones técnicas

### 2.1 Modelo «app → mercados» (opción B)
- **Tabla nueva `products`:** `id`, `store`, `store_id`, `slug` único, `title`, `icon`, `created_at`.
- **`apps` pasa a ser el mercado:** se le añade `product_id`, obligatorio, con FK y borrado en cascada.
- **Migración solo aditiva:**
  - Un producto por cada par distinto (store, store_id).
  - El slug sale del título o del final del `store_id` («recordatorio»), sin repetirse.
  - Las apps 1 y 4 apuntan al mismo producto. **No cambia ningún id.**
- **Las tablas de la app** (`product_facts`, `product_features`, `product_releases`, `brand_exceptions`, `asset_designs` y `generated_images`) se resuelven en dos pasos:
  1. **Fase 26:** se leen y se escriben a través del **mercado principal**, el `apps.id` más bajo del producto, con `primaryMarket(productId)`. Así no hay que mover datos.
  2. **Fase 26b:** se migran a `product_id` y se deduplican: se conserva el mercado principal, se suman las excepciones de marca y del resto solo se toma lo que el principal no tiene. **Antes, comprobar qué filas tiene la app 4.**
- **`listing_drafts` y `publications`:** una ficha de la consola es por app de la tienda y por idioma, no por país.
  - Se quedan donde están.
  - El selector de idioma muestra los borradores de todos los mercados del producto y avisa si dos mercados tienen borrador del mismo idioma.
  - Se decide en la 26b si pasan al producto.
- **Nombres en el código:** `apps` significa «mercado». Se documenta en `db/schema.ts` y en el README; no se renombra la tabla. El tipo `App` se queda, y se añaden `Product` y `Market = App`.
- **Fuera de alcance:** un producto con iOS y Android a la vez. Eso es el `store_id_override` del documento.

### 2.2 Sistema visual
- **Tokens:** se reescriben los *valores* en `app/globals.css`. La tabla de equivalencias:

  | Hoy | Valor nuevo según el documento |
  |---|---|
  | `bg` | `--bg` |
  | `surface` | `--surface` |
  | `surface-muted` | `--surface-2`, con alias `surface-2` |
  | `line` | `--line` |
  | `ink` | `--ink` |
  | `ink-soft` | `--ink-2`, con alias `ink-2` |
  | `muted` | terciario más claro, que debe pasar AA en texto de 12 px o subir al valor de `ink-2` |
  | `brand`, `brand-soft`, `up`, `down` | igual nombre |
  | `warn-fg` | `--warn` |
  | `panel` | `bg` (desaparece el panel tipo Linear) |
  | `edge` | `transparent` |
  | `link` | el valor de `brand` |
  | `line-strong`, `danger*`, `ios-*`, `android-*`, `series-1…5` | se mantienen |

  - Token nuevo `--series-own`, igual a `var(--brand)`, para dibujar «tu app».
- **Claro por defecto:**
  - En `globals.css`, el bloque `:root` pasa a ser el claro y el oscuro va bajo `[data-theme="dark"]`.
  - Se invierte `themeScript` en `app/layout.tsx`: oscuro solo si se eligió.
  - Se añade la variante `dark:` y se quitan los 7 usos de `light:`, que están en `nav-link.tsx` y `theme-toggle.tsx`.
  - Si no hay preferencia guardada, se respeta `prefers-color-scheme`.
- **Tipografía:** Inter y JetBrains Mono ya están cargadas. En `body` se añaden `font-feature-settings: "tnum", "cv11"`. Se definen tokens para la escala 12/13/14/16/20/28/32.
- **Librerías nuevas:**
  - utilidades: `clsx`, `tailwind-merge`, `class-variance-authority` y la función `cn()` en `lib/cn.ts`;
  - `radix-ui`, `cmdk` (para ⌘K), `lucide-react` (iconos) y `sonner` (toasts).
  - Los componentes de shadcn se pegan en `components/ui/` adaptados a nuestros tokens.
  - **No** se usa `@tremor/react`.
  - Antes de instalar, comprobar las versiones vigentes y que sean compatibles con React 19.3 y Tailwind 4.3.
- **Compatibilidad:** `buttonPrimary`, `buttonSecondary` e `inputClass` se mantienen como cadenas que se exportan, porque se usan mucho, y se crea `Button` con cva encima. `PageHeader` gana un hueco para acciones.
- **Infraestructura de pruebas (fase 25):**
  - Playwright y `@axe-core/playwright`.
  - Un proyecto de Vitest con jsdom para los componentes `.tsx` que tengan lógica.
  - Un script `test:e2e` que arranca `next start` contra una base de datos de prueba (una rama de Neon) y recorre todas las rutas a 390 y 1440 px.

### 2.3 Reutilizar antes de crear

| Componente nuevo | Sale de |
|---|---|
| `HelpTip` | `components/out-of-results.tsx`: tooltip accesible con ratón, foco y toque |
| `RankBadge`, `DeltaBadge` | `Position` y `PositionChange` de `components/rank.tsx` |
| `KpiCard` | `Stat` de `app/resumen/page.tsx`, más `Sparkline` de `rank.tsx` |
| `StatusDot` | `components/health-panel.tsx` |
| Barra flotante de selección | `BulkRemoveBar` de `components/keyword-selection.tsx`, que ya tiene deshacer |
| Gráfico de visibilidad con anotaciones | Las marcas `ReferenceLine` de `rank-chart.tsx:56-64` sobre los datos de `share-chart.tsx` |
| «Qué hacer hoy», «Próximos pasos» | Los elementos de `lib/health.ts`, `alertPriority` y `nextSeason` |
| Integraciones | `integrationStatuses(env)` de `lib/settings.ts` y `components/integration-test.tsx` |

---

## 3. Fases

Una fase = una PR `Fase N: …`, con tests, README y `DESIGN.md` al día. Ninguna fase rompe lo que funciona: las rutas antiguas siguen respondiendo hasta que la fase 27 las redirige.

### Fase 25 · Sistema visual e infraestructura
- **Tokens y temas:** según §2.2, con claro por defecto, el `on-brand` oscuro corregido y `--series-own`.
- **Librerías y componentes:**
  - las de §2.2, más `cn()`;
  - componentes base en `components/ui/`: Button, Dialog, Sheet, Popover, DropdownMenu, Tabs, Tooltip, Command y Toaster;
  - componentes propios: KpiCard, DeltaBadge, RankBadge, EmptyState, HelpTip, PageHeader con acciones, StatusDot y Skeleton por forma;
  - `DataTable` solo con la estructura, que se termina en la fase 29.
- **Escaparate y documentación:** página `/dev/ui`, visible solo con `NODE_ENV !== "production"`, con todos los componentes en los dos temas. Reescribir `DESIGN.md` y la sección de diseño de `AGENTS.md`.
- **Pruebas:** Playwright con axe, el script `test:e2e` y una medición inicial de desbordamiento en todas las rutas actuales, para comprobar D2 y D10.
- **Aceptación:**
  - `/dev/ui` sin errores de contraste AA según axe, en claro y en oscuro.
  - Las pantallas actuales siguen funcionando con los valores nuevos: revisión visual de las capturas de `docs/rediseno/actual/`.

### Fase 26 · Productos y mercados (opción B)
- **Esquema y migración** `0019_products`: la tabla `products`, la columna `apps.product_id` con su relleno, y el slug único.
- **`lib/`:**
  - `lib/products.ts` con `loadProduct(slug)`, `loadMarket(slug, country)` (devuelve el mismo `App` de hoy), `primaryMarket(productId)`, `productMarkets(productId)` y `marketPath(app, sub?)`;
  - las consultas de la ficha de producto, las marcas y los creativos se resuelven por el mercado principal;
  - `followApp` y `followInCountry` crean o enlazan el producto.
- **Rutas nuevas** `app/a/[app]/[market]/**`, que reutilizan el contenido de las páginas actuales extraído a componentes, y `app/a/[app]/creativos/**` sin mercado.
  - `marketPath()` sustituye los 87 enlaces `/apps/${…}` (en 40 archivos) y las 36 llamadas a `revalidatePath("/apps/…")`.
- **Redirecciones:**
  - Las estáticas van en `next.config.ts` con `redirects()` y `permanent: true`, que da 308: `/novedades` → `/actividad`, `/resumen` → `/actividad?vista=semana`, `/ajustes` → `/integraciones` y `/buscar` → `/apps/nueva`. Los destinos llegan en la fase 27, así que estas redirecciones se activan entonces.
  - `/apps/[id]/**` necesita buscar en la base de datos: va en `app/apps/[id]/[[...rest]]/page.tsx` con `permanentRedirect()`. Cuidado con que `/apps/nueva` no se lea como un id. Los enlaces de los emails antiguos siguen funcionando.
- **Cron:** sin cambios, porque sigue recorriendo las filas de `apps`.
- **Tests:**
  - funciones puras para el slug, `marketPath` y el mapa de redirecciones;
  - un test de migración con `@electric-sql/pglite` que ejecuta las migraciones 0000–0019 sobre datos de ejemplo, con dos apps del mismo `store_id`, y comprueba que quedan un producto y dos mercados.
- **Aceptación:**
  - Las apps 1 y 4 se ven como «Recordatorio» con los mercados ES y US.
  - `/apps/1/metadata` redirige con 308 a `/a/recordatorio/es/ficha`.
  - Todos los tests en verde.

### Fase 26b · Datos de la app en el producto
- Migración `0020`: mover las tablas de la app a `product_id`, deduplicando según §2.1, y quitar `primaryMarket` de esas consultas.
- Decidir dónde viven `listing_drafts` y `publications`.
- **Aceptación:** la ficha de producto y los creativos son los mismos en ES y en US, sin copiar nada a mano.

### Fase 27 · Navegación
- **Barra lateral global:**
  - selector de app (Command con búsqueda e iconos);
  - Inicio, Actividad con el contador `UnreadBadge` que ya existe, e Integraciones;
  - el cambio de tema y la versión al pie.
  - En móvil, barra inferior: Inicio, Actividad, Apps y Más.
- **Dentro de una app:**
  - Barra lateral con los grupos KEYWORDS, MERCADO y OPTIMIZAR, y Ajustes de la app. La configuración sale del array `TABS` de `app-tabs.tsx`, que se elimina.
  - Contadores por entrada en una sola consulta agregada, para no hacer una consulta por cada contador.
- **Cabecera fija de 56 px** en `app/a/[app]/[market]/layout.tsx`, que se saca de `apps/[id]/page.tsx:102-137`:
  - selector de mercado;
  - «Posiciones del…»;
  - el botón «Actualizar posiciones»;
  - el menú `⋯`, con Actualizar ficha, Ver en la tienda y Ajustes.
- **⌘K:** apps, keywords del mercado activo y las acciones «Actualizar posiciones», «Optimizar ficha» y «Generar ideas».
- **Páginas globales:**
  - **Actividad:** fusiona `/novedades` y `/resumen`, con los filtros de periodo, app y tipo, y las preferencias en un diálogo.
  - **Integraciones:** tarjetas por integración, con «Cómo conectar» en pasos numerados y las variables dentro de «Detalles técnicos».
  - **`/apps/nueva`:** el buscador que hoy está en `/buscar`.
- **Ajustes de la app**, con pestañas:
  - Producto: el formulario actual, que se rehace en la fase 33.
  - Mercados: lo que hoy es Otros países.
  - Marcas: sale del editor.
  - Datos de Play Console: el CSV.
  - Zona de peligro: «Dejar de seguir» con confirmación escribiendo el nombre, en un diálogo propio, sin `window.confirm`.
- **Aceptación:**
  - Ninguna pestaña horizontal.
  - «Dejar de seguir» solo en la zona de peligro.
  - Playwright: 0 rutas con `scrollWidth > innerWidth` a 1440 y a 390 px en las páginas de navegación.

### Fase 28 · Inicio y Resumen de la app
- **`lib/`:**
  - `lib/home.ts` con `getHomeOverview()`. Cubre los KPIs del conjunto (TOP 10 y TOP 30 con su cambio, cuota media y avisos sin leer) y una fila por mercado (cuota a 30 días como mini-gráfico, TOP 10 y TOP 30, posición media de las 5 principales y valoración).
    - Una consulta de 30 días para todas las apps, no una por app.
    - La salud se calcula con un subconjunto barato, sin la llamada a Google Play, y se carga por fila con Suspense.
  - `summarizeWeek` cuenta también el TOP 30.
  - `lib/today.ts` con `whatToDoToday()`: une la salud, las alertas y los picos de temporada, les da prioridad y quita las repetidas entre el aviso de temporada y la línea de temporada de la salud.
  - `nextSeason` pasa a devolver una lista.
  - `getCompetitorPage` acepta `days` (30, 90 o 180).
  - Nueva `aggregateImpact(annotation)` en `lib/impact.ts`, del tipo «12 keywords · 23 → 18 ▲».
- **UI:**
  - Inicio según 6.1, con estado vacío (el buscador grande).
  - Resumen según 6.2: KPIs, gráfico de visibilidad con las anotaciones y el impacto en el tooltip, próximos pasos con «4 en orden» plegado, movimientos y la barra de competencia.
- **Aceptación:**
  - Con datos de producción, el Resumen de la app 1 muestra la anotación del 30 de octubre y las tareas de salud ordenadas.
  - Inicio carga en menos de 1,5 s con 4 mercados.

### Fase 29 · Keywords
- **`DataTable` completo:**
  - barra de herramientas con buscador y filtros por facetas (estado, relevancia, origen y dificultad);
  - «Vistas» para elegir columnas y densidad, guardado en localStorage;
  - cabecera fija y cifras tabulares;
  - filas de 44 o 36 px;
  - barra flotante de selección (cambiar relevancia, recalcular con IA, exportar y quitar, con deshacer);
  - versión en tarjetas por debajo de 640 px, con los filtros en una hoja inferior.
- **Panel de detalle de 480 px**, abierto con `?k=`:
  - posición a 90 días con anotaciones, sacada de `getKeywordDetail`;
  - el TOP 10;
  - relevancia e intención;
  - «Dónde aparece en tu ficha» con `weightedCoverage`;
  - las acciones «Analizar TOP 10» y «Quitar».
  - La página `/keywords/[id]` se mantiene para los enlaces directos.
- **«+ Añadir keywords»:** diálogo con «Escribir» y «Pegar CSV».
- **Encontrar:** una sola pantalla con semilla o tema y tres fuentes (Autocompletado, Ideas con IA y TOP 10), que dan una misma lista de candidatas con fuente, relevancia, popularidad estimada, el porqué y una casilla. «Seguir N» y «Descartar» funcionan igual en las tres.
- **Esquema y `lib/`** (migración `0021`):
  - `rank_snapshots.top10`, que solo se rellena con datos nuevos;
  - `keyword_source` gana `reviews`;
  - tabla `keyword_candidates` (producto o mercado, término, fuente, estado, motivo, relevancia y popularidad estimada), o bien `ai_suggestions` con la columna `source`. Lo decide el implementador; se recomienda la tabla nueva.
  - **Popularidad estimada:** sale del autocompletado ya leído (`lib/discover.ts`) con `autocompleteScore` según el prefijo y el puesto en la lista. Se marca como «estimada».
  - **«Medir»:** bajo demanda, con un máximo de 10 candidatas por clic.
- **Las palabras de Reseñas** llegan a Encontrar con la fuente «Reseñas» y se pueden descartar.
- **Aceptación:**
  - Como mucho 25 botones visibles sin selección (hoy 106).
  - A 390 px se ve en tarjetas y sin desbordamiento.
  - Descartar funciona en las tres fuentes y lo descartado no vuelve.

### Fase 30 · Ficha de la tienda
- **Barra superior:** idiomas del mercado más los que tienen borrador, «+ Añadir idioma», el conmutador Publicada | Borrador | Comparar, y las acciones «Optimizar con IA» (principal), «Adaptar a…» y «Guardar».
- **Editor al 60 %:** campos grandes con autoajuste, contador con barra (ámbar al 90 % y rojo al pasarse), keywords subrayadas y avisos de normas en ondulado.
- **Panel derecho al 40 %**, con pestañas:
  - **Vista previa:** Google Play móvil y App Store, con icono, título, descripción corta o subtítulo y las 3 primeras capturas de `meta`. Si hay capturas en Creativos, se usan sus miniaturas.
  - **Cobertura**, **Normas** y **Notas de la versión.**
- **Propuesta de la IA como diff:** texto añadido en verde y quitado en rojo, con «Aceptar campo», «Aceptar todo» (secundario) y «Descartar». «Gana / Pierde» va dentro de la propuesta. La marca detectada solo aparece como aviso en línea.
- **`lib/`:**
  - `lib/word-diff.ts`: diff LCS por palabras.
  - `phraseRanges(text, phrase)` en `lib/metadata-check.ts`: posiciones sobre el texto original, reutilizando `foldWithMap` de `policy-check`.
  - `Issue` gana `field` y `ranges`. Hay que adaptar las reglas de `policy-check.ts` de forma progresiva: primero las de texto (promoción, emojis, mayúsculas y otras marcas) y después las de densidad.
  - Tests de todo lo anterior.
- **Aceptación:**
  - La vista previa reproduce la ficha de Play con icono, título, descripción corta y 3 capturas.
  - La propuesta se acepta campo a campo desde el diff.
  - Al pulsar una keyword de Cobertura se resalta en el texto.

### Fase 31 · Mercado
- **Competidores:**
  - gráfico de áreas o líneas con un máximo de 5 series más «Otros», con «tu app» en `--series-own`; con un solo punto, barras horizontales;
  - tabla con la cuota como barra dentro de la fila y el interruptor «Vigilar»;
  - panel del competidor (ficha, cambios, keywords compartidas y «Analizar reseñas»);
  - línea de tiempo de cambios.
- **Reseñas:**
  - columna de fuentes (tu app y los competidores), con valoración y fecha del último análisis;
  - análisis en tarjetas, con «Ideas para tu ficha» destacadas;
  - «Lo que pide la categoría» en la cabecera;
  - el país sale del mercado activo y desaparece `CountrySelect`.
  - El punto de «reseñas nuevas» lo calcula un paso nuevo del cron (`lib/review-freshness.ts`): una petición por fuente y día, guardada en una tabla o columna nueva.
- **Tendencias:**
  - escala secuencial de un solo tono;
  - filas sin datos plegadas;
  - tarjetas de «Próximos picos» con la lista de `nextSeason`;
  - el botón «Preparar» crea una anotación y abre el editor con el enfoque estacional, sin borrador nuevo.
- **Aceptación:**
  - Reseñas sin selector de país.
  - Competidores con barras en fila.
  - Tendencias con las filas vacías plegadas.

### Fase 32 · Creativos y Cambios
- **Creativos:**
  - Tres zonas: miniaturas que se reordenan, lienzo con zoom e inspector plegable (Texto, Captura, Dispositivo, Estilo y Fondo), más la barra superior.
  - `screenshot-studio.tsx` tiene 1.684 líneas: dividirlo en componentes **antes** de reorganizar, sin cambiar su comportamiento.
  - Las plantillas pasan a un diálogo visual.
  - **H23:** los fondos de la IA en una sección aparte, y aviso antes de que una plantilla pise los colores propios.
  - En móvil, aviso «Mejor en un ordenador», pero se puede usar.
- **Cambios y pruebas:**
  - Línea de tiempo vertical con los cambios detectados y los manuales, y el impacto agregado de cada entrada con `aggregateImpact`.
  - Experimentos en tres columnas: Planeado, En marcha y Terminado.
- **Aceptación:**
  - Inspector plegable y miniaturas que se reordenan arrastrando.
  - Cambios en línea de tiempo con impacto.
  - Las plantillas no pisan los colores sin confirmar.

### Fase 33 · Pulido y móvil
- **Producto en Ajustes de la app:** funciones en tarjetas con chips de estado, edición en un panel lateral, CHANGELOG en un diálogo y el aviso de lo que ve la IA. Así se resuelve D7, el formulario de 25 filas.
- **Estados:**
  - estados vacíos con una acción;
  - esqueletos con la forma de cada pantalla;
  - operaciones largas de la IA con progreso por pasos, la posibilidad de seguir navegando y un toast de «Ver resultado».
- **Textos:** repaso de todos. Los párrafos explicativos pasan a `HelpTip` o al README.
- **Prueba final:** Playwright recorre todas las rutas a 390 y 1440 px, con axe en las principales.
- **Aceptación:**
  - 0 rutas con `scrollWidth > innerWidth`.
  - Ningún párrafo explicativo de más de 2 líneas fuera de `HelpTip` o de un estado vacío.
  - Axe sin errores de nivel AA.

**Orden:** 25 → 26 → 27 → 28 → 29 → 30, y después 26b, 31, 32 y 33.
- La 26b puede ir en cualquier momento después de la 27.
- La 25 y la 26 son independientes y se pueden hacer en paralelo, cada una en su propia rama.

---

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambiar los valores de los tokens rompe el contraste de pantallas que no se tocan hasta fases posteriores | En la fase 25, axe y revisión visual de todas las rutas actuales, no solo de `/dev/ui` |
| Las rutas nuevas y las antiguas conviven y se desincronizan | Los contenidos se extraen a componentes compartidos. Las rutas antiguas solo redirigen desde la fase 27 |
| El Inicio se vuelve lento con muchas apps | Consulta agregada única, salud por fila con Suspense y sin llamadas a las tiendas |
| La popularidad de candidatas provoca errores 429 de Play | Estimación sin peticiones nuevas; la medición real, bajo demanda y con tope |
| Romper Creativos al reorganizar | Dividir primero sin cambiar el comportamiento, con una prueba de Playwright que exporte un ZIP |
| La migración 0019 sobre producción | Solo añade. Probarla antes en una rama de Neon y comprobar después el número de productos |

## 5. Verificación en cada fase
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y, desde la fase 25, `npm run test:e2e`, todo en verde.
2. Las migraciones se prueban en una rama de Neon con los datos reales antes de producción, y nunca se ejecuta `db:migrate` contra producción sin el visto bueno del dueño.
3. Recorrido manual con las capturas de `docs/rediseno/actual/` al lado, para comparar el antes y el después.
4. Una revisión de código independiente por fase, hasta que salga sin defectos.

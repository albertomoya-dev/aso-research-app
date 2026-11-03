# Rankeo — Rediseño de organización y experiencia (v2 de la interfaz)

Revisión hecha el 03-11-2026 sobre producción (`abac20d`). El trabajo se hizo en tres pasos:
1. Usar Rankeo durante tres días para preparar de verdad la ficha de una app real, «Recordatorio pastillas y toma», en España y en EE. UU.
2. Capturar todas las pantallas en escritorio (1440 px) y en móvil (390 px).
3. Compararlas con productos de referencia.

Las capturas están en `docs/rediseno/actual/` y las referencias en `docs/rediseno/referencias/`. La maqueta navegable de la propuesta está en el artifact enlazado en el chat del dueño. Este documento es el que manda; la maqueta solo lo ilustra.

**Para quién es:** el agente o desarrollador que implemente el rediseño. No cambia la lógica de negocio (`lib/`), solo la organización, la navegación y la capa visual (`app/`, `components/`, `globals.css`, `DESIGN.md`). Los errores funcionales están aparte, en `ERRORES_REVISION_2026-10-30.md`.

---

## 1. Feedback de producto (resumen para el dueño)

### Lo que Rankeo ya hace mejor que muchas herramientas de pago
- **Ficha de producto como fuente de verdad para la IA.** Ninguna herramienta de ASO que conozca separa «lo que la app hace» de «lo que dice la ficha publicada». Es la base de todo lo demás: ideas, optimizador, creativos y reseñas salieron alineados con la v3 real.
- **Reseñas de la competencia convertidas en argumentos.** Descubrir que el 35 % de las reseñas recientes de Medisafe eran quejas por la suscripción definió el posicionamiento de toda la ficha. Es la función con más valor por clic.
- **Optimizador con candado.** Antes de aceptar la propuesta se ve qué keywords se ganan y cuáles se pierden, con la cobertura antes y después.
- **Creativos de principio a fin.** Las capturas con keyword por pantalla, el fondo con IA y la exportación en ZIP quitan la necesidad de usar Figma o AppLaunchpad.
- **Coste:** todo esto con una sola contraseña, sin cuentas ni suscripción.

### Lo que le falta como producto
- **Un sitio que diga «qué hago hoy».** La información está, pero repartida entre 11 pestañas y 4 páginas globales. Hay que cruzarla a mano.
- **Ver el efecto de los cambios.** Ya existen las anotaciones y la comparación de 14 días, pero quedan escondidas en la pestaña «Cambios». El gráfico de visibilidad debería mostrar las anotaciones encima.
- **Un modelo de «app» completo.** Hoy cada país es una app distinta: la misma app aparece dos veces en la barra lateral («Pill Reminder & Med Tracker» y «Recordatorio pastillas y toma»), y la ficha de producto hubo que copiarla a mano.
- **Un aspecto de producto terminado.** Las pantallas son correctas una por una, pero el conjunto se lee como un panel interno. Los motivos están en la sección 2.

---

## 2. Diagnóstico

Cada punto lleva la evidencia (captura o medición) y el efecto que tiene en el uso.

| # | Problema | Evidencia | Efecto |
|---|---|---|---|
| D1 | **Una app por país.** Cada mercado es una «app» independiente, con su propia ficha de producto, creativos y keywords. | En la barra lateral salen «Pill Reminder & Med Tracker» (US) y «Recordatorio pastillas y toma» (ES), que son la misma app. Hubo que copiar la ficha de producto de la app 1 a la 4. | Datos duplicados, la IA desincronizada entre países, y el H12 («Adaptar» sin datos del mercado). |
| D2 | **11 pestañas planas sin orden de trabajo.** Keywords, Descubrir, Ideas con IA, Keywords del TOP 10, Reseñas, Competidores, Estacionalidad, Cambios, Producto, Editor de ficha y Creativos, todas al mismo nivel. | `actual/app_keywords.png`. A 1440 px la barra de pestañas mide 1556 px y provoca scroll horizontal en toda la página. | No se sabe por dónde empezar. Investigar, vigilar y crear están mezclados, y tres pestañas hacen casi lo mismo (buscar keywords nuevas). |
| D3 | **No hay portada de la app.** La pestaña Keywords hace de inicio y apila 7 bloques: Salud ASO, Carga manual, la tabla, el CSV de Play Console, Otros países (selector de 60 países), los metadatos publicados y las capturas. | En móvil esa página mide **9.373 px** de alto y tiene **106 botones y 290 campos**. | El elemento principal, la tabla de keywords, queda debajo de la carga manual. Lo importante y lo ocasional pesan igual. |
| D4 | **El panel global no informa.** Cada tarjeta muestra «52 keywords · España» y nada más. | `actual/panel.png` | Para saber cómo va cada app hay que entrar en ella. No hay tendencia, visibilidad ni avisos. |
| D5 | **Dos páginas para la misma actividad.** «Novedades» y «Resumen semanal» cuentan lo mismo con distinto periodo. | `actual/novedades.png`, `actual/resumen_semanal.png` | Hay que mirar dos sitios. |
| D6 | **Un manual en cada pantalla.** Casi todas empiezan con un párrafo de 2 a 4 líneas explicando el cálculo. Las tablas terminan con otro párrafo de 8 líneas (el de Keywords explica popularidad, dificultad, oportunidad, relevancia y TOP 5). | Ver cualquier pestaña. | Ruido visual constante. El usuario experto no lo necesita y el nuevo no lo lee. |
| D7 | **Formularios tipo hoja de cálculo.** En Producto, cada función es una fila con 6 campos más Guardar y Quitar (25 filas). En el Editor, la descripción de 4.000 caracteres se escribe en un cuadro de unas 8 líneas. | `actual/producto.png`, `actual/editor_ficha.png` | Editar parece trabajo administrativo, y los cambios sin guardar de una fila se pierden. |
| D8 | **Lo secundario tapa lo principal.** En el Editor, la columna derecha la ocupa «Marcas detectadas», con 40 filas y un botón «No es una marca» en cada una, por encima de la cobertura de keywords. | `actual/editor_ficha.png` | El panel útil, la cobertura, queda fuera de la vista. |
| D9 | **Acción destructiva al lado de las frecuentes.** «Dejar de seguir» está junto a «Actualizar posiciones» y «Actualizar ficha», con el mismo peso visual. | Cabecera de cualquier app | Riesgo de borrar el seguimiento por error. |
| D10 | **El móvil no funciona.** Hay scroll horizontal en 5 pantallas. | Keywords 1315 px, Competidores 680, Estacionalidad 672, Ideas 664 y Creativos 515, sobre un ancho de 390. Producto mide 11.192 px de alto. | En móvil no se puede consultar ni lo básico, como ver una posición. |
| D11 | **«Ajustes» es una página de desarrollador.** Enseña variables de entorno (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ASC_ISSUER_ID`…) y remite al README. | `actual/ajustes.png` | Para el dueño es una pantalla técnica que no sabe qué hacer con ella. |
| D12 | **Aspecto genérico y plano.** Es un clon de Linear oscuro (`#08090a`) con todo el texto entre 12 y 14 px, la misma tarjeta para todo y ninguna cifra grande. Los gráficos casi no tienen datos. | Todas | No hay jerarquía: todo pesa lo mismo y nada destaca. Por eso «se ve poco profesional». |
| D13 | **Selectores enormes y repetidos.** El selector de 60 países aparece en Keywords (Otros países), Reseñas (País) y Editor (Ficha personalizada por país), y el de 70 idiomas en el Editor. | `inputs` = 290 en Keywords | Formularios largos para algo que casi siempre es «España» o «EE. UU.». |

---

## 3. Principios del rediseño

1. **La app es la unidad y los mercados son una dimensión.** Una app tiene ficha de producto, creativos base y uno o varios mercados (país e idioma). Las keywords, las posiciones y la ficha de la tienda son de cada mercado. Un selector de mercado fijo en la cabecera cambia todo a la vez.
2. **Navegar siguiendo el trabajo de ASO:** ver cómo va, investigar, vigilar a la competencia, optimizar y medir. Es el orden en que lo usé estos tres días.
3. **Resumen antes que detalle.** Cada nivel abre con lo que hay que saber: el Inicio global, el Resumen de la app y la cabecera de cada pantalla con 3 o 4 cifras.
4. **Explicar solo cuando se pide.** Los párrafos pasan a tooltips «?» junto al título de la columna, o a estados vacíos con un botón de acción.
5. **Una acción principal por pantalla.** Las acciones ocasionales van a un menú «⋯» y las destructivas a Ajustes de la app.
6. **Editar en paneles, no en filas.** Al pulsar una fila se abre un panel lateral (drawer) con el detalle y la edición. La tabla queda limpia.
7. **Funciona en móvil.** La consulta tiene que ir bien en móvil: posiciones, actividad y resumen. La edición pesada (editor, creativos) puede pedir escritorio, pero sin romperse.

---

## 4. Nueva arquitectura de información

```
Rankeo
├── Inicio                      (antes «Panel»: todas las apps con KPIs + «Qué hacer hoy»)
├── Actividad                   (fusiona Novedades + Resumen semanal; filtro por app y periodo)
├── [Selector de app ▾] [Mercado ▾]  ← cabecera fija dentro de una app
│   ├── Resumen                 (NUEVO: KPIs, visibilidad con anotaciones, salud ASO como lista de tareas, movimientos)
│   ├── KEYWORDS
│   │   ├── Seguimiento         (la tabla; antes «Keywords»)
│   │   └── Encontrar           (fusiona Descubrir + Ideas con IA + Keywords del TOP 10, como 3 fuentes)
│   ├── MERCADO
│   │   ├── Competidores        (cuota de visibilidad + fichas vigiladas + cambios de sus fichas)
│   │   ├── Reseñas             (tu app y competidores; «Lo que piden en la categoría»)
│   │   └── Tendencias          (antes «Estacionalidad»)
│   ├── OPTIMIZAR
│   │   ├── Ficha de la tienda  (antes «Editor de ficha»: textos por idioma, normas, cobertura, notas de la versión)
│   │   ├── Creativos           (capturas, icono, logo, vídeo)
│   │   └── Cambios y pruebas   (anotaciones + experimentos; antes «Cambios»)
│   └── Ajustes de la app       (ficha de producto, mercados, marcas excluidas, términos de Play Console, dejar de seguir)
├── Buscar app                  (pasa al botón «+ Añadir app» y a la paleta ⌘K)
└── Integraciones               (antes «Ajustes»: tarjetas con «Conectar» y estado; las variables, en un desplegable técnico)
```

**Cambios clave:**
- **«Producto»** sale de las pestañas y pasa a **Ajustes de la app → Producto**. Se rellena una vez y se consulta poco. El Resumen avisa si está vacía o desfasada; esa alerta ya existe en Salud ASO.
- **«Carga manual»**, **«Otros países»**, **«CSV de Play Console»** y **«Metadatos publicados»** salen de la pantalla de keywords:
  - Carga manual → botón «Añadir keywords», que abre un diálogo.
  - Otros países → Ajustes de la app → Mercados.
  - CSV de Play Console → Ajustes de la app → Datos de Play Console. Sus cifras se muestran como columna en la tabla.
  - Metadatos publicados → Ficha de la tienda, en la vista «Publicada».
- **Dentro de una app, la navegación pasa a la barra lateral**, como en Appfigures (ver `referencias/appfigures_2.png`). Al entrar en una app, la barra lateral global se convierte en la de la app, con los 4 grupos de arriba y un enlace «← Todas las apps». Las pestañas horizontales desaparecen.
- **Paleta de comandos ⌘K** para saltar a una app o una keyword y lanzar acciones como «Actualizar posiciones», «Optimizar ficha» o «Generar ideas».

### Modelo de datos
- Nueva tabla `markets (id, app_id, country, locale, store_id_override?)`. `app_keywords`, `ranks`, `listing_drafts`, la ficha publicada y los términos de Play Console cuelgan de `market_id`.
- `product_facts`, `product_features`, `product_releases`, `brand_exceptions`, `creative_designs` y `generated_assets` quedan en `app_id`.
- **Migración:** fusionar las apps con el mismo `store_id` y la misma tienda. Las apps 1 y 4 pasan a ser una sola app con los mercados ES y US.
- **URLs:**
  - `/apps/[appId]` → `/a/[slug]/[market]`, por ejemplo `/a/recordatorio/es`.
  - `/apps/[id]/metadata` → `/a/recordatorio/es/ficha`.
  - Mantener redirecciones 308 desde las rutas antiguas (ver sección 8).

---

## 5. Navegación y cabecera

### Barra lateral global (fuera de una app)
- Arriba, el logo de Rankeo con un selector de app (combobox con búsqueda y los iconos de las apps). Va en el lugar que hoy ocupa la lista «Mis apps».
- Debajo: **Inicio**, **Actividad** (con contador de no leídos), **Integraciones**.
- Al pie: el cambio de tema y la versión.
- En móvil: barra inferior con Inicio, Actividad, Apps y Más.

### Dentro de una app
- **Cabecera fija de 56 px:**
  - icono y nombre de la app;
  - chip de tienda;
  - selector de mercado (`🇪🇸 España · es-ES ▾`);
  - a la derecha, la fecha «Posiciones del 3 nov», el botón principal **Actualizar posiciones** y el menú `⋯` con Actualizar ficha, Ver en Google Play y Ajustes de la app.
- **«Dejar de seguir» desaparece de la cabecera** y pasa a Ajustes de la app, dentro de una «Zona de peligro» con confirmación escribiendo el nombre.
- **Barra lateral de la app:** Resumen; los grupos KEYWORDS, MERCADO y OPTIMIZAR con sus entradas; Ajustes de la app al pie. Cada entrada puede llevar un contador o un punto de estado: «Reseñas · 3 nuevas», «Ficha · 1 aviso», «Encontrar · 38 ideas pendientes».

---

## 6. Pantalla a pantalla

### 6.1 Inicio (todas las apps)
- **Franja de KPIs del conjunto**, al estilo Plausible (`referencias/plausible_demo.png`). Cifra grande con el cambio de la semana debajo:
  - keywords en el TOP 10;
  - keywords en el TOP 30;
  - cuota de visibilidad media;
  - avisos sin leer.
- **Tabla de apps**, una fila por app y mercado. Columnas:
  - icono y nombre;
  - mercado;
  - mini-gráfico de visibilidad a 30 días;
  - TOP 10 (con su cambio);
  - TOP 30;
  - posición media de las 5 keywords principales;
  - valoración;
  - estado de salud (puntos de colores, como en Salud ASO).

  Al pulsar una fila se abre el Resumen de esa app.
- **«Qué hacer hoy»:** de 3 a 5 tareas con prioridad, sacadas de Salud ASO, alertas y estacionalidad. Por ejemplo: «Recordatorio · Tu ficha describe la 2.0.0 y ya publicaste la 3.0.1 → Actualizar ficha», o «Recordatorio · "pastillero" entra en temporada en 4 semanas → Preparar».
- **Estado vacío** (sin apps): un buscador grande «Busca tu app por nombre o enlace de Google Play».

### 6.2 Resumen de la app (nuevo)
1. **KPIs**, en una fila de 4:
   - Visibilidad (cuota en el TOP 5, con su cambio);
   - Keywords en el TOP 10 (cambio);
   - Keywords en el TOP 30 (cambio);
   - Valoración y número de valoraciones.
2. **Gráfico de visibilidad a 30, 90 o 180 días**, con las anotaciones de Cambios como marcas verticales con icono. Por ejemplo, el 30 oct: «Ficha v3 publicada». Al pasar el ratón se ve el impacto a 14 días que ya calcula la pestaña Cambios. Esto conecta «hice X» con «pasó Y», que es la pregunta central del ASO.
3. **Próximos pasos.** La Salud ASO actual convertida en lista de tareas, ordenada por gravedad, con una acción cada una («Abrir editor», «Revisar 2 keywords»). Las que están bien se pliegan en «4 en orden».
4. **Movimientos:**
   - dos listas, «Suben» y «Bajan», con la keyword, la posición anterior → la actual y la flecha;
   - la lista «Nuevos nº 1 donde compites».

   Sustituye a la tarjeta del Resumen semanal de esta app.
5. **Competencia en 1 línea:** «MyTherapy 33 % · Medisafe 15 % · Tú 3 %» como barra apilada, con enlace a Competidores.

### 6.3 Keywords → Seguimiento (la tabla)
**Barra de herramientas**, al estilo de shadcn Tasks (`referencias/shadcn_tasks.png`):
- buscador de texto;
- filtros por facetas en chips desplegables: Estado (TOP 10, Al alcance, Bajando, Fuera), Relevancia, Origen (Manual, IA, Reseñas, TOP 10), Dificultad;
- un botón «Vistas» para elegir columnas y densidad;
- un botón principal **«+ Añadir keywords»**, que abre un diálogo con pestañas «Escribir» y «Pegar CSV».

**Columnas por defecto:**
- Keyword: el término, con una etiqueta pequeña de origen en gris y la relevancia en puntos (●●●●○).
- Posición: una insignia (#14) con la variación coloreada a su lado (▲3).
- Evolución 30 días: mini-gráfico.
- Popularidad: barra más número.
- Dificultad: número y color.
- Oportunidad: número en negrita; es la columna por la que se ordena.
- TOP 5: avatares superpuestos.

Columnas opcionales: Variación 7 días, Visitantes de Play (CSV), Relevancia editable.

**Comportamiento de la tabla:**
- Cabecera fija y números con cifras tabulares alineados a la derecha.
- Filas de 44 px en vista cómoda y 36 px en compacta.
- **Al pulsar una fila se abre un panel lateral de 480 px**, con:
  - el gráfico de posición a 90 días, con las anotaciones;
  - el TOP 10 actual, con el borde de «tu app» y de los competidores;
  - la relevancia editable;
  - la intención;
  - «Dónde aparece en tu ficha» (título, descripción corta…);
  - las acciones «Analizar TOP 10» y «Quitar».

  Hoy todo esto exige ir a `/keywords/[id]`. La página puede seguir existiendo para enlaces directos.
- **Selección múltiple:** al marcar filas aparece una barra flotante abajo con «Cambiar relevancia», «Recalcular con IA», «Exportar» y «Quitar».
- **Leyenda:** el párrafo explicativo desaparece. Cada cabecera de columna lleva un icono «?» con su definición, y la leyenda de colores del TOP 5 va al menú «Vistas».
- **En móvil:** no se muestra tabla, sino una lista con una tarjeta por keyword (término, posición con su variación y mini-gráfico; la oportunidad a la derecha). Los filtros se abren en una hoja inferior.

### 6.4 Keywords → Encontrar
Una sola pantalla con un campo **«Semilla o tema»** y **3 fuentes en pestañas**: **Autocompletado** (hoy «Descubrir»), **Ideas con IA** e **Inspirarse en el TOP 10**.
- Todas devuelven la **misma lista de candidatas**, con:
  - keyword y fuente;
  - relevancia estimada;
  - popularidad, que hoy solo se calcula después de seguirla y debería calcularse antes;
  - el porqué;
  - una casilla.

  El botón «Seguir N» y el «Descartar» se comportan igual en las tres.
- Las ideas pendientes quedan en una bandeja con contador, y el «Descartar todas» tiene que funcionar. Comprobado el 03-11: siguen apareciendo las 38 ideas antiguas.
- Las keywords que vienen de Reseñas («Palabras que usan los usuarios») también llegan aquí, con la fuente «Reseñas».

### 6.5 Mercado → Competidores
- **Gráfico de cuota de visibilidad**, de áreas apiladas o líneas, con un máximo de 5 series y el resto en «Otros». Si solo hay un punto de datos, mostrar barras horizontales en lugar de un gráfico de líneas vacío.
- **Tabla de competidores:**
  - app;
  - cuota, con barra dentro de la fila (estilo Plausible);
  - keywords en el TOP 5;
  - mejor posición;
  - valoración;
  - un interruptor «Vigilar».

  Al pulsar una fila, un panel muestra su ficha, el historial de cambios, sus keywords compartidas contigo y el botón «Analizar reseñas».
- **«Cambios en fichas vigiladas»** como línea de tiempo debajo, no como lista aparte.

### 6.6 Mercado → Reseñas
- **Columna izquierda:** lista de fuentes, tu app arriba y los competidores vigilados debajo. Cada una con su valoración, la fecha del último análisis y un punto si hay reseñas nuevas.
- **Zona principal:** el análisis en tarjetas.
  - Resumen.
  - Temas, cada uno con un chip de sentimiento y una barra de porcentaje.
  - Quejas.
  - Peticiones.
  - **Ideas para tu ficha.** Destacada visualmente, porque es lo que más valor aporta.
  - Palabras de los usuarios, con el botón «Seguir».
- **«Lo que pide la categoría»** pasa a la cabecera de Reseñas, con dos columnas: «Ya lo resuelves → cuéntalo» y «Oportunidades».
- El país se toma del mercado activo. El selector de 60 países desaparece.

### 6.7 Mercado → Tendencias
- **Mapa de calor de 12 meses por keyword.** La matriz actual está bien, pero hay que reducir el color a una escala secuencial de un tono y ocultar las filas «sin datos» tras «Mostrar 28 sin datos».
- **Arriba, «Próximos picos»** en tarjetas: keyword, mes, «empieza en N semanas» y la acción «Preparar ficha estacional», que crea una anotación y un borrador.

### 6.8 Optimizar → Ficha de la tienda (antes Editor)
**Diseño en tres zonas:**
1. **Barra superior.** Selector de idioma, que muestra solo los idiomas del mercado y los que ya tienen borrador; el resto se añade con «+ Añadir idioma». A su lado, un conmutador **Publicada | Borrador | Comparar** y las acciones «Optimizar con IA» (principal), «Adaptar a…» y «Guardar».
2. **Editor (60 %).**
   - Campos grandes: el título en tamaño 20 px y la descripción a toda altura, con autoajuste.
   - Contador de caracteres en cada campo, con una barra que se vuelve ámbar al 90 % y roja al pasarse.
   - Las keywords cubiertas, subrayadas en el texto con un color suave.
   - Los avisos de normas, subrayados en ondulado rojo sobre la palabra concreta, como un corrector ortográfico.
3. **Panel derecho (40 %), con pestañas:**
   - **Vista previa:** la ficha tal como se ve en Google Play móvil (icono, título, descripción corta, capturas). Es el estándar del sector y hoy no existe.
   - **Cobertura:** lista de keywords con «En título», «En descripción corta», «Solo palabras sueltas» y «Falta». Al pulsar una keyword se resalta en el texto.
   - **Normas:** los avisos, con enlace a la norma oficial.
   - **Notas de la versión:** el generador actual.

**Cambios respecto a hoy:**
- **Propuesta de la IA como diff.** Se muestra encima del editor, con el texto añadido en verde y el quitado en rojo, y botones «Aceptar campo», «Aceptar todo» y «Descartar». El bloque «Construida alrededor de», «Gana» y «Pierde» va dentro de la propia propuesta.
- **«Marcas detectadas»** sale del editor y pasa a Ajustes de la app → Marcas. En el editor solo aparece un aviso si el texto contiene una marca.

### 6.9 Optimizar → Creativos
La pantalla actual funciona. Hay que reordenar el espacio como un editor de diseño:
- **Izquierda (200 px):** miniaturas de las pantallas en vertical, que se pueden reordenar arrastrando, y «+ Añadir pantalla».
- **Centro:** el lienzo grande de la pantalla seleccionada, con zoom.
- **Derecha (320 px):** inspector en secciones plegables:
  - Texto: titular, subtítulo, keyword y la IA.
  - Captura: subir, modo y recorte.
  - Dispositivo.
  - Estilo: plantilla, colores y botón «Usar colores de la app» (H20).
  - Fondo: liso, degradado o IA.
- **Barra superior:** dispositivo y tamaño, «Vista del set completo», «Guardar» y «Descargar ZIP».
- Las plantillas pasan a un selector visual en un diálogo. Hoy ocupan media columna fija.
- Las propuestas de fondo de la IA van separadas de las plantillas (H23).

### 6.10 Optimizar → Cambios y pruebas
- **Línea de tiempo vertical** con dos tipos de entrada:
  - detectados: ficha, versión, icono, capturas;
  - manuales: campañas, prensa.

  Cada entrada lleva al lado su impacto a 14 días: «12 keywords afectadas · posición media 23 → 18 ▲».
- **Experimentos** como tarjetas en tres columnas: Planeado, En marcha y Terminado.

### 6.11 Ajustes de la app
Pestañas:
- **Producto:** la ficha de producto.
  - Las funciones se muestran como lista de tarjetas con chips de estado (Publicada, Próxima versión, Planeada, Retirada) y se editan en un panel lateral.
  - «Importar desde CHANGELOG» se abre en un diálogo.
  - Arriba, un aviso de lo que la IA ve: «La IA anuncia 25 funciones; 20 son de la 3.0.0».
- **Mercados:** lista de mercados con «+ Añadir mercado» (país, idioma y si se copian las keywords).
- **Marcas:** las detectadas y las excepciones.
- **Datos de Play Console:** el CSV de términos de búsqueda.
- **Zona de peligro:** «Dejar de seguir esta app».

### 6.12 Actividad (fusiona Novedades y Resumen semanal)
- **Filtros:** Periodo (Hoy, 7 días, 30 días), App y Tipo (Posición, Competidor, Ficha, Alerta).
- **Cabecera:** el resumen de la semana con los KPIs por app. Es la tabla del Resumen semanal actual, más compacta.
- **Debajo:** el flujo de eventos agrupado por día, con iconos por tipo y «Marcar como leído».
- «Qué avisos quieres recibir» va a un diálogo desde el icono de engranaje.

### 6.13 Integraciones (antes Ajustes)
- **Tarjetas con logo y estado:** Claude, Google Play Console, App Store Connect, OpenAI o Gemini, Resend y Cron.
  - Estado «Conectado»: muestra el botón «Probar».
  - Estado «Sin configurar»: muestra «Cómo conectar», que abre un panel con los pasos numerados y el nombre de la variable que hay que copiar en Vercel.
- **Las variables de entorno** pasan a un desplegable «Detalles técnicos» dentro de cada tarjeta.

---

## 7. Sistema visual

El actual es un clon de Linear oscuro, y por eso se ve genérico. La propuesta tiene personalidad propia, sigue siendo sobria y es **clara por defecto**: las herramientas de análisis que se usan a diario y con tablas (Plausible, Appfigures, AppTweak) son claras. El tema oscuro se mantiene como opción.

### 7.1 Tokens

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#F6F7F9` | `#0E1013` | Fondo de la aplicación |
| `--surface` | `#FFFFFF` | `#16191E` | Tarjetas, tablas, paneles |
| `--surface-2` | `#F0F2F5` | `#1D2127` | Cabeceras de tabla, hover, inputs |
| `--line` | `#E3E6EB` | `#2A2F37` | Bordes |
| `--ink` | `#14171C` | `#ECEFF3` | Texto principal |
| `--ink-2` | `#5B6370` | `#9AA3AF` | Texto secundario (AA sobre `--surface`) |
| `--brand` | `#3B5BDB` | `#7B93FF` | Acento: acción principal, selección, serie «tu app» |
| `--brand-soft` | `#EAEEFD` | `#1E2647` | Fondos de selección |
| `--up` / `--down` | `#12805C` / `#C2362B` | `#3DD68C` / `#FF6B5F` | Variaciones (siempre con ▲▼, no solo color) |
| `--warn` | `#B26A00` | `#F5B54A` | Avisos |

**Series de gráficos.** Se mantienen `--series-1…5`, ya validadas para daltonismo. «Tu app» siempre usa `--brand`, y los competidores usan las series en orden fijo, con el mismo color en toda la app.

### 7.2 Tipografía
- **Fuente:** se mantiene **Inter** para la interfaz, con `font-feature-settings: "tnum", "cv11"` (cifras tabulares). Las cifras grandes de los KPIs van en **Inter Display**, o Inter con `letter-spacing: -0.02em`.
- **Escala:** 12 (etiquetas) · 13 (tablas) · 14 (texto) · 16 (títulos de tarjeta) · 20 (título de página) · 28/32 (cifras KPI).
- **Monoespaciada:** JetBrains Mono, solo para nombres de variables, valores técnicos y contadores de caracteres.

### 7.3 Componentes
Base recomendada: **shadcn/ui** (Radix + Tailwind 4) para Dialog, Sheet (paneles laterales), Popover, Command (⌘K), DropdownMenu, Tabs, Tooltip y Toast. Para los gráficos, **Tremor** (Recharts por debajo, que Rankeo ya usa): AreaChart, BarList, SparkAreaChart, Tracker y BadgeDelta. Ver `referencias/tremor_2.png` y `referencias/shadcn_tasks.png`.

Componentes que hay que crear o unificar:
- `KpiCard`: etiqueta, cifra grande, variación y mini-gráfico.
- `DeltaBadge`: ▲3 en verde, ▼2 en rojo, «=» en gris, y «Entra» o «Sale» para las entradas y salidas del ranking.
- `RankBadge`: #14, «>30» en gris, y el estado «Al alcance» como borde de color.
- `DataTable`: barra de herramientas, filtros por facetas, columnas configurables, selección con barra de acciones, cabecera fija y versión en tarjetas para móvil.
- `DetailSheet`: el panel lateral de detalle.
- `EmptyState`: icono, título, una frase y un botón. Sustituye a los párrafos.
- `HelpTip`: el icono «?» con tooltip.
- `PageHeader`: título, una línea de contexto opcional y las acciones (principal más ⋯).
- `StatusDot`: los colores de Salud ASO, siempre con texto al lado.

### 7.4 Densidad, espaciado y superficies
- **Rejilla:** de 4 px. El contenido llega a 1280 px de ancho como máximo, salvo las tablas, que ocupan todo.
- **Agrupación:** tarjetas solo para agrupar. Las tablas van sobre la propia superficie, sin tarjeta dentro de tarjeta.
- **Radios:** 10 px en tarjetas, 8 px en controles y 999 px en chips.
- **Sombras:** solo en los elementos que flotan (paneles laterales, diálogos y menús).

### 7.5 Estados y mensajes
- **Carga:** esqueletos con la forma real del contenido. Ya existe `page-skeleton`, pero tiene que adoptar la forma de cada pantalla.
- **Operaciones largas de IA** (20 a 60 s): progreso con pasos («Leyendo 300 reseñas… Analizando temas… Listo») y la posibilidad de seguir navegando. Al terminar, un toast con «Ver resultado».
- **Textos de la interfaz:** en segunda persona y cortos. Todo el texto explicativo actual pasa a `HelpTip`, o al README si es documentación.

### 7.6 Responsive
- **Puntos de corte:** <640 móvil, 640–1024 tablet y ≥1024 escritorio.
- **Barra lateral:** en tablet se pliega a iconos y en móvil pasa a barra inferior.
- **Tablas:** en móvil se convierten en listas de tarjetas.
- **Editor y Creativos:** en móvil se apilan las zonas. Creativos muestra el aviso «Mejor en un ordenador», pero se puede usar.
- **Criterio:** nunca scroll horizontal del `body`. Hay que verificarlo con Playwright a 390 px en todas las rutas (ver la sección 9).

---

## 8. Rutas antiguas → nuevas

| Antes | Después |
|---|---|
| `/` | `/` (Inicio) |
| `/novedades`, `/resumen` | `/actividad` (y `/actividad?vista=semana`) |
| `/ajustes` | `/integraciones` |
| `/buscar` | `/apps/nueva` (y ⌘K) |
| `/apps/[id]` | `/a/[app]/[mercado]/keywords` |
| — | `/a/[app]/[mercado]` (Resumen, nuevo) |
| `/apps/[id]/descubrir`, `/ideas`, `/top10` | `/a/[app]/[mercado]/encontrar?fuente=autocompletado\|ia\|top10` |
| `/apps/[id]/competidores` | `/a/[app]/[mercado]/competidores` |
| `/apps/[id]/resenas` | `/a/[app]/[mercado]/resenas` |
| `/apps/[id]/estacionalidad` | `/a/[app]/[mercado]/tendencias` |
| `/apps/[id]/metadata` | `/a/[app]/[mercado]/ficha` |
| `/apps/[id]/creativos` | `/a/[app]/creativos` (el diseño es de la app; el idioma de los textos se elige dentro) |
| `/apps/[id]/cambios` | `/a/[app]/[mercado]/cambios` |
| `/apps/[id]/producto` | `/a/[app]/ajustes/producto` |
| `/apps/[id]/keywords/[kid]` | `/a/[app]/[mercado]/keywords?k=[kid]` (abre el panel) |

Todas las rutas antiguas devuelven una redirección 308 durante al menos 3 meses.

---

## 9. Plan por fases

Numeración a continuación de las fases 13–24.

| Fase | Contenido | Depende de | Criterio de aceptación |
|---|---|---|---|
| **25 · Sistema visual** | Tokens de 7.1 (tema claro por defecto), tipografía, componentes base de 7.3 (shadcn + Tremor), `DESIGN.md` reescrito | — | Página `/dev/ui` (solo en desarrollo) con todos los componentes en claro y oscuro. Contraste AA comprobado con axe en ambos temas. |
| **26 · Modelo app → mercados** | Tabla `markets`, migración que fusiona apps con el mismo `store_id`, consultas por `market_id`, nuevas URLs y redirecciones 308 | — | Las apps 1 y 4 se ven como una app con mercados ES y US. Todos los tests verdes y un test de migración con datos de ejemplo. |
| **27 · Navegación** | Barra lateral global y de app, cabecera con selector de mercado, ⌘K, Actividad (fusión), Integraciones, Ajustes de la app con zona de peligro | 25, 26 | Ninguna pestaña horizontal. «Dejar de seguir» solo en la zona de peligro. Sin scroll horizontal a 1440 ni a 390 px. |
| **28 · Inicio y Resumen** | 6.1 y 6.2, con anotaciones en el gráfico de visibilidad y «Qué hacer hoy» | 27 | Con los datos de producción, el Resumen de la app 1 muestra la anotación del 30 oct y las tareas de Salud ASO ordenadas. |
| **29 · Keywords** | DataTable de 6.3 con panel de detalle, selección múltiple y versión móvil, y la pantalla Encontrar de 6.4 con las 3 fuentes unificadas | 25, 27 | La pantalla de keywords tiene como mucho 25 botones visibles sin selección (hoy 106). A 390 px se ve en tarjetas y sin desbordamiento. |
| **30 · Ficha de la tienda** | Editor de 6.8: vista previa de Play, cobertura resaltada, propuesta como diff, normas en línea | 25, 27 | La vista previa reproduce la ficha de Play con icono, título, descripción corta y las 3 primeras capturas. Se puede aceptar la propuesta campo a campo. |
| **31 · Mercado** | Competidores, Reseñas y Tendencias (6.5–6.7) | 27 | Reseñas sin selector de país. Competidores con barras en fila. Tendencias con las filas vacías plegadas. |
| **32 · Creativos y Cambios** | Reorganización de 6.9 y 6.10 | 25, 27 | Inspector plegable y miniaturas reordenables. Cambios en línea de tiempo con impacto. |
| **33 · Pulido y móvil** | Estados vacíos, esqueletos, progreso de la IA, toasts y repaso de textos (7.5–7.6). Test de Playwright que recorra todas las rutas a 390 y 1440 px | 28–32 | 0 rutas con `scrollWidth > innerWidth`. Ningún párrafo explicativo de más de 2 líneas fuera de `HelpTip` o de estados vacíos. |

**Orden recomendado:** 25 → 26 → 27 → 28 → 29 → 30, y después 31–33. Las fases 28–30 son las que más cambian la percepción de calidad.

---

## 10. Referencias

| Archivo | Qué tomar de ahí |
|---|---|
| `referencias/plausible_demo.png`, `plausible_demo_2.png` | Franja de KPIs con su variación, un gráfico protagonista, listas con barras dentro de la fila y pestañas dentro de las tarjetas. Mucho aire y fondo claro. |
| `referencias/appfigures_2.png` | Herramienta de ASO con la barra lateral **agrupada por tarea** (Keyword Inspector, Keyword Performance, Find Keywords / Competitor intelligence, Market Trends…) y tablas de keywords con mini-gráficos. |
| `referencias/shadcn_tasks.png` | Barra de herramientas de tabla con filtros por facetas (Status, Priority), botón «View» de columnas, acciones por fila en «⋯» y el botón principal a la derecha. |
| `referencias/tremor_2.png` | Componentes de panel: Tracker, BadgeDelta, selector de rango de fechas y BarList. |
| `referencias/linear_2.png` | Lo que Rankeo ya copia: densidad, oscuro y sobriedad. Sirve para mantener la sobriedad sin el aspecto genérico. |

**Capturas del estado actual** (`docs/rediseno/actual/`):
- `panel.png`
- `app_keywords.png`
- `editor_ficha.png`
- `producto.png`
- `competidores.png`
- `resenas.png`
- `creativos.png`
- `novedades.png`
- `resumen_semanal.png`
- `ajustes.png`
- `movil_keywords.png`, que muestra el desbordamiento en móvil.

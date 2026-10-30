# Rankeo: auditoría de uso real y plan de mejora

> **Para quién es este documento.** Para un agente de IA (o un desarrollador) que va a trabajar sobre el código de Rankeo. Cada problema lleva su evidencia, la causa en el código, la solución propuesta, los archivos afectados, los tests que hay que añadir y un criterio de aceptación comprobable. Se puede ejecutar de arriba abajo, una tarea por PR.
>
> **Antes de escribir código lee:** `AGENTS.md` (esta versión de Next.js tiene cambios incompatibles: consulta `node_modules/next/dist/docs/`), `DESIGN.md` (sistema visual) y `README.md` (qué hace cada pantalla y por qué).

---

## Índice

1. [Contexto y método](#1-contexto-y-método)
2. [Resumen ejecutivo](#2-resumen-ejecutivo)
3. [Lo que funciona bien (no romper)](#3-lo-que-funciona-bien-no-romper)
4. [Hallazgos: problemas detectados](#4-hallazgos-problemas-detectados)
5. [Funciones nuevas para que Rankeo pese de verdad en el ASO](#5-funciones-nuevas-para-que-rankeo-pese-de-verdad-en-el-aso)
6. [Plan de trabajo por fases](#6-plan-de-trabajo-por-fases)
7. [Cambios en el modelo de datos](#7-cambios-en-el-modelo-de-datos)
8. [Estrategia de tests](#8-estrategia-de-tests)
9. [Reglas para el agente que implemente](#9-reglas-para-el-agente-que-implemente)
10. [Anexo A: la app usada como caso real](#anexo-a-la-app-usada-como-caso-real)
11. [Anexo B: evidencias de la sesión](#anexo-b-evidencias-de-la-sesión)
12. [Anexo C: normas de las tiendas que el validador debe conocer](#anexo-c-normas-de-las-tiendas-que-el-validador-debe-conocer)

---

## 1. Contexto y método

**Fecha de la auditoría:** 30 de octubre de 2026.
**Versión auditada:** producción en `https://aso-research-app.vercel.app`, igual a `main` en `6d0ca10` (Merge PR #30).
**Cómo se hizo:** navegación real con Playwright (Chromium, 1440×900 y 390×844 móvil) usando la cuenta del dueño, sobre la app ya seguida **«Recordatorio pastillas y toma»** (Google Play, España, `com.moyalogames.recordatorio`, id interno `1`, 298 keywords). Se recorrieron todas las secciones globales y las nueve pestañas de la app, y se ejecutaron de verdad las funciones con IA. Después se leyó el código para localizar la causa de cada problema.

**Qué se ejecutó y qué estado dejó en producción:**
- *Ideas con IA*: se generaron 35 ideas. Quedan **pendientes**; no se siguió ninguna.
- *Optimizar con IA* (Editor de ficha): se generó una propuesta. **No** se aplicó ni se guardó.
- *Analizar reseñas*: se pulsó; la app no tiene reseñas en España.
- *Descubrir* con la semilla «pastillero».
- No se borró nada ni se pulsaron «Quitar», «Dejar de seguir» ni «Borrar borrador».

**Por qué importa el caso real.** La app del caso acaba de pasar por una reescritura completa (v3) que aún no está publicada. La ficha de Google Play describe la v2. Eso destapa el fallo de fondo de Rankeo: **no tiene forma de saber qué hace hoy la app**, así que toda la IA trabaja sobre información desactualizada. Ver [Anexo A](#anexo-a-la-app-usada-como-caso-real).

---

## 2. Resumen ejecutivo

Rankeo ya cubre el ciclo completo de ASO en una sola herramienta: seguimiento diario de posiciones, descubrimiento de keywords, ideas con IA, análisis del TOP 10, competidores, estacionalidad, editor de ficha con IA y un estudio de creativos (capturas, icono, logo y vídeo) de nivel profesional. La base técnica es sólida (Zod en las salidas del modelo, versiones de prompt, reintentos, tests de Vitest en `lib/`).

Los problemas no están en la cantidad de funciones sino en **la calidad de los datos que alimentan a esas funciones**:

| # | Problema | Consecuencia | Prioridad |
|---|---|---|---|
| H1 | La IA solo conoce la ficha publicada | Optimiza y escribe sobre funciones antiguas; ignora las nuevas | **P0** |
| H2 | La optimización puede empeorar la cobertura (120 → 102) sin avisar | El usuario aplica una ficha peor creyendo que es mejor | **P0** |
| H3 | Las keywords seguidas están llenas de ruido | Contamina cuota de visibilidad, alertas, prompts y oportunidad | **P0** |
| H4 | Detector de marcas demasiado agresivo | La IA evita palabras genéricas («control», «notas», «enfermedades») | P1 |
| H5 | Estacionalidad con picos falsos | Recomienda cambiar la ficha por señales inexistentes | P1 |
| H6 | El validador solo mira longitudes y repeticiones | Fichas que Play puede rechazar o penalizar pasan como «todo bien» | P1 |
| H7 | Novedades con 139 alertas, casi todas ruido | El usuario deja de mirarlas: la función muere | P1 |
| H8 | Profundidad real del ranking de Play ≈ 30, no 200 | Textos e histórico prometen una precisión que no existe | P1 |
| H9 | Reseñas: estado contradictorio y sin alternativa | Pantalla inútil para apps nuevas | P2 |
| H10 | Creativos parten de capturas antiguas y keywords pobres | Capturas que venden la versión vieja | P2 |
| H11 | Fallos de interfaz (tabla en móvil, TOP 5 ilegible, colores del icono, resumen) | Fricción diaria | P2 |

Y las funciones que más peso darían a Rankeo en el ASO real (sección 5): **ficha de producto viva** (F1), **conexión con Google Play Console y App Store Connect** (F2), **higiene de keywords** (F3), **comprobador de normas** (F4), **candado contra regresiones** (F5), **estacionalidad fiable** (F6), **fichas por idioma y país** (F7), **experimentos y anotaciones automáticas** (F8), **capturas reales** (F9), **reseñas de la competencia** (F10) y **notas de la versión** (F11).

---

## 3. Lo que funciona bien (no romper)

Estas piezas están bien resueltas. Cualquier cambio debe mantenerlas o mejorarlas, nunca degradarlas.

1. **Textos honestos y didácticos.** Cada pantalla explica de dónde sale el dato y sus límites («la relevancia la estima la IA, no la tienda», «cambia la ficha 2–4 semanas antes del pico», «en App Store la posición es aproximada»). Es un diferencial frente a herramientas de pago. Mantener este tono en todo lo nuevo.
2. **Ideas con IA.** En 44 s devolvió 35 ideas de buena calidad, casi todas pertinentes: «me olvido de tomar pastillas», «cuantas pastillas me quedan», «informe de medicacion para el medico», «pacientes polimedicados», «recordatorio levotiroxina». Cada una con tipo, relevancia, competencia y un porqué. Filtra duplicados, plurales, acentos y marcas (`lib/suggestions.ts`).
3. **Trazabilidad de la IA.** Se guarda modelo y versión de prompt (`PROMPT_VERSION`, `LISTING_PROMPT_VERSION`) y se ve en pantalla («Generado con claude-opus-5-5 · prompt kw-1»).
4. **Editor de ficha.** Contadores por campo con los límites de cada tienda, panel de cobertura de cada keyword (exacta / palabras sueltas / no cubierta, con las palabras que faltan) y propuesta de la IA campo a campo con su explicación y «Aplicar» por campo.
5. **Detalle de keyword.** Posición, popularidad, dificultad, oportunidad, gráfico 30/90/180 días con tabla accesible, Google Trends, TOP 5 con valoración y anotaciones compartidas entre keywords.
6. **Competidores.** Cuota de visibilidad ponderada por CTR (40/22/15/12/11 %) con evolución y la opción «Vigilar ficha» con diff de palabras.
7. **Creativos.** Generador de capturas con 12 plantillas, tamaños oficiales, marco de dispositivo, detección y recorte de la pantalla dentro de un montaje, textos con IA y exportación a ZIP; estudio de icono vectorial con vista previa a 64/40/29 px y máscaras de cada tienda; vídeo H.264 codificado en el navegador. Está al nivel de herramientas comerciales.
8. **Robustez.** Ninguna página dio errores de consola. Peticiones a las tiendas con caché, concurrencia limitada y reintentos (`lib/stores/retry.ts`).
9. **Diseño.** Sistema coherente (`DESIGN.md`), tema oscuro y claro, densidad apropiada para una herramienta de trabajo.

---

## 4. Hallazgos: problemas detectados

Formato de cada hallazgo: **Evidencia** (lo observado), **Causa** (en el código), **Solución**, **Archivos**, **Tests**, **Criterio de aceptación**.

### H1 (P0). La IA solo conoce la ficha publicada, no el producto real

**Evidencia.** La propuesta de *Optimizar con IA* describe funciones de la v2 que ya no existen o cambiaron: «Protección contra doble toma: te avisa si ya registraste esa dosis en las últimas 4 horas», «Atajos rápidos de horario (08:00 / 14:00 / 21:00)», «Botones Tomada, **Pospuesta** u Omitida». No menciona nada de la v3: escanear el código de la caja, avisos de seguridad y suministro de la AEMPS, informe PDF para el médico, pautas «cada X horas» y «si lo necesito», medias dosis, 9 tonos con nombre, diagnóstico de fiabilidad por fabricante. Las *Ideas con IA* y los *Textos con IA* de Creativos sufren lo mismo.

**Causa.** `LISTING_SYSTEM_PROMPT` en `lib/listing-optimizer.ts` ordena literalmente: *«Do not promise features the current description does not mention. You may reword and reorder, but do not invent.»* La regla es correcta (evita alucinaciones), pero la única fuente de verdad es `apps.meta` (la ficha publicada), que siempre va por detrás del producto. No existe ningún campo donde el dueño declare qué hace la app.

**Solución: «Ficha de producto» (ver F1).** Un documento estructurado por app, editable, que pasa a ser la **fuente de verdad** de todas las funciones con IA:
- Lista de funciones (`features`), cada una con: nombre, descripción en una línea, estado (`shipped` | `next_release` | `planned`), versión en que aparece, y si se puede anunciar en la ficha.
- Público objetivo, propuesta de valor, diferenciales frente a competidores, restricciones (por ejemplo: «no hacer afirmaciones médicas»), tono de marca, idiomas soportados.
- Importación rápida: pegar un CHANGELOG o notas de versión y que Claude proponga la lista de funciones para revisar (nada se guarda sin confirmación).
- Cambiar la regla del prompt a: *«Only describe features listed in PRODUCT FACTS with status shipped (or next_release when the user says the listing is for the next version). The current listing is only a reference for tone and wording; it may be outdated.»*
- Selector en el editor: «Ficha para la versión publicada» / «Ficha para la próxima versión».

**Archivos.** `db/schema.ts` (tabla nueva `product_facts`, ver sección 7), migración nueva en `db/migrations/`, `lib/listing-optimizer.ts` (prompt y `buildListingPrompt`), `lib/suggestions.ts`, `lib/assets/creative-ai.ts`, `lib/review-analysis.ts` (para cruzar peticiones de usuarios con funciones existentes), `app/ai-actions.ts`, pantalla nueva `app/apps/[id]/producto/page.tsx` y pestaña en `components/app-tabs.tsx`.

**Tests.** `tests/listing-optimizer.test.ts`: el prompt incluye las funciones `shipped`, excluye las `planned`, e incluye `next_release` solo con el modo «próxima versión». Test de que, sin ficha de producto, el prompt cae al comportamiento actual con un aviso.

**Criterio de aceptación.** Con una ficha de producto que contenga «Escanear el código de barras de la caja», la propuesta del optimizador lo menciona; con «Protección contra doble toma» marcada como retirada, no aparece. La pantalla del editor avisa «Tu ficha de producto está vacía: la IA solo conoce la ficha publicada» cuando no existe.

---

### H2 (P0). La optimización con IA puede empeorar la ficha y no lo impide

**Evidencia.** Tras *Optimizar con IA*, la propia pantalla muestra: **«Cobertura de keywords: 120 → 102 de 298»**. Aun así se presenta como propuesta recomendada, con «Aplicar todo (2)». Además, la descripción propuesta repite «recordatorio de pastillas/medicamentos» de forma artificial e incorpora «móvil», «teléfono», «múltiples», «rastreador» y «médico» porque están entre las keywords de más oportunidad (que son ruido, ver H3).

**Causa.** `cleanProposal` y `proposalFeedback` (`lib/listing-optimizer.ts`) solo comprueban longitudes y que el título empiece por la marca. No se compara la cobertura antes/después ni se pondera por valor de cada keyword. El prompt pide repetir las frases objetivo «2 to 4 times», lo que con frases solapadas produce densidad excesiva.

**Solución: candado de calidad (ver F5).**
1. Calcular para la ficha actual y la propuesta una **puntuación de cobertura ponderada**: `Σ oportunidad(k) × peso_campo(k)` sobre keywords relevantes (tras H3), con peso por campo (Play: título 3, descripción corta 2, descripción 1; App Store: nombre 3, subtítulo 2, campo de keywords 1.5, descripción 0).
2. Si la propuesta baja la puntuación o pierde keywords con oportunidad ≥ umbral, **reintentar una vez** con feedback concreto («has perdido: X, Y, Z; recupéralas»). Si sigue peor, mostrarla con una advertencia roja y sin botón «Aplicar todo» destacado.
3. Mostrar el **diff de keywords**: ganadas, perdidas y que cambian de campo, ordenadas por oportunidad.
4. Comprobar densidad (H6) antes de mostrar.

**Archivos.** `lib/listing-optimizer.ts`, `lib/metadata-check.ts` (función nueva `weightedCoverage`), `app/ai-actions.ts`, `components/metadata-editor.tsx`.

**Tests.** `tests/listing-optimizer.test.ts`: una propuesta que pierde keywords de alta oportunidad genera feedback; `weightedCoverage` respeta los pesos por campo y tienda.

**Criterio de aceptación.** Ninguna propuesta que reduzca la cobertura ponderada aparece como recomendada. El usuario ve qué keywords gana y pierde antes de aplicar.

---

### H3 (P0). Las keywords seguidas están llenas de ruido

**Evidencia.** De las 298 keywords de la app del caso, una parte importante no tiene valor de ASO:
- Palabras vacías o genéricas: «acceso», «además», «ahora», «com», «etc», «debe», «puedes», «cualquier», «diferentes», «ejemplo», «después», «disponible», «necesario», «lugar», «datos», «configurar», «experiencia», «botones».
- Coincidencias absurdas: «tomas omitidas» (nº 1: *Thomas y sus amigos*), «doctor mario pastillas», «pastillas juego».
- Palabras sueltas demasiado amplias para una app pequeña: «móvil», «médico», «notas», «alarma», «temporizador», «horario».

Muchas llegan con origen «Manual» desde *Keywords del TOP 10* (que extrae n-gramas de las descripciones de los competidores).

**Consecuencias medidas.**
- La cuota de visibilidad incluye a «Reloj» de Google como competidor (11 keywords en su TOP 5) por keywords como «alarma» o «temporizador».
- *Novedades* acumula 139 alertas, la mayoría «Nuevo nº 1 en «puedes»: WhatsApp Messenger» o «en «lugar»: Mi Lugar».
- El optimizador recibe como «mejores objetivos» palabras como «médico», «móvil», «enfermedades» o «rastreador» porque su oportunidad es alta (popularidad alta × relevancia por defecto 1).

**Causa.**
1. `STOPWORDS.es` en `lib/top-keywords.ts` es corta: no incluye adverbios y verbos frecuentes en descripciones («además», «ahora», «puedes», «debe», «etc», «com», «necesario», «disponible», «cualquier», «diferentes», «ejemplo», «después», «experiencia»…).
2. Una keyword añadida a mano o desde el TOP 10 tiene `relevance = null`, que en la fórmula de oportunidad cuenta como **1** (máxima). Por eso una palabra genérica y popular gana a frases muy pertinentes.
3. No hay ningún paso que mida la relevancia antes de seguir una keyword ni una forma de limpiar en lote.

**Solución (ver F3).**
1. Ampliar las listas de palabras vacías por idioma (es, en, pt, fr, de, it) con adverbios, verbos auxiliares y modales, conectores y restos web («com», «www», «etc»). Mantenerlas en un archivo propio `lib/stopwords.ts` con test.
2. **Relevancia para todas las keywords.** Un clasificador por lotes con Claude (barato: 100 keywords por llamada, salida JSON validada con Zod) que puntúa 1–5 la relevancia de cada keyword respecto a la ficha de producto (H1). Se ejecuta al añadir keywords y bajo demanda («Recalcular relevancia»). Guardar en `app_keywords.relevance` y un nuevo `relevance_source` (`ai` | `user`).
3. Cambiar la fórmula: una keyword sin relevancia cuenta como **0,6** (factor neutro-bajo), no como 1. El usuario puede fijarla a mano con un selector de 1–5.
4. **Detector de intención ajena.** Si el TOP 5 de una keyword no comparte categoría con la app (por ejemplo, juegos infantiles o mensajería) marcarla como «intención distinta» y proponer quitarla.
5. **Limpieza por lotes.** En la tabla de keywords: filtro «Probablemente irrelevantes» (relevancia ≤ 2, intención distinta o palabra vacía), selección múltiple y «Quitar seleccionadas». Debe pedir confirmación y poder deshacerse durante unos segundos.
6. En *Keywords del TOP 10* y *Descubrir*, mostrar la relevancia estimada antes de seguir y desmarcar por defecto las de relevancia ≤ 2.

**Archivos.** `lib/top-keywords.ts`, nuevo `lib/stopwords.ts`, `lib/popularity.ts` (fórmula de oportunidad), nuevo `lib/relevance.ts`, `app/actions.ts`, `app/ai-actions.ts`, `components/top-keywords-table.tsx`, `components/discover-list.tsx`, página `app/apps/[id]/page.tsx` y su tabla, `db/schema.ts`.

**Tests.** `tests/top-keywords.test.ts`: «además», «ahora», «puedes», «etc», «com» no salen como términos. `tests/popularity.test.ts`: la oportunidad de una keyword sin relevancia usa el factor 0,6. Test nuevo `tests/relevance.test.ts` con la salida del modelo simulada.

**Criterio de aceptación.** En la app del caso, el filtro «Probablemente irrelevantes» propone quitar al menos las palabras listadas arriba y ninguna de las frases centrales («recordatorio pastillas», «alarma medicamentos», «pastillero digital»…). Tras limpiar, «Reloj» deja de aparecer entre los competidores principales.

---

### H4 (P1). El detector de marcas trata palabras genéricas como marcas

**Evidencia.** En las notas de la propuesta del optimizador: *«Se evitan palabras que coinciden con marcas competidoras (como «enfermedades», «control», «notas» o «recordatorios»)»*. Son palabras genéricas imprescindibles en la categoría.

**Causa.** `competitorBrands` (`lib/suggestions.ts`, ~línea 112) toma como marca el título completo de cualquier app del TOP 5 cuyo título no tenga espacios (o la parte antes del separador). Apps llamadas «Notas», «Control» o «Recordatorios» convierten esas palabras en «marcas».

**Solución.**
- Considerar marca solo si la palabra **no** aparece como término genérico en las descripciones de al menos 3 apps distintas del TOP 10, o si no está en un diccionario de términos de la categoría.
- Nunca tratar como marca una palabra que esté en la ficha de producto propia ni en el título actual de la app.
- Mostrar al usuario la lista de marcas detectadas en el editor, con la opción de desmarcar alguna («no es una marca»), guardada por app.

**Archivos.** `lib/suggestions.ts`, `lib/listing-optimizer.ts`, `app/ai-actions.ts`, `db/schema.ts` (lista de excepciones por app).

**Tests.** `tests/suggestions.test.ts`: una app titulada «Notas» no convierte «notas» en marca si la palabra aparece en descripciones de otras apps.

**Criterio de aceptación.** En el caso real, «control», «notas», «enfermedades» y «recordatorios» no aparecen como marcas; «MyTherapy» y «Medisafe» sí.

---

### H5 (P1). La estacionalidad anuncia picos que no existen

**Evidencia.** En *Estacionalidad* aparecen 13 keywords con «sube en octubre (este mes) · ×12 sobre su media». En el mapa de calor, esas filas son un único 100 y once ceros (por ejemplo «calendario de pastillas», «app para pastillas», «buscador de medicamentos», «registro de tomas»). En el detalle, «calendario de pastillas» tiene **popularidad 0** y aun así dice «Pico de interés en octubre: prepara la ficha unas semanas antes».

**Causa.** `monthlyProfile` (`lib/seasonality.ts`) exige ≥ 40 puntos semanales y que haya datos en los 12 meses, pero un 0 cuenta como dato. Para keywords con muy poco volumen Google Trends devuelve casi todo ceros y una semana suelta en 100. El perfil resultante es un mes a 100 y el resto a 0, y `seasonalityStrength` da 12×.

**Solución (ver F6).**
- Descartar series con baja señal: más del 50 % de semanas a 0, o menos de 6 meses con media > 0.
- Exigir que el pico se repita o sea sostenido: al menos 3 semanas por encima del umbral dentro del mes, o comprobarlo con 5 años de Trends cuando esté disponible.
- Combinar con la popularidad de la tienda: si popularidad < 10, no anunciar picos.
- En la interfaz, mostrar «Sin datos suficientes» en gris en lugar de un mapa de calor engañoso.

**Archivos.** `lib/seasonality.ts`, `lib/trends.ts`, `app/apps/[id]/estacionalidad/page.tsx`, `components/trend-chart.tsx`.

**Tests.** `tests/seasonality.test.ts`: una serie con 51 ceros y un 100 devuelve `null` («sin datos suficientes»); una serie con pico sostenido en diciembre sigue detectándose.

**Criterio de aceptación.** En el caso real, la lista «Picos que empiezan pronto» queda vacía o solo con keywords con señal suficiente.

---

### H6 (P1). El validador no conoce las normas de las tiendas

**Evidencia.** El panel *Avisos* dice «Todo dentro de los límites» para una propuesta que repite frases objetivo muchas veces, usa «gratis» y mete palabras sueltas para cubrir keywords. El validador actual (`lib/metadata-check.ts`) solo comprueba longitudes, espacios y repeticiones del campo de keywords de iOS, y en Play avisa si una frase aparece más de 6 veces.

**Solución (ver F4 y [Anexo C](#anexo-c-normas-de-las-tiendas-que-el-validador-debe-conocer)).** Un linter de normas con reglas versionadas, cada una con nivel (`error` / `warn` / `info`), texto en español y enlace a la norma oficial:
- Título: sin emojis, sin MAYÚSCULAS sostenidas, sin símbolos decorativos, sin términos de rendimiento o promoción («gratis», «mejor», «nº 1», «top», «nuevo», «oferta», «descuento»…).
- Descripción: densidad de cada keyword (repeticiones por 1000 caracteres) con umbral, listas de palabras clave sin frase, testimonios sin atribuir, menciones a otras apps o marcas.
- Apps de salud: aviso de que no sustituye consejo médico, sin afirmaciones de diagnóstico o tratamiento, y recordatorio de la declaración de apps de salud en Play Console.
- App Store: palabras del campo de keywords repetidas en nombre o subtítulo (ya existe), plurales redundantes, nombres de otras apps.

**Archivos.** Nuevo `lib/policy-check.ts`, `lib/metadata-check.ts` (integrar issues), `components/metadata-editor.tsx`, `lib/listing-optimizer.ts` (enviar los errores como feedback al modelo en el reintento).

**Tests.** `tests/policy-check.test.ts` con casos positivos y negativos por regla.

**Criterio de aceptación.** La propuesta del caso real recibe al menos un aviso de densidad y otro por «gratis». Cada aviso enlaza a su norma.

---

### H7 (P1). Novedades está saturada de ruido

**Evidencia.** 139 alertas sin leer en 30 días (contador «99+»). La inmensa mayoría son «Nuevo nº 1 en «X»» para keywords irrelevantes o donde la app ni aparece: «puedes» (WhatsApp), «lugar» (Mi Lugar), «necesario» (Google Classroom), «debe» (DB Navigator), «tomas omitidas» (Thomas y sus amigos).

**Causa.** `detectRankAlerts` (`lib/alerts.ts`) crea una alerta `new_leader` por **cada** keyword cuyo nº 1 cambie, sin mirar si la keyword es relevante ni si la app propia compite en ella.

**Solución.**
- `new_leader` solo si la app propia está en el TOP 30 de esa keyword, o si el nuevo o el anterior nº 1 es un competidor vigilado.
- Ignorar keywords con relevancia ≤ 2 (tras H3) en todas las alertas salvo las de la propia app.
- Agrupar: un único aviso diario «7 keywords cambiaron de nº 1» con desplegable, en lugar de 7 avisos.
- Preferencias por app: qué tipos de alerta quiere el usuario.
- Prioridad visual: primero lo que afecta a la app propia (entra o sale del TOP 10, sube o baja), después competidores.

**Archivos.** `lib/alerts.ts`, `lib/alert-jobs.ts`, `app/novedades/page.tsx`, `app/alert-actions.ts`, `db/schema.ts` (preferencias).

**Tests.** `tests/alerts.test.ts`: un cambio de nº 1 en una keyword donde la app está fuera del TOP 30 y sin competidores vigilados no genera alerta.

**Criterio de aceptación.** En el caso real, tras aplicar H3 y H7, las alertas diarias bajan a menos de 10 y todas son accionables.

---

### H8 (P1). La profundidad real del ranking de Google Play es ~30, no 200

**Evidencia.** Las posiciones de la app del caso aparecen como «> 29», «> 30», «> 20», «> 14» o «> 15», nunca «> 200». El README y `RANK_DEPTH = 200` (`lib/ranking.ts`) prometen «fuera de los 200 primeros». El valor real se guarda bien en `rank_snapshots.depth`, pero varía por búsqueda.

**Causa.** La búsqueda web de Google Play que usa `google-play-scraper` devuelve muchos menos resultados que los pedidos (`num: Math.min(limit, 250)` en `lib/stores/android.ts`).

**Solución.**
- Documentar la profundidad real por tienda y mostrar en la cabecera de la tabla «Google Play solo devuelve ~30 resultados: “> 30” significa fuera de la primera página ampliada».
- Investigar si la paginación del scraper (token de continuación) permite llegar más lejos; si es así, implementarla con su coste en peticiones.
- Las métricas que comparan posiciones (alertas, resumen) deben tratar «> depth» como desconocido, no como 201. Hoy `summarizeWeek` usa `OUT = 201`, lo que genera movimientos falsos como «fuera → #18».
- Mostrar el `depth` en el tooltip de cada posición «> N».

**Archivos.** `lib/ranking.ts`, `lib/stores/android.ts`, `lib/alerts.ts`, `lib/summary.ts`, `README.md`, `components/rank.tsx`.

**Tests.** `tests/alerts.test.ts` y test de `summarizeWeek`: pasar de `null` con depth 30 a `#18` se describe como «entra en los 30 primeros», no como «sube 183 posiciones».

**Criterio de aceptación.** Ningún texto de la interfaz menciona 200 resultados para Google Play si no es cierto.

---

### H9 (P2). Reseñas: estado contradictorio y sin alternativa útil

**Evidencia.** Tras pulsar «Analizar reseñas», la página muestra a la vez «Aún no has analizado las reseñas de Recordatorio pastillas y toma» y debajo «Recordatorio pastillas y toma no tiene reseñas recientes en España». No ofrece ningún siguiente paso.

**Solución.**
- Sustituir el estado vacío por uno único y claro: «Tu app aún no tiene reseñas en España».
- Proponer en ese mismo lugar analizar las reseñas de los 3 competidores con más cuota (MyTherapy, Medisafe, Pillo), con un botón por competidor, aunque no estén vigilados.
- Añadir **análisis comparado**: quejas frecuentes de los competidores que la app propia ya resuelve (cruzando con la ficha de producto, H1). Ese cruce es material directo para la descripción y las capturas («Sin anuncios», «Funciona sin conexión»…).
- Permitir elegir otros países con la misma app (por ejemplo, México) si en España no hay reseñas.

**Archivos.** `app/apps/[id]/resenas/page.tsx`, `components/analyze-reviews-form.tsx`, `app/review-actions.ts`, `lib/review-analysis.ts`.

**Criterio de aceptación.** Con una app sin reseñas, la pantalla ofrece analizar a un competidor en un clic y el resultado incluye una sección «Oportunidades para tu ficha».

---

### H10 (P2). Creativos parten de capturas antiguas y de keywords pobres

**Evidencia.**
- Las 5 pantallas guardadas usan capturas de la interfaz v2.
- La keyword asignada a cada pantalla es «pastillas recordatorio», «cima medicamentos», «móvil», «notificaciones» y «médico». Tres de ellas no describen lo que se ve.
- El estudio de icono arranca con el lavanda de Rankeo (`#5e6ad2` / `#3b44a8`), no con los colores del icono actual de la app (verde azulado).
- El vídeo se exporta sin sonido.

**Solución.**
- **Subida masiva** de capturas: arrastrar una carpeta y asignar automáticamente por orden. Opcional: un pequeño script documentado (`scripts/push-screenshots`) que sube PNG desde un emulador o dispositivo Android vía `adb exec-out screencap` a un endpoint autenticado.
- Al asignar keyword a una pantalla, proponer las keywords relevantes (H3) que mejor describen esa pantalla, usando la ficha de producto (H1) y el texto visible de la captura (Claude con visión).
- Icono: extraer la paleta del icono actual (`lib/assets/palette.ts` ya existe) y usarla como valores iniciales.
- Vídeo: permitir añadir una pista de audio subida por el usuario (sin generar música).
- Aviso cuando las capturas son anteriores a la última versión publicada (comparando con la fecha de actualización de la ficha).

**Archivos.** `components/screenshot-studio.tsx`, `lib/assets/screenshots.ts`, `lib/assets/creative-ai.ts`, `components/icon-studio.tsx`, `lib/assets/palette.ts`, `components/video-studio.tsx`, `lib/assets/video-encode.ts`.

**Criterio de aceptación.** El estudio de icono arranca con los colores del icono actual. Subir 5 capturas a la vez las coloca en orden.

---

### H11 (P2). Fallos de interfaz

| # | Fallo | Evidencia | Solución | Archivos |
|---|---|---|---|---|
| H11.1 | Tabla de keywords desborda en móvil | `scrollWidth` 1115 px con viewport de 390 px en `/apps/1` | En < 768 px, filas como tarjetas (keyword, posición, oportunidad y un desplegable con el resto) o contenedor con scroll horizontal propio y primera columna fija | `app/apps/[id]/page.tsx`, tabla de keywords |
| H11.2 | Columna TOP 5 ilegible | Iconos de ~10 px sin nombre | Iconos de 20 px con `title`/tooltip y nombre accesible; resaltar la app propia y los competidores vigilados | componente de la tabla |
| H11.3 | Resumen semanal dice «sin datos de hace una semana» | Hay instantáneas desde el 26 oct (4 días) | Si no hay datos de hace 7 días, comparar con el más antiguo disponible e indicarlo («frente al 26 oct») | `lib/summary.ts`, `app/resumen/page.tsx` |
| H11.4 | Email semanal sin configurar | Aviso de `RESEND_API_KEY` en la página | Pantalla de ajustes con estado de cada integración (Anthropic, imágenes, Resend) y prueba de envío | nueva `app/ajustes/page.tsx` |
| H11.5 | Las posiciones «> N» con subrayado de puntos no explican qué significan | Subrayado sin tooltip visible | Tooltip: «Fuera de los N resultados que devuelve la tienda» | `components/rank.tsx` |
| H11.6 | El borrador del editor de ficha no muestra de cuándo es respecto a la ficha publicada | «Guardado el 27/10/2026» sin más | Mostrar «Borrador del 27 oct · la ficha publicada cambió el …» si la tienda actualizó después | `components/metadata-editor.tsx` |

---

## 5. Funciones nuevas para que Rankeo pese de verdad en el ASO

Ordenadas por impacto esperado. Las F que resuelven un hallazgo lo indican.

### F1. Ficha de producto viva (resuelve H1) · P0

Ver H1. Además:
- **Historial de versiones**: cada versión con fecha, número y funciones añadidas o retiradas. Alimenta las anotaciones automáticas (F8) y las notas de la versión (F11).
- **Importar desde un repositorio**: pegar el contenido de `CHANGELOG.md` o de unas notas de versión, y Claude propone las funciones con su estado. El usuario revisa y confirma.
- **Uso transversal**: optimizador, ideas, textos de capturas, conceptos de icono, análisis de reseñas y comprobador de relevancia (F3) leen la ficha de producto.

### F2. Conexión con Google Play Console y App Store Connect · P0

Hoy todo es estimación (popularidad por autocompletado, posición por scraping). Con datos oficiales Rankeo pasaría de «orientativo» a «decisivo».

**Google Play (Android Publisher API, cuenta de servicio):**
- **Publicar el borrador**: `edits.insert` → `edits.listings.update` (título, descripción corta, descripción por idioma) → `edits.commit`. Botón «Publicar en Google Play» con confirmación y vista previa del diff. Guardar qué se publicó y cuándo (alimenta F8).
- **Reseñas**: `reviews.list` y `reviews.reply` para responder desde Rankeo, con borradores de respuesta redactados por Claude en el tono de la marca.
- **Datos de rendimiento de la ficha**: visitantes, conversión e instalaciones por fuente y, sobre todo, los **términos de búsqueda reales** con sus visitas e instalaciones. Comprobar qué parte está disponible por API o en los informes exportados a Cloud Storage; lo que no, importarlo desde el CSV que exporta Play Console. Es el dato que ninguna herramienta externa tiene: cruzarlo con las keywords seguidas para validar la popularidad estimada.

**App Store Connect API (clave de API):**
- Actualizar metadatos de la versión en preparación (nombre, subtítulo, keywords, descripción, texto promocional).
- Informes de analítica (Analytics Reports API): impresiones, visitas a la ficha, conversión por fuente; comprobar qué informes de búsqueda ofrece.

**Requisitos técnicos.** Credenciales cifradas en la base de datos o en variables de entorno de Vercel, nunca en el cliente. Cada acción de escritura pide confirmación explícita y queda registrada. Modo «solo lectura» por defecto.

### F3. Higiene de keywords (resuelve H3) · P0

Ver H3. Resumen de la experiencia final:
- Cada keyword con relevancia 1–5 (IA o usuario), intención (`propia` | `ajena`) y origen.
- Filtro «Probablemente irrelevantes» y limpieza por lotes con deshacer.
- Antes de seguir desde Descubrir, TOP 10 o Ideas: relevancia estimada visible y las de relevancia baja desmarcadas.
- **Presupuesto de keywords**: aviso cuando una app supera ~150 keywords seguidas («las alertas y la cuota pierden precisión; revisa las de relevancia baja»).

### F4. Comprobador de normas de las tiendas (resuelve H6) · P1

Ver H6 y Anexo C. Integrado en el editor, en el optimizador (como feedback al modelo) y en los textos de las capturas.

### F5. Candado contra regresiones (resuelve H2) · P0

Ver H2. Además, al guardar un borrador manual que empeora la cobertura ponderada, aviso no bloqueante.

### F6. Estacionalidad fiable (resuelve H5) · P1

Ver H5. Además: calendario anual por app con los picos de sus keywords relevantes y un recordatorio en Novedades 3 semanas antes de cada pico.

### F7. Fichas por idioma y por país · P1

- La app del caso está en español e inglés y solo se sigue la ficha es-ES.
- Gestionar **una ficha por idioma** (`es-ES`, `en-US`, `pt-BR`…) con sus propias keywords, borrador y cobertura.
- **Traducción con keywords locales**: no traducir literalmente; Claude adapta usando el autocompletado y el TOP 10 del país de destino.
- **Fichas personalizadas por país** de Google Play (custom store listings): borradores separados para un país concreto (por ejemplo, México con «medicinas» en lugar de «medicamentos»).
- Matriz de cobertura idioma × keyword.

### F8. Experimentos y anotaciones automáticas · P1

- **Anotaciones automáticas**: cuando la consulta diaria detecta que la ficha propia cambió (versión, título, descripción, icono o capturas; ya se detecta para competidores en `lib/listing-diff.ts`), crear una anotación con el diff. Así el gráfico de posiciones muestra el efecto de cada cambio sin intervención manual.
- **Medición de impacto**: para cada anotación, comparar la posición media 14 días antes y después en las keywords afectadas (las que contienen palabras añadidas o quitadas). La pantalla de anotaciones ya calcula una comparación similar: extenderla por keyword.
- **Experimentos de ficha de Google Play**: plantilla para planificar una prueba A/B (variante, hipótesis, métrica, duración), registrar el resultado que da Play Console y archivar lo aprendido. Con F2, leerlos si la API lo permite.

### F9. Capturas reales y actualizadas (resuelve H10) · P2

Ver H10.

### F10. Reseñas de la competencia (resuelve H9) · P2

Ver H9. Añadir una vista «Lo que piden los usuarios de la categoría»: temas agregados de los 3–5 competidores principales, marcando cuáles ya cubre la app (ficha de producto) y cuáles podrían ser funciones futuras.

### F11. Notas de la versión («Novedades de esta versión») · P1

- Generar las notas de la versión (Play: 500 caracteres por idioma; App Store: 4000) a partir de la ficha de producto (funciones `next_release`) y del CHANGELOG pegado.
- En el tono de la marca, centradas en beneficios, con las keywords relevantes de forma natural y en cada idioma de F7.
- Con F2, publicarlas junto a la versión.

### F12. Panel de salud ASO por app · P2

Una tarjeta de puntuación en la portada de cada app, con enlaces a la acción concreta:
- Cobertura ponderada de keywords (F5).
- Keywords irrelevantes pendientes de limpiar (F3).
- Antigüedad de la ficha frente a la última versión de la ficha de producto (F1).
- Capturas desactualizadas (F9).
- Avisos de normas abiertos (F4).
- Reseñas sin responder (F2).
- Próximo pico estacional (F6).

---

## 6. Plan de trabajo por fases

Una fase = una o varias PR pequeñas, cada una con sus tests y sin romper las existentes. Orden pensado para que cada fase aproveche la anterior.

| Fase | Contenido | Hallazgos / funciones | Dependencias |
|---|---|---|---|
| **13** | Ficha de producto: tabla, pantalla, importación desde CHANGELOG y uso en optimizador, ideas y creativos | H1, F1 | — |
| **14** | Higiene de keywords: palabras vacías, relevancia para todas, fórmula de oportunidad, intención ajena y limpieza por lotes | H3, F3 | 13 (la relevancia usa la ficha de producto) |
| **15** | Candado de calidad y comprobador de normas en el editor y el optimizador; corrección del detector de marcas | H2, H4, H6, F4, F5 | 14 |
| **16** | Alertas útiles y profundidad real del ranking; resumen semanal sin movimientos falsos | H7, H8, H11.3 | 14 |
| **17** | Estacionalidad fiable y calendario de picos | H5, F6 | 14 |
| **18** | Reseñas de competidores y oportunidades para la ficha | H9, F10 | 13 |
| **19** | Notas de la versión y fichas por idioma y país | F7, F11 | 13, 15 |
| **20** | Google Play Console: publicar ficha, reseñas, datos de rendimiento | F2 (Play) | 15, 19 |
| **21** | App Store Connect | F2 (iOS) | 20 |
| **22** | Anotaciones automáticas, impacto por keyword y experimentos | F8 | 16 |
| **23** | Creativos: subida masiva, keywords por pantalla, paleta del icono, audio del vídeo | H10, F9 | 13, 14 |
| **24** | Interfaz: tabla móvil, TOP 5 legible, ajustes de integraciones, panel de salud | H11, F12 | todas |

**Primera entrega recomendada (máximo impacto, mínimo riesgo):** fases 13, 14 y 15. Con ellas, la IA conoce el producto, trabaja sobre keywords limpias y no puede empeorar la ficha.

---

## 7. Cambios en el modelo de datos

Todo con migraciones de Drizzle (`npm run db:generate` y `npm run db:migrate`). No modificar migraciones existentes.

```ts
// db/schema.ts (propuesta; ajustar a las convenciones del archivo)

/** Lo que hace la app, declarado por el dueño. Fuente de verdad para la IA. */
export const productFacts = pgTable("product_facts", {
  appId: integer("app_id").primaryKey().references(() => apps.id, { onDelete: "cascade" }),
  /** Una línea: qué es y para quién. */
  pitch: text("pitch").notNull().default(""),
  audience: text("audience").notNull().default(""),
  differentiators: jsonb("differentiators").$type<string[]>().notNull().default([]),
  /** Cosas que la ficha nunca debe decir (p. ej., afirmaciones médicas). */
  constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
  tone: text("tone").notNull().default(""),
  languages: jsonb("languages").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureStatus = pgEnum("feature_status", ["shipped", "next_release", "planned", "retired"]);

export const productFeatures = pgTable("product_features", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  status: featureStatus("status").notNull().default("shipped"),
  sinceVersion: text("since_version"),
  /** false para funciones internas que no se anuncian en la ficha. */
  advertise: boolean("advertise").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

export const productReleases = pgTable("product_releases", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  date: date("date"),
  notes: text("notes").notNull().default(""),
});

// app_keywords: columnas nuevas
//   relevanceSource: text("relevance_source")  // 'ai' | 'user' | null
//   intent: text("intent")                       // 'own' | 'foreign' | null
//   relevanceCheckedAt: timestamp(...)

/** Palabras que el usuario marcó como «no es una marca» (H4). */
export const brandExceptions = pgTable("brand_exceptions", {
  appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
}, (t) => [primaryKey({ columns: [t.appId, t.word] })]);

/** Preferencias de alertas por app (H7). */
export const alertPrefs = pgTable("alert_prefs", {
  appId: integer("app_id").primaryKey().references(() => apps.id, { onDelete: "cascade" }),
  kinds: jsonb("kinds").$type<string[]>().notNull(),
  minRelevance: integer("min_relevance").notNull().default(3),
});

/** Ficha por idioma o país (F7); hoy el borrador vive en apps.draft. */
export const listingDrafts = pgTable("listing_drafts", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  locale: text("locale").notNull(),          // 'es-ES', 'en-US'…
  country: text("country"),                  // null = ficha principal del idioma
  draft: jsonb("draft").$type<MetadataDraft>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Migración de `apps.draft`:** copiar el borrador actual a `listing_drafts` con el idioma de la app y dejar de escribir en `apps.draft`, sin borrarlo hasta una versión posterior.

---

## 8. Estrategia de tests

- **Lógica pura en `lib/`** con Vitest, siguiendo el estilo de `tests/` (fixtures en `tests/fixtures/`). Toda función nueva de puntuación, filtrado, validación o generación de prompt lleva su test.
- **Salidas del modelo simuladas.** Nunca llamar a la API de Anthropic ni a las tiendas en los tests. Fixtures JSON con respuestas reales anonimizadas.
- **Fixture del caso real.** Añadir `tests/fixtures/recordatorio/` con: la ficha publicada (v2), una ficha de producto v3 (ver Anexo A), 60 keywords representativas (las buenas y las ruidosas listadas en H3) y la propuesta del optimizador observada. Sirve para tests de regresión de H1, H2, H3, H4 y H6.
- **Comprobación por fase:** `npm run typecheck`, `npm run lint` y `npm test` en verde antes de cada PR.
- **Prueba manual en producción** al cerrar cada fase, sobre la app 1, repitiendo el recorrido de la sección 1 y comparando con las evidencias del Anexo B.

---

## 9. Reglas para el agente que implemente

1. **Una tarea por PR**, con título `Fase N: …` como el historial existente, descripción con el antes y el después y capturas cuando haya interfaz.
2. **No romper lo que funciona** (sección 3). Si un cambio afecta a una de esas piezas, añadir un test que la proteja antes de tocarla.
3. **Datos honestos.** Toda cifra estimada se marca como estimación; toda cifra oficial (F2) se marca como oficial. Nunca mezclarlas sin indicarlo.
4. **La IA propone y el usuario decide.** Nada se sigue, se borra ni se publica sin confirmación. Las acciones destructivas o externas (quitar keywords en lote, publicar en una tienda) piden confirmación y, cuando sea posible, permiten deshacer.
5. **Coste de la IA.** Agrupar peticiones (relevancia en lotes de 100), cachear resultados por versión de prompt y mostrar cuándo una acción llama al modelo. Subir `PROMPT_VERSION` o `LISTING_PROMPT_VERSION` cuando cambien prompts o esquemas.
6. **Textos en español** de España, en el tono de la app: claros, sin jerga innecesaria, explicando de dónde sale cada dato.
7. **Diseño** según `DESIGN.md`: tokens de Tailwind, nunca colores sueltos; móvil a 44 px de alto en controles.
8. **Secretos** solo en variables de entorno del servidor. Nunca en el cliente ni en los logs.
9. **Next.js de esta versión:** leer la guía en `node_modules/next/dist/docs/` antes de usar una API (ver `AGENTS.md`).
10. **Actualizar `README.md`** en cada fase con la sección correspondiente y la fila de la tabla «Estado».

---

## Anexo A: la app usada como caso real

**Recordatorio pastillas y toma** · Moyalo Games · Google Play España · `com.moyalogames.recordatorio`.

**Ficha publicada (v2, la que ve Rankeo):** título «Recordatorio pastillas y toma» (29/30); descripción corta «Pastillero digital fácil: alarmas de medicamentos y control de tu tratamiento» (77/80); descripción de 2289 caracteres centrada en catálogo CIMA, alarmas exactas, confirmar la toma desde la notificación, protección contra doble toma de 4 horas, adherencia y stock bajo.

**Producto real (v3, a punto de publicarse).** Usar como contenido de la ficha de producto en el fixture de tests:

| Función | Estado |
|---|---|
| Buscar el medicamento por nombre en el catálogo oficial CIMA de la AEMPS, con fotos y principio activo | shipped |
| Escanear el código de barras de la caja para añadirlo | next_release |
| Pautas por días de la semana, todos los días, cada X horas y «si lo necesito» | next_release |
| Dosis por medicamento, incluidas medias pastillas | next_release |
| Alarmas exactas que suenan con la app cerrada y la pantalla bloqueada | shipped |
| Tomar, posponer u omitir desde la notificación; deshacer | shipped |
| 9 tonos de aviso con nombre propio | next_release |
| Stock: días restantes y aviso de reposición | shipped |
| Avisos de problemas de suministro y notas de seguridad de la AEMPS, con campana de avisos | next_release |
| «Cómo tomarlo» y prospecto oficial | next_release |
| Progreso: adherencia a 7 y 30 días, racha e historial por días | shipped |
| Informe PDF para el médico | next_release |
| Diagnóstico de fiabilidad de los avisos con guía por fabricante (Xiaomi, Samsung…) | next_release |
| Widget de inicio con la próxima toma | shipped |
| Copia de seguridad, tema claro y oscuro, español e inglés, sin registro, datos solo en el dispositivo, sin anuncios | shipped |
| Protección contra doble toma de 4 horas | retired |
| Modo cuidador | planned |

**Restricciones de la ficha:** no hacer afirmaciones médicas; incluir el aviso «no sustituye el consejo médico»; no prometer funciones `planned`.

---

## Anexo B: evidencias de la sesión

Datos observados el 30 de octubre de 2026 en producción. Sirven de línea base para comprobar las mejoras.

**Panel:** 3 apps seguidas (LockGen, 34 keywords; Recordatorio pastillas y toma, 298; Wallpapers by AI Prompts, 0). Todas en Google Play · ES.

**Novedades:** 139 sin leer en 30 días. Ejemplos de ruido: «Nuevo nº 1 en «puedes»: WhatsApp Messenger», «en «lugar»: Mi Lugar», «en «necesario»: Google Classroom», «en «debe»: DB Navigator», «en «tomas omitidas»: Thomas y sus amigos: ¡Chú-chú!». Ejemplos útiles: «Nuevo nº 1 en «alarma pastillas widget»: Recordatorio de Medicinas», «pastillero electronico baja 32 posiciones (#20 → #52)».

**Resumen semanal (23–30 oct):** Recordatorio: 6 suben / 0 bajan de 298; TOP 10: 0; cuota de visibilidad 0 % «sin datos de hace una semana»; 115 cambios de competidores. Más suben: «recordatorio pastillas» fuera → #18; «recordatorio pastillas mayores» fuera → #18; «recordatorio de pastillas» fuera → #19; «pastillas» fuera → #23; «pastillero electronico» fuera → #50.

**Keywords (app 1):** 298 en total, TOP 10: 0, al alcance (11–30): 4, bajando: 0. Primeras por oportunidad: «pastillas recordatorio» (> 29, popularidad 71, dificultad 34, oportunidad 54), «médico» (> 30, 79, 49, 52), «enfermedades» (> 30, 60, 22, 51), «móvil» (> 30, 80, 51, 51), «rastreador» (> 30, 76, 49, 50).

**Competidores (cuota en TOP 5, 298 keywords):** MyTherapy 7,6 % (93 keywords en TOP 5), Medisafe 2,8 % (76), Reloj de Google 1,7 % (11), Pillo Health 1,6 % (35), TOM Recordatorio de medicación 1,5 % (60).

**Descubrir «pastillero»:** 5 frases en 29 s: «pastillero virtual», «pastillero recordatorio», «pastillero recordatorio gratis», «mi pastillero», «pastilleros».

**Detalle keyword 11 «calendario de pastillas»:** posición > 30, popularidad 0, dificultad baja 34, oportunidad 0, «Pico de interés en octubre». TOP 5: MyTherapy, Medisafe, Recordatorio de Medicinas (The Chillest Cat), TOM, Pills Time.

**Ideas con IA:** 35 ideas en 43,8 s, modelo `claude-opus-5-5`, prompt `kw-1`.

**Optimizar con IA:** 50,4 s. Descripción corta propuesta (78/80): «Pastillero digital fácil: alarma de medicamentos, suplementos y tu tratamiento». Descripción propuesta 2374/4000 con funciones v2. Cobertura 120 → 102 de 298. Marcas evitadas según la IA: «enfermedades», «control», «notas», «recordatorios».

**Reseñas:** «no tiene reseñas recientes en España», a la vez que «Aún no has analizado…».

**Estacionalidad:** 13+ keywords «sube en octubre (este mes) · ×12 sobre su media», con perfiles de un único mes a 100.

**Creativos:** 5 pantallas guardadas (1080×1920) con keywords «pastillas recordatorio», «cima medicamentos», «móvil», «notificaciones», «médico»; capturas de la interfaz v2. Icono: valores iniciales `#5e6ad2` / `#3b44a8`. 6 logos generados el 27/10/2026 con `gpt-image-2.5-flare`.

**Móvil (390×844):** `/` y `/apps/1/metadata` sin desbordamiento; `/apps/1` con `scrollWidth` 1115.

**Consola:** sin errores en ninguna página.

---

## Anexo C: normas de las tiendas que el validador debe conocer

Las reglas exactas cambian: cada regla del validador debe guardar el enlace a la norma oficial y la fecha en que se revisó. Antes de implementar, **verificar el texto vigente** en las fuentes oficiales: la política de metadatos de Google Play (Centro de políticas para desarrolladores, apartado *Metadata* y *Store listing and promotion*), las directrices de revisión de App Store (apartado 2.3, *Accurate Metadata*) y la política de apps de salud de Google Play.

**Google Play: título, icono y nombre de desarrollador**
- Máximo 30 caracteres en el título.
- Sin emojis, emoticonos ni caracteres especiales repetidos.
- Sin mayúsculas sostenidas salvo que sean parte de la marca.
- Sin términos que indiquen rendimiento o promoción: «mejor», «nº 1», «top», «gratis», «nuevo», «oferta», «descuento», «bonificación», ni rankings o premios.
- Sin llamadas a la acción («descarga ya», «actualiza»).

**Google Play: descripciones**
- Sin repetición excesiva de palabras clave ni listas de keywords sin contexto.
- Sin testimonios de usuarios sin atribuir o inventados.
- Sin referencias a otras apps o marcas sin permiso.
- Descripción corta de máximo 80 caracteres; descripción de máximo 4000.

**Google Play: apps de salud**
- Completar la declaración de apps de salud en Play Console.
- No hacer afirmaciones de diagnóstico, curación o tratamiento.
- Recomendable incluir un aviso de que no sustituye el consejo médico.

**App Store**
- Nombre y subtítulo de máximo 30 caracteres; campo de keywords de 100, palabras separadas por comas sin espacios.
- No usar nombres de otras apps ni marcas registradas en el campo de keywords.
- No repetir en el campo de keywords palabras del nombre o el subtítulo; no añadir plurales redundantes ni el nombre de la categoría.
- Los metadatos deben describir con precisión la app; sin precios en metadatos ni términos irrelevantes.

**Implementación sugerida.** Cada regla como objeto `{ id, store, field, level, test(text) → issues, message, link, reviewedAt }` en `lib/policy-check.ts`, con un test por regla. Las listas de términos prohibidos, por idioma.

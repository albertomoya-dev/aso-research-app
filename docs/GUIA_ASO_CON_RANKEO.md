# Guía para hacer ASO con Rankeo

**Para quién es:** un agente de IA, o una persona, que tiene que preparar o mejorar la ficha de Google Play (o App Store) de **cualquier app** usando Rankeo. No hace falta conocer Rankeo ni la conversación en la que se escribió.

**De dónde sale:** de preparar de principio a fin la ficha de la v3 de una app real, «Recordatorio pastillas y toma» (`com.moyalogames.recordatorio`), entre el 30-10 y el 03-11-2026. El trabajo fue: producto, keywords, competencia, reseñas, textos en es-ES y en-US, capturas, gráfico de funciones y publicación. Las cifras de ejemplo son de ese caso. Su resultado está en el repo de esa app, en `aso/v3/FICHA_PLAY_v3.md`.

**Documentos relacionados:**
- `ERRORES_REVISION_2026-10-30.md`: errores conocidos H12–H23, con sus soluciones provisionales resumidas en la sección 6.
- `REDISENO_UX.md`: la reorganización prevista de la interfaz. Si ya se ha implementado, los nombres de pantalla cambian; el mapa está en su sección 8.
- `AUDITORIA_Y_PLAN_DE_MEJORA.md`: el plan de funciones de las fases 13–24.

---

## 1. Qué es Rankeo y cómo se accede

Rankeo es una web propia de ASO (Next.js en Vercel) que hace seis cosas:
- seguir keywords y posiciones en Google Play y App Store;
- investigar keywords nuevas con el autocompletado de la tienda, la IA y el TOP 10;
- analizar competidores y reseñas;
- escribir la ficha con IA a partir de una «ficha de producto»;
- generar capturas e iconos;
- anotar cambios y medir su efecto.

| Dato | Valor |
|---|---|
| URL | `https://aso-research-app.vercel.app` |
| Acceso | Autenticación básica del navegador. Usuario `alberto`; la contraseña es `APP_PASSWORD` de `.env.local` en el repo `aso-research-app` |
| IA | Claude (`claude-opus-5-5`) para textos y análisis; OpenAI para imágenes (cada imagen cuesta dinero) |
| Datos | Postgres (Neon). Las posiciones se consultan cada día por cron y con «Actualizar posiciones» |

**Reglas con la contraseña:**
- Léela del archivo y pásala por una variable de entorno. **No la imprimas nunca** en la terminal, en los logs ni en los documentos.
  ```bash
  export RP=$(grep '^APP_PASSWORD=' .env.local | cut -d= -f2- | tr -d '"\r')
  ```
- Si la ves escrita en un chat, recomienda al dueño que la cambie.

### Automatizar el uso
Rankeo no tiene API pública. Se maneja con **Playwright** (Python o Node), con `http_credentials` para la autenticación. Las pautas que funcionan:
- Esperar con `wait_until="networkidle"` y después 1–2 s. Las acciones de servidor no cambian la URL.
- **Las operaciones de IA tardan de 20 a 70 s.** Espera a que desaparezca el texto de progreso, por ejemplo con `page.wait_for_function("!document.querySelector('main').innerText.includes('Escribiendo…')")`. Textos de progreso conocidos: «Escribiendo…», «Leyendo reseñas y analizando…», «Redactando…», «Proponiendo…», «Estimando con IA…», «Generando fondo…».
- **El estado de algunas pantallas vive en el cliente** hasta que se guarda: Creativos, la propuesta del optimizador y la propuesta de funciones del CHANGELOG. Haz todo el flujo en **una misma sesión** y pulsa «Guardar» al final.
- En escritorio la zona principal tiene **scroll interno**. Para capturar la página entera, usa una ventana muy alta (por ejemplo 1440×5000).
- Las capturas y el texto de cada paso conviene guardarlos para el informe final.

---

## 2. Principios de ASO que guían cada decisión

1. **La ficha la indexa la tienda, pero la lee una persona.** En Google Play cuentan, de más a menos:
   - el **título** (30 caracteres);
   - la **descripción corta** (80);
   - la **descripción** (4.000), sobre todo los primeros 167 caracteres;
   - el nombre del desarrollador.

   En App Store: título (30), subtítulo (30) y campo de keywords (100, palabras sueltas separadas por comas). Allí la descripción no indexa.
2. **La relevancia va antes que el volumen.** Una keyword muy buscada que no describe la app trae visitas que no instalan, y eso hunde la conversión.
3. **Las quejas de la competencia son tu posicionamiento.** Antes de escribir una línea, lee lo que odian los usuarios de los 2 o 3 líderes.
4. **Honestidad estricta.** Nada de funciones que no existen, ni de afirmaciones médicas, ni de «la mejor» o «nº 1». «Gratis» solo en la descripción. Las funciones limitadas por país se avisan en las fichas de otros países. Las declaraciones de Play Console, con la verdad.
5. **Cambia, mide y repite.** Cada publicación es un experimento: se anota y se compara a los 14 días.

---

## 3. Flujo completo, paso a paso

El orden importa: cada paso alimenta al siguiente. Los tiempos son los reales del caso de ejemplo.

### Paso 0 · Reunir el contexto de la app (sin Rankeo, unos 15 min)
Del repo de la app y del dueño, saca lo siguiente:
- **Qué hace la app hoy**, con el CHANGELOG, las pantallas y los textos de la app. Distingue **lo publicado** de **lo que trae la versión que se va a publicar**.
- **Modelo de negocio real:** gratis, anuncios, suscripción, compras. Determina si se puede decir «sin anuncios» o «gratis», y qué no se puede prometer.
- **Restricciones legales del sector:** salud, finanzas, menores…
- **Funciones que dependen del país**, como un catálogo nacional o un servicio local.
- **Paleta de la app** (los tokens del tema claro), para las capturas.
- **La ficha publicada actual.** Rankeo la lee sola al añadir la app.

### Paso 1 · Añadir la app y sus mercados
- En el **Panel**, «+ Añadir app»: busca por nombre o por paquete. Se crea en un país (por ejemplo, España).
- **Para otro país o idioma**, ve a la pestaña Keywords de la app → «Otros países» → elige el país → **«Seguir en ese país»**. Hasta la fase 26 del rediseño, cada país es una app distinta en Rankeo, con su propio id.
- Anota los ids de cada mercado. En el caso de ejemplo: app 1 = ES y app 4 = US.

### Paso 2 · Ficha de producto (lo más importante, unos 10 min)
Pestaña **Producto**. Es la fuente de verdad que reciben todas las IA de Rankeo: ideas, optimizador, creativos y reseñas.
1. **Resumen del producto:**
   - **Qué es, en una frase:** el beneficio concreto, no la categoría. Por ejemplo: «Recordatorio de medicamentos con avisos que suenan aunque la app esté cerrada, confirmación de cada toma y control del stock».
   - **Para quién es:** con un caso concreto («… también tratamientos cortos: antibiótico cada 8 horas»).
   - **Qué te diferencia:** una idea por línea, entre 5 y 8, empezando por lo que no tiene la competencia.
   - **Lo que la ficha nunca debe decir:** una norma por línea. Siempre:
     - sin superlativos sin prueba;
     - sin marcas de otras apps;
     - no anunciar funciones planeadas (nombrarlas, por ejemplo: «modo cuidador»);
     - las normas del sector («No hacer afirmaciones médicas…»);
     - las limitaciones por país.
   - **Tono:** por ejemplo, «cercano, claro y tranquilo, sin alarmismo; frases cortas».
   - **Idiomas de la app.**
2. **Importar desde CHANGELOG.** Pega el CHANGELOG: Claude propone funciones con estado y versión. Antes de pulsar «Guardar seleccionadas», comprueba:
   - que el estado es correcto: «Publicada», «Próxima versión», «Planeada» o «Retirada»;
   - que **no faltan las funciones que ya estaban publicadas**. La IA suele listar solo lo nuevo del CHANGELOG, así que añade a mano las de versiones anteriores (en el ejemplo: buscador, confirmar desde el aviso, adherencia, widget e idiomas).
3. **Comprobación final.** Abre «Ver lo que lee la IA (ficha para la próxima versión)» y léelo entero. Es exactamente lo que recibe el modelo.

> **En cada mercado nuevo hay que repetir este paso** hasta que exista el modelo app → mercados. Añade las restricciones propias del país. Ejemplo para EE. UU.: «El buscador CIMA, el escáner y los avisos de la AEMPS solo cubren medicamentos de España: fuera de España hay que decir que se añaden a mano».

### Paso 3 · Descubrir keywords con el autocompletado (unos 5 min)
Pestaña **Descubrir**. Explora de 4 a 6 **semillas**:
- la categoría: «pastillero», «pill tracker»;
- el verbo con el objeto: «alarma pastillas»;
- la palabra genérica: «medicamentos», «recordatorio», «meds».

Cada semilla devuelve entre 6 y 100 frases (la semilla, y la semilla seguida de cada letra de la a a la z).

Qué observar:
- Los **modificadores con intención**: «gratis», «sin anuncios», «ad free», «widget», «para mayores». Revelan qué valora el usuario.
- Las **familias de variantes**: «recordatorio pastillas», «recordatorio de pastillas», «pastillas recordatorio». Sigue varias, porque la tienda las trata por separado.
- Lo que **no** hay que seguir: marcas de otras apps («mytherapy…»), otros sentidos («pastillas juego») y búsquedas de otra intención («vademécum»).

### Paso 4 · Ideas con IA (unos 30 s)
Pestaña **Ideas con IA** → «Generar ideas», con el enfoque opcional vacío o con un público concreto. Devuelve entre 30 y 40 ideas, con tipo, relevancia, competencia y el porqué.
- Con la ficha de producto rellena, las ideas salen de las funciones reales («antibiótico cada 8 horas», «escanear código medicamento»).
- **Sigue solo las que la gente escribiría de verdad.** Descarta las que describen la función pero nadie busca («medias pastillas», «recordatorio medicación privado»).
- Después, «Seleccionar todas» → «Descartar» para vaciar la bandeja. Comprueba que se ha vaciado (ver H24 en la sección 6).

### Paso 5 · Fijar la lista de keywords (unos 10 min)
- En la pestaña Keywords, «Carga manual»: pega las del autocompletado, una por línea. **Objetivo: entre 40 y 60 keywords por mercado**, repartidas así:
  - entre 8 y 12 **de cabeza** (categoría + verbo: «recordatorio medicamentos», «pill reminder»);
  - entre 15 y 25 **intermedias** (con modificador: «alarma para tomar pastillas», «medication refill reminder»);
  - entre 10 y 20 **de cola larga o de función** («antibiótico cada 8 horas», «pill reminder widget»);
  - entre 3 y 5 **de modificador comercial** («… gratis», «… no ads») si son verdad.
- Pulsa **«Recalcular relevancia con IA»** tras cargarlas. Las manuales se quedan sin relevancia si el trabajo en segundo plano no termina (H15).
- Pulsa **«Actualizar posiciones»** (entre 1 y 2 min para 50 keywords).
- **Revisa la relevancia a mano** en las dudosas: anticonceptivos para un recordatorio de medicamentos, vitaminas… Lo que fija el usuario no lo cambia la IA.
- **Lee la popularidad con cuidado.** Una keyword cuya primera palabra tiene 12 letras o más puede salir con 0 sin serlo (H13). Ejemplos: «recordatorio …», «medicamentos …», «medication r…». Si el autocompletado la sugiere en cuanto escribes la segunda palabra, trátala como de cabeza.

**Cómo leer la tabla:**
- **Posición «> N»:** la app no está entre los N resultados que devuelve la tienda. Google Play devuelve unos 30.
- **«Al alcance»:** posición de 11 a 30. Son las de mejor rendimiento: un retoque de ficha las puede meter en el TOP 10.
- **Oportunidad:** popularidad × (1 − dificultad) × relevancia. Sirve para ordenar, no para decidir sin mirar.

### Paso 6 · Analizar el TOP 10 de las 2 o 3 keywords principales (unos 2 min)
Pestaña **Keywords del TOP 10** → escribe la keyword → «Analizar TOP 10». Sirve para tres cosas:
- **Ver quién manda.** En el ejemplo, MyTherapy y Medisafe aparecían en el TOP 10 de casi todas.
- **Ver qué frases comparten las fichas del TOP 10** (columna «Apps», por ejemplo 8/10) y si las ponen en el título. Si una frase está en 8 de 10 fichas, es la que la tienda asocia al término. En el ejemplo, «recordatorio de medicamentos».
- **Encontrar frases que aún no sigues.** Síguelas desde ahí.

### Paso 7 · Competidores (unos 2 min)
Pestaña **Competidores**:
- Lee la **cuota de visibilidad en el TOP 5**: quién se lleva la visibilidad de tus keywords. En el ejemplo: MyTherapy 33 %, Medisafe 15 % y la app propia en torno al 3 %.
- Pulsa **«Vigilar ficha»** en los 4 o 5 primeros. Rankeo guarda una copia diaria de su ficha y avisa cuando la cambian.
- Apunta la **valoración y el número de valoraciones** de cada uno. Una app con muchas valoraciones y nota baja (Medisafe: 3,1 ★ con 250.000) es una mina de quejas.

### Paso 8 · Reseñas de la competencia (unos 30 s por app)
Pestaña **Reseñas**: elige el competidor en los chips de arriba (o con `?t=<paquete>`) y pulsa «Analizar reseñas». Lee 300 reseñas del país. Analiza **los 2 primeros competidores** y, si tiene reseñas, **tu propia app**.

Qué sacar:
- **«Quejas más repetidas»:** cada una que tu app resuelva es un argumento de la ficha. En el ejemplo:
  - Medisafe: el 35 % de las reseñas eran «ahora es de pago» → la ficha propia destacó «gratis, sin anuncios y sin registro»;
  - MyTherapy: anuncios invasivos y avisos que no suenan → «los avisos suenan aunque la app esté cerrada».
- **«Lo que piden»:** posibles funciones para el dueño, y argumentos si ya las tienes.
- **«Palabras que usan los usuarios»:** keywords en el lenguaje real del usuario. Sigue las relevantes.
- **«Ideas para tu ficha a partir de este competidor»:** úsalas con criterio, porque a veces son consejos para el competidor (H19).

### Paso 9 · Optimizar la ficha (de 1 a 3 min por intento)
Pestaña **Editor de ficha**, en el idioma principal.
1. **Antes de optimizar**, revisa «Marcas detectadas» y marca **«No es una marca»** en las palabras normales («anticonceptivos», «registros», «pills», «antibiotic»…). Si no lo haces, la IA evita esas palabras (H14).
2. En «Para qué versión es la ficha», elige **«Ficha para la próxima versión»** si preparas una versión nueva.
3. **Enfoque** (máximo 200 caracteres): el posicionamiento que sacaste de las reseñas. Ejemplo: *«Diferénciate de las apps de suscripción y con anuncios: la app es gratis, sin anuncios y sin registro. Los avisos suenan con la app cerrada (queja nº 1 de la competencia). Usa 'antibiótico cada 8 horas' como ejemplo de tratamiento corto.»*
4. «Optimizar con IA». La propuesta trae, campo a campo, la cobertura antes y después, lo que se gana y se pierde y «Construida alrededor de». **Lánzala 2 o 3 veces**: cada vez sale distinta, así que quédate con la mejor de cada campo.
5. **Revisión de experto** antes de «Aplicar todo». Es obligatoria:
   - **Título:** conserva las palabras donde **ya** posicionas en el TOP 30. En el ejemplo, «Recordatorio pastillas» estaba en el #17, así que se mantuvo y se añadió «alarma»: «Recordatorio pastillas: alarma» (30). Sin «gratis», sin emojis y sin mayúsculas sostenidas.
   - **Descripción corta:** keyword principal + diferencial. Ejemplo: «Pastillero virtual sin anuncios: alarma de medicamentos con la app cerrada» (74).
   - **Descripción:**
     - frases clave en los primeros 167 caracteres;
     - cada una 2 o 3 veces como mucho;
     - bloques con título en mayúsculas y viñetas;
     - el aviso legal del sector al final;
     - **ningún párrafo-lista de keywords** («a pill reminder…, a med reminder…, a meds tracker…»): bórralo si aparece, porque el comprobador no lo detecta (H16);
     - **sin frases duplicadas**, como «sin anuncios y sin registro» dos veces seguidas.
   - **Panel «Avisos»:** los «Aviso» de normas hay que entenderlos. «gratis» en la descripción se puede dejar; en el título o en la descripción corta, no. Los «Info» son recordatorios para Play Console, como la declaración de apps de salud.
6. Edita a mano lo que haga falta en los campos y pulsa **«Guardar borrador»**. Comprueba en «Cobertura de keywords» la cobertura ponderada. En el ejemplo pasó de 15,9 a 32,3; a partir de 30 se puede dar por buena en la primera versión.

### Paso 10 · Notas de la versión (unos 20 s por idioma)
Al pie del Editor: «Versión» → «Generar notas». Usa las funciones «Próxima versión» y el límite de 500 caracteres.
- Genéralas **en cada idioma de la ficha**: cambia el idioma arriba y vuelve a generar.
- Play Console pide **en-GB aparte de en-US** si la ficha tiene los dos. Adapta el léxico: «as needed» → «when needed», «doctor» → «GP».
- Entrégalas con el formato que pega Play Console:
  ```
  <es-ES>…</es-ES>
  <en-GB>…</en-GB>
  <en-US>…</en-US>
  ```
- **Comprueba que no prometen** nada que dependa de un permiso que el sistema puede no conceder.

### Paso 11 · Otros idiomas y países
- **No uses «Adaptar a <idioma>» en la app de otro país** hasta que se corrija H12: devuelve la ficha en el idioma de origen.
- **Lo que funciona:**
  1. Sigue la app en el país de destino (paso 1), con lo que sale como app nueva.
  2. Repite los pasos 2–5 allí. La ficha de producto se puede importar del mismo CHANGELOG. Añade las restricciones del país.
  3. Haz Descubrir con semillas **en el idioma de destino** («pill reminder», «medication reminder», «meds»).
  4. Optimiza en el editor de esa app: su idioma principal ya es el del país.
- **Avisa en la ficha de las funciones que no sirven en ese país.** En el ejemplo, la ficha en inglés tiene un bloque «MEDICINE SEARCH AND BOX SCAN: SPAIN ONLY». Evita reseñas de 1 ★.

### Paso 12 · Creativos (de 20 a 40 min)
1. **Capturas de la app real.** Rankeo no las hace; las tienes que hacer tú. Método completo en el playbook de apps móviles, sección I.4:
   - datos de ejemplo cargados con la copia de seguridad de la app;
   - modo demo de la barra de estado;
   - de 6 a 8 pantallas en el orden del argumento;
   - las mismas en cada idioma, con datos traducidos.
2. Pestaña **Creativos → Screenshots**. En la misma sesión:
   1. «Subir capturas»: varias a la vez, que se colocan por orden de nombre (`01_…`, `02_…`).
   2. En cada pantalla, «Captura en bruto, dentro del marco».
   3. Plantilla: «Clásico» es la más legible. **Elige la plantilla antes de tocar los colores**, porque aplicarla los sustituye (H23).
   4. **Colores** (5 selectores `input[type=color]`, en orden: fondo, degradado, titular, subtítulo y acento): pon **los del tema claro de la app**, por ejemplo fondo `#F4F7F6` → `#DDEFEA`, titular `#0B1F1C`, subtítulo `#4A5E5A` y acento `#0B6B60`. La casilla «Usar los colores de la app» solo afecta al fondo con IA (H20).
   5. «Textos con IA»: marca «Enviar las capturas» y escribe un enfoque («Pantalla 1: … Menciona 'sin anuncios' en una pantalla»). Devuelve un titular, un subtítulo y una keyword por pantalla. Revisa que no anuncie funciones que no estén en la captura.
   6. **Fondo con IA (opcional, cada imagen cuesta dinero):**
      1. Escribe un enfoque explícito («Very light mint #F4F7F6…, at least 85% near-white, no dark areas…»).
      2. «Proponer fondos con Claude» y luego «Generar fondo».
      3. **Mide el brillo** de la imagen generada: bájala desde `/api/assets/generated/<id>`. El modelo a veces la hace oscura aunque se pida clara.
      4. Selecciona el fondo pulsando **su** miniatura. La lista va de la más nueva a la más antigua.
   7. «Guardar diseño» y luego «Descargar todo (ZIP)», en 1080×1920.
3. **El gráfico de funciones (1024×500) y el icono de 512 no salen de Creativos**; hazlos aparte. Para el gráfico: icono, titular de 2 líneas, subtítulo y el móvil a la derecha, con los mismos colores y fondo que las capturas, y comprobando que nada se solapa.

### Paso 13 · Entregar y publicar
- **Documento de entrega** en el repo de la app, `aso/vX/FICHA_PLAY_vX.md`, con:
  - la estrategia (posicionamiento, posiciones de partida y competencia);
  - los textos de cada idioma con su recuento de caracteres;
  - las notas de la versión;
  - la tabla de recursos gráficos;
  - la lista «Antes de publicar».
- **Recursos** en `aso/vX/{es,en}/` y `aso/vX/icon_512.png`.
- **Publicación:** el dueño copia los textos a Play Console. Rankeo puede publicar si `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` está configurado; hasta ahora no lo estaba.
- **Play Console** (ver el playbook, I.5–I.6):
  - declaraciones honestas;
  - ID de publicidad comprobado en el AAB;
  - un `versionCode` nuevo si hubo que rehacer el bundle;
  - retirar los bundles antiguos de todos los canales.

### Paso 14 · Medir (a los 14 días) y mantener
- **Pestaña Cambios:** Rankeo detecta el cambio de ficha publicada y lo anota solo. Si no, añade una anotación manual. A los 14 días compara la posición media de las keywords afectadas.
- **Rutina semanal (unos 10 min):**
  1. **Novedades y Resumen semanal:** entradas y salidas del TOP 10, caídas de más de 5 puestos y cambios de los competidores vigilados.
  2. **Salud ASO**, el bloque de arriba en Keywords: resuelve los «Necesita atención».
  3. **Estacionalidad:** prepara la ficha de 3 a 4 semanas antes de cada pico.
  4. **Ideas con IA** una vez al mes, y reseñas de la competencia una vez al trimestre.
- **Experimentos de Play** (Crecimiento → Experimentos de ficha): un cambio cada vez, como mínimo 7 días. Planifícalos y anota el resultado en Cambios → Experimentos.

---

## 4. Criterios de decisión rápidos

| Pregunta | Criterio |
|---|---|
| ¿Cambio el título? | Solo para añadir o reordenar palabras. Nunca quites palabras con las que ya estás en el TOP 30. |
| ¿Sigo esta keyword? | Que alguien la escribiría para encontrar **esta** app (relevancia 4 o 5), que la sugiera el autocompletado o la usen las reseñas, y que no sea una marca. |
| ¿Popularidad 0? | Mira el autocompletado antes de descartarla (H13). |
| ¿Cuántas veces repito una frase? | De 2 a 3 en la descripción, 1 en el título y 1 en la descripción corta. |
| ¿Pongo «gratis»? | Solo en la descripción, y solo si es verdad hoy y lo será a medio plazo. Sí puede ir «sin anuncios» en la descripción corta si es un hecho. |
| ¿Menciono a un competidor? | Nunca. Lo que sí se hace es responder a sus quejas: «sin suscripción», «suena con la app cerrada». |
| ¿La IA propone algo que no está en la ficha de producto? | Se quita. La ficha de producto manda. |
| ¿Fondo de las capturas? | Los colores del tema claro de la app; el icono no sirve de referencia. Fondo con IA solo si es claro y sutil. |
| ¿Una declaración de Play no encaja? | Se quita el permiso; no se elige la opción más parecida. |

---

## 5. Cifras del caso de ejemplo (sirven de referencia)

| Métrica | Antes | Después |
|---|---|---|
| Keywords seguidas | 0 | 52 (ES) + 30 (US) |
| Cobertura ponderada (ES) | 15,9 | 32,3 |
| «recordatorio pastillas» | #17 | #14 a los 4 días, antes de publicar la ficha |
| Cuota de visibilidad en el TOP 5 (ES) | — | ~3 % (líderes: 33 % y 15 %) |
| Tiempo total con Rankeo | — | unas 4 h, incluidas las capturas |
| Coste de imágenes | — | 5 fondos generados, 2 usados |

---

## 6. Errores conocidos y cómo esquivarlos

Detalle completo en `ERRORES_REVISION_2026-10-30.md`. Comprueba antes si ya están corregidos.

| Id | Problema | Cómo esquivarlo |
|---|---|---|
| H12 | «Adaptar a <idioma>» devuelve el idioma de origen | Sigue la app en el país y optimiza allí (paso 11) |
| H13 | Popularidad 0 en keywords cuya primera palabra tiene 12 letras o más | Compruébalo en el autocompletado |
| H14 | Palabras normales tratadas como marcas | «No es una marca» antes de optimizar |
| H15 | Keywords manuales sin relevancia | «Recalcular relevancia con IA» |
| H16 | El relleno de keywords no se detecta | Revisión manual de la descripción |
| H17–H19 | Cruces de reseñas imprecisos e ideas para el competidor | Leer con criterio |
| H20 | «Usar los colores de la app» solo afecta al fondo de IA | Colores a mano |
| H21 | Error de React #418 en la consola de Creativos | Ignorarlo; no afecta |
| H22 | Al borrar el borrador de un idioma se precarga otro idioma | No guardar sin revisar los campos |
| H23 | Una plantilla sobrescribe los colores y el fondo | Plantilla primero, colores después |
| H24 | «Descartar» todas las ideas puede no vaciar la bandeja | Comprobarlo y, si persiste, descartarlas fila a fila |

---

## 7. Plantilla de informe para el dueño

Al terminar, entrega en el chat:
1. **Estrategia en 3 líneas:** posicionamiento, competencia y posiciones de partida.
2. **Enlace a `FICHA_PLAY_vX.md`** y a la carpeta de recursos.
3. **Pasos que tiene que hacer el dueño en la consola:**
   - declaraciones;
   - capturas;
   - textos por idioma;
   - notas de la versión;
   - prueba interna → producción.
4. **Riesgos y decisiones pendientes:** marcas de terceros en las capturas, «gratis» si cambia el modelo de negocio, funciones por país…
5. **Errores nuevos de Rankeo** encontrados, añadidos a `ERRORES_REVISION_*.md`.

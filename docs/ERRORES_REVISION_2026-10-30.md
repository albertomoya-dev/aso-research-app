# Rankeo — Errores de la revisión del 30-10-2026

Revisión hecha después de las fases 13–24 (último commit revisado: `abac20d`). El método fue usar Rankeo de principio a fin, en producción (https://aso-research-app.vercel.app), para preparar la ficha v3 de una app real: «Recordatorio pastillas y toma», `com.moyalogames.recordatorio`. La app tiene el id 1 para Google Play España y el id 4 para Estados Unidos.

Cada error lleva la evidencia (lo que se vio en la web), la causa en el código, una propuesta de solución y un criterio para darlo por resuelto. Los ids siguen la numeración de `AUDITORIA_Y_PLAN_DE_MEJORA.md` (allí acaban en H11).

## Resumen

| Id | Gravedad | Área | Error |
|---|---|---|---|
| H12 | Alta | Editor de ficha / Adaptar | «Adaptar a en-US» devuelve la ficha en español |
| H13 | Alta | Keywords / Popularidad | La popularidad da 0 a keywords principales cuya primera palabra tiene 12 letras o más |
| H14 | Alta | Marcas | El detector de marcas trata palabras normales como marcas y la IA deja de usarlas |
| H15 | Media | Keywords / Relevancia | Las keywords añadidas a mano se quedan sin relevancia hasta pulsar «Recalcular» |
| H16 | Media | Normas | El comprobador no detecta el relleno de keywords cuando cada frase sale una sola vez |
| H17 | Media | Reseñas | «Ya lo resuelves» cruza por palabras sueltas y da falsos positivos |
| H18 | Media | Reseñas | Las funciones de la próxima versión salen como «posibles funciones futuras» |
| H19 | Baja | Reseñas | Algunas «Ideas para tu ficha» de un competidor son consejos para el competidor |
| H20 | Baja | Creativos | No hay forma de aplicar los colores de la app a la plantilla |
| H21 | Baja | Creativos | Error de hidratación de React (#418) en la consola |
| H22 | Baja | Editor de ficha | Al borrar el borrador de un idioma, el editor se rellena con el texto de la ficha principal en otro idioma |
| H23 | Baja | Creativos | Las propuestas de fondo comparten estilo con las plantillas, y una plantilla borra los colores sin avisar |

---

## H12 · «Adaptar a en-US» devuelve la ficha en español (alta)

**Evidencia**
- App 1 (Google Play · ES), editor de ficha, idioma «inglés (Estados Unidos) (en-US)», botón «Adaptar a en-US». Se probó dos veces y las dos veces el título, la descripción corta y la descripción salieron en español.
- En el segundo intento el campo de enfoque decía literalmente «Write ALL fields in American English. 'Recordatorio pastillas' is NOT a brand». Aun así la IA respondió: «Se mantiene el español de España: la ficha es para Google Play España y todas las palabras clave son en español; en inglés se perdería casi todo el posicionamiento».
- Los «targetKeywords» que devolvió eran todos en español («recordatorio pastillas», «pastillero virtual»…).
- Las notas de la versión en en-US, en cambio, sí salieron en inglés.

**Causa**
1. `brandOf()` (`lib/listing-optimizer.ts:247`) da por hecho que el título empieza por una marca: toma lo que va antes de «:» o, si no hay separador, la primera palabra. Con el título «Recordatorio pastillas: alarma» la «marca» resulta ser «Recordatorio pastillas». En Google Play es muy común que el título sea solo keywords.
2. `LOCALIZE_SYSTEM_PROMPT` (`lib/localize.ts`) dice «Keep the app's brand name at the start of the title, exactly as it is, untranslated». Así que la IA mantiene esa frase en español, y `proposalFeedback` penaliza la propuesta si la quita.
3. `localizeListingAction` (`app/ai-actions.ts`, hacia la línea 437) envía como `sourceKeywords` solo las keywords del país de la app, aquí todas en español. Si `marketCountryFor(target)` no encuentra datos del mercado de destino, la IA no tiene ninguna keyword en inglés.
4. Nada comprueba que la propuesta esté escrita en el idioma de destino.

**Solución propuesta**
- Que la marca sea un dato explícito de la ficha de producto, por ejemplo un campo «Marca», que puede quedar vacío. Usar `brandOf()` solo como sugerencia que el usuario confirma. Si no hay marca declarada, no obligar a conservar nada en el título.
- Cuando el idioma de destino es distinto del de origen, no enviar las keywords de origen como keywords: enviarlas solo como «conceptos» y decirlo así en el prompt.
- Detectar el idioma de cada campo de la propuesta (por stopwords, como ya hace `stopwordsFor`). Si no coincide con `localeLanguage(target.locale)`, reintentar con feedback y, si vuelve a fallar, devolver un error en lugar de la propuesta.
- Si no hay autocompletado del mercado de destino, mostrar un aviso visible antes de lanzar la adaptación, no después, con el atajo «Seguir también en <país>».

**Criterio de aceptación**
- Con el título «Recordatorio pastillas: alarma» y sin marca declarada, «Adaptar a en-US» devuelve los tres campos en inglés.
- Hay un test unitario del detector de idioma y un test de `localizeListingAction` con un mock del modelo que devuelve español: no se acepta la propuesta.

---

## H13 · La popularidad da 0 a keywords principales (alta)

**Evidencia**

En España, con popularidad 0:

| Keyword | Popularidad | Posición |
|---|---|---|
| recordatorio pastillas | 0 | #17 |
| recordatorio de pastillas | 0 | — |
| recordatorio medicamentos | 0 | — |
| recordatorio medicación | 0 | — |
| recordatorio de medicamentos gratis | 0 | — |
| control de medicamentos | 0 | — |

Su inversa «pastillas recordatorio» tiene 71, y «medicamentos recordatorio» tiene 55. El autocompletado de Play sugiere «recordatorio pastillas» en cuanto se escribe «recordatorio p» (verificado en la pestaña Descubrir).

En EE. UU. pasa lo mismo: «medication reminder no ads», «medication reminder and tracker» y «pill reminder ad free» dan 0.

Como la oportunidad es popularidad × …, estas keywords quedan al final de la tabla, y el optimizador y los creativos no las priorizan.

**Causa**

En `lib/popularity.ts`, `MAX_PREFIX = 12` y `measureAutocomplete` escribe como mucho 12 letras. «recordatorio» y «medicamentos» tienen exactamente 12, y «medication r» también llega a 12. Si la tienda no sugiere la keyword con la primera palabra sola, nunca se llega a escribir la letra que la distingue y el resultado es 0 («rarely searched»).

**Solución propuesta**
- Medir a partir de la primera palabra completa más N letras, por ejemplo `limit = min(term.length, max(MAX_PREFIX, firstWord.length + 4))`, o directamente hasta la longitud de la keyword (con un límite de peticiones).
- Normalizar `autocompleteScore` con la longitud real escrita, para que una keyword larga sugerida a mitad no puntúe como si se hubiera escrito entera.
- Mostrar «sin medir» (–) en lugar de 0 cuando no se llegó a escribir la keyword completa.

**Criterio de aceptación**
- Test: con un `suggest` simulado que devuelve «recordatorio pastillas» solo para el prefijo «recordatorio p», `measureAutocomplete("recordatorio pastillas")` devuelve más de 0.
- En producción, «recordatorio pastillas» deja de tener 0.

---

## H14 · El detector de marcas trata palabras normales como marcas (alta)

**Evidencia**
- En el Editor de ficha, «Marcas detectadas» incluía palabras corrientes: «anticonceptivos», «registros», «pills», «lady», «antibiotic», «antibiotics», «mis medicinas».
- Consecuencia: la primera propuesta del optimizador dijo «No se nombran fabricantes de móviles ni la palabra «antibiótico» para evitar choques con marcas de terceros». Así perdió la keyword seguida «antibiotico cada 8 horas» y el ejemplo del tratamiento cada 8 horas.
- Al marcar esas palabras como «No es una marca», la siguiente propuesta ya usó «antibiótico».

**Causa**

`competitorBrands()`, llamado desde `detectBrands()` (`lib/brand-queries.ts:26`), excluye las palabras del título propio, las keywords seguidas y la ficha de producto, pero:
- compara palabras exactas, sin stemming ni acentos: «antibiotico» (keyword) frente a «antibiotic» (marca), o «anticonceptivo» (keyword) frente a «anticonceptivos»;
- no compara entre idiomas: palabras inglesas de títulos de apps inglesas en el TOP 5 de España;
- no filtra palabras de diccionario. «Registros», «pills» o «lady» salen de títulos como «Lady Pill Reminder».

Además, los nombres de desarrolladores entran como marcas («ahmed ammar», «hugo gomez»…). No hacen daño, pero llenan la lista de ruido.

**Solución propuesta**
- Comparar por raíz, igual que `stems()` de `lib/review-analysis.ts`, y sin acentos.
- Descartar palabras genéricas y de diccionario en el idioma del país y en inglés (`genericWordsFor`, `stopwordsFor`, más una lista de palabras comunes del sector: pill(s), reminder, medicine, tracker…).
- Considerar marca solo lo que aparece como nombre propio en el título de una app (primer segmento antes de «:» o «-», o una palabra en mayúscula que no esté en el diccionario).
- Dejar los nombres de desarrollador fuera de la lista visible, o agruparlos aparte.

**Criterio de aceptación**
- Con los datos de la app 1, «Marcas detectadas» no contiene «anticonceptivos», «registros», «pills», «lady» ni «antibiotic».
- Sí sigue conteniendo «mytherapy» y «medisafe».

---

## H15 · Las keywords manuales se quedan sin relevancia (media)

**Evidencia**
- Se añadieron 29 keywords con «Carga manual» en la app 1. Las 20 seguidas desde Ideas venían ya con relevancia, pero las 29 manuales se quedaron con la relevancia vacía.
- Solo tuvieron valor después de pulsar «Recalcular relevancia con IA».
- Mientras tanto la oportunidad usa 0,7 para las que no tienen valor, así que el orden de la tabla y el optimizador trabajan con datos incompletos sin que se note.

**Causa**

`rateNewKeywords()` (`lib/relevance-jobs.ts:101`) espera 20 s. Si la IA no ha respondido, devuelve «pending» y sigue con `after(() => job)`. Con 29 keywords el trabajo en segundo plano no terminó, o terminó con error, y no dejó rastro en la interfaz.

**Solución propuesta**
- Repartir en lotes pequeños, por ejemplo de 10.
- Guardar un estado «pendiente» por keyword y mostrar en la tabla «Relevancia: calculando…».
- Si queda alguna pendiente, que la consulta diaria (cron) la reintente.
- Mostrar un aviso cuando el resultado sea «pending» o «failed». `RelevanceStatus` ya existe, pero no se ve en pantalla.

**Criterio de aceptación**
- Al añadir 30 keywords manuales, todas tienen relevancia en menos de 2 minutos sin pulsar ningún botón.
- Si no la tienen, la tabla dice cuáles faltan y por qué.

---

## H16 · El relleno de keywords no se detecta (media)

**Evidencia**

La propuesta del optimizador para en-US (app 4) terminaba con este párrafo:

> «One app for the whole routine: a daily pill reminder for one tablet, a med reminder for several treatments, a meds reminder for short courses and a clear medication tracker for your history. A pill reminder app and meds tracker that also works as a simple pill tracker and medicine reminder, without ads.»

Son 10 variantes de keyword en dos frases. Google Play lo trata como spam de metadatos. Ni el aviso de normas ni el candado de calidad lo marcaron.

**Causa**

`lib/policy-check.ts` (línea 218) solo detecta una misma frase repetida más de N veces. No detecta muchas frases de keyword distintas concentradas en poco texto.

**Solución propuesta**
- Añadir una regla de densidad: en cualquier ventana de unas 300 caracteres o en cualquier párrafo, el porcentaje de palabras que pertenecen a keywords seguidas no debe superar un umbral, por ejemplo el 35–40 %.
- Marcar también los párrafos que son una lista de keywords separadas por comas.
- Pedir en el prompt del optimizador que no cierre la descripción con un párrafo resumen de keywords.

**Criterio de aceptación**
- El párrafo anterior produce un aviso con un enlace a la norma de Google Play sobre metadatos.
- La descripción en español que se dio por buena no lo produce.

---

## H17 · «Ya lo resuelves» da falsos positivos (media)

**Evidencia** (Reseñas de MyTherapy y Medisafe, bloque «Lo que piden los usuarios de la categoría»)

| Lo que piden | Rankeo lo da como cubierto por | Por qué es un error |
|---|---|---|
| «Acceder a medicamentos ya usados al añadir tomas únicas y ver el historial de esas tomas» | «Buscador de medicamentos CIMA» | No tiene relación con un buscador |
| «Traducción incompleta, con partes en inglés, y fallos en la función de citas» | «Español e inglés» | Es una queja sobre la calidad de la traducción y sobre las citas, no sobre los idiomas disponibles |

**Causa**

`lib/review-analysis.ts` (líneas 145 y siguientes) busca coincidencias por raíces de palabras. Le basta con una o dos palabras en común («medicamentos», «español»), y la propia pantalla avisa de que es «sin IA: revísalo».

**Solución propuesta**
- Pedir más coincidencia: al menos 2 raíces significativas entre la petición y el nombre de la función, o 3 con el resumen.
- O confirmar la coincidencia con la IA en el mismo análisis de reseñas, que ya conoce la ficha de producto.
- Mostrar la confianza de cada coincidencia.

**Criterio de aceptación**

Los dos ejemplos anteriores dejan de salir como cubiertos, y «Marcar como tomada, posponer u omitir desde la notificación» sigue cubierto.

---

## H18 · Las funciones de la próxima versión salen como «futuras» (media)

**Evidencia**
- La app 1 tiene 20 funciones «Próxima versión». Entre ellas están «Pautas flexibles de medicación» (cada X horas, con fecha de fin) y «Copia de seguridad».
- Aun así, Reseñas lista «Intervalos cada X horas que se mantengan indefinidamente» y «Exportar o borrar los datos» como «Posibles funciones futuras».

**Causa**

El cruce de cobertura solo usa las funciones con estado «Publicada».

**Solución propuesta**
- Cruzar también con «Próxima versión» y mostrarlo aparte: «Lo resuelve la próxima versión: cuéntalo en la ficha nueva».
- Así se aprovecha para el texto y las capturas de la versión que se está preparando.

**Criterio de aceptación**

Con los datos de la app 1, «Intervalos cada X horas…» aparece como «Lo resuelve la próxima versión → Pautas flexibles de medicación».

---

## H19 · Ideas de un competidor escritas para el competidor (baja)

**Evidencia**

En el análisis de Medisafe, «Ideas para tu ficha a partir de este competidor» incluía:
- «Indicar con claridad en la descripción y en la primera captura que hay 14 días de prueba y luego suscripción»;
- «Explicar en la descripción qué pasa con los datos al acabar la prueba y cómo exportarlos».

Nuestra app no tiene prueba ni suscripción. Son consejos para Medisafe.

**Causa**

El prompt de reseñas (`lib/review-analysis.ts`, `listingTips`) no deja claro que, cuando se analiza un competidor, los consejos son para la app del usuario. Tampoco le pasa la ficha de producto del usuario como referencia.

**Solución propuesta**
- Cuando `target !== app`, pedir explícitamente que los consejos sean para la app del usuario, basándose en las quejas del competidor. Por ejemplo: «sus usuarios se quejan de la suscripción → destaca que la tuya es gratis».
- Pasar la ficha de producto del usuario en el prompt.

**Criterio de aceptación**

Al analizar Medisafe, ningún consejo habla de la prueba de 14 días, y al menos uno propone destacar «gratis y sin suscripción».

---

## H20 · Creativos: no hay forma de aplicar los colores de la app a la plantilla (baja)

**Evidencia**
- La casilla «Usar los colores de la app» (`components/screenshot-studio.tsx`, hacia la línea 1425) parece servir para el diseño, pero solo afecta al «Fondo con IA».
- Las plantillas («Clásico» y las demás) siguen usando el estilo «Noche», con acento lavanda (#8c96ff).
- Para usar la marca hubo que cambiar a mano los 5 selectores de color.

**Solución propuesta**
- Añadir en «Estilo» una opción «Colores de la app» que rellene fondo, degradado, titular, subtítulo y acento a partir de `appPalette` (la paleta del icono que ya se calcula).
- Aclarar el texto de la casilla actual: «Usar los colores de la app en el fondo con IA».

**Criterio de aceptación**

Con un solo clic, las pantallas usan los colores del icono y se mantiene el contraste AA del titular.

---

## H21 · Creativos: error de hidratación de React #418 (baja)

**Evidencia**

En la consola, al cargar `/apps/1/creativos` después de guardar un diseño, aparece «Minified React error #418; args[]=text». Indica que el HTML del servidor y el del cliente no coinciden en un texto.

**Causa probable**

Algún texto que depende del cliente se pinta ya en el servidor: una fecha o una hora con `toLocaleString`, el estado «Guardado» o un contador.

**Solución propuesta**

Localizarlo con el build de desarrollo y mover ese texto a un `useEffect`, o pasarlo ya formateado desde el servidor.

**Criterio de aceptación**

La consola queda sin errores en Creativos con un diseño guardado.

---

## H22 · Borrar el borrador de un idioma rellena el editor con otro idioma (baja)

**Evidencia**
- App 1, editor en en-US, «Borrar borrador».
- Después el campo Título muestra «Recordatorio pastillas: alarma», el texto en español de la ficha principal.
- Si el usuario guarda sin mirar, la ficha en inglés queda en español.

**Solución propuesta**
- Cuando un idioma no tiene borrador, mostrar la ficha publicada de ese idioma si existe.
- Si no existe, dejar los campos vacíos con un aviso («Aún no hay ficha en inglés: usa «Adaptar a en-US»»).
- No precargar nunca un texto de otro idioma.

**Criterio de aceptación**

Después de borrar el borrador de en-US, los campos quedan vacíos o con la ficha publicada en inglés.

---

## H23 · Las propuestas de fondo se confunden con las plantillas, y una plantilla borra los colores (baja)

**Evidencia**
- En Creativos, las propuestas de «Proponer fondos con Claude» («Luz suave turquesa», «Ondas de aviso»…) se ven como botones idénticos a las plantillas («Clásico», «Inclinado»…). Tienen el mismo estilo y el mismo `aria-pressed`, y no hay ningún título que separe los dos grupos.
- Al pulsar una plantilla queriendo elegir un fondo, la plantilla sustituye sin avisar los 5 colores personalizados por el estilo «Noche» y quita el fondo de IA aplicado.
- El cambio se guarda con «Guardar diseño» y no hay forma de deshacerlo.

**Solución propuesta**
- Dar a las propuestas de fondo otro aspecto: miniatura del color o etiqueta «Prompt», con un encabezado «Ideas de fondo».
- Que aplicar una plantilla conserve los colores personalizados y el fondo de IA, o que avise antes («Esto sustituye tus colores»).
- Añadir «Deshacer» después de aplicar una plantilla.

**Criterio de aceptación**

Con colores personalizados y fondo de IA aplicados, al pulsar «Clásico» se mantienen los dos, o aparece un aviso que permite cancelar.

---

## Lo que no se ha podido verificar

- **Estacionalidad:** los datos de Google Trends se descargan en la consulta diaria y aún no había. Queda pendiente comprobar H5 (picos falsos con series de ceros).
- **Alertas, resumen semanal y movimientos de posición:** hace falta más de una consulta para comparar. Queda pendiente comprobar H7 y H8 con datos reales dentro de una semana.
- **Conexiones con Google Play Console y App Store Connect:** no están configuradas, así que no se probaron.

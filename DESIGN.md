---
name: Rankeo
description: "Herramienta de ASO clara por defecto, sobria y con datos densos. Un acento azul (#3B5BDB / #7B93FF), superficies blancas sobre gris muy claro, bordes finos, cifras tabulares en Inter. Tema oscuro opcional."
source: docs/REDISENO_UX.md §7 y docs/PLAN_REDISENO_UX.md §2.2
---

# Rankeo · DESIGN.md

Cómo debe verse la app. Lo leen las personas y los agentes antes de crear o cambiar pantallas. Los valores viven en `app/globals.css`; aquí está el porqué. Todos los componentes se ven en los dos temas en **`/dev/ui`** (solo fuera de producción).

## 1. Tono

Herramienta de trabajo diaria, con tablas y gráficos como protagonistas. Clara, como las herramientas de análisis (Plausible, Appfigures, AppTweak), sobria y con personalidad propia.

- **Claro por defecto.** El oscuro se elige en la barra lateral y se guarda en `localStorage` (`theme`). Sin elección guardada se respeta `prefers-color-scheme`. El script de `app/layout.tsx` pone `data-theme="dark"` en `<html>` antes de pintar.
- **En Tailwind**, la variante `dark:` es para retoques solo del oscuro. Casi nunca hace falta: los tokens ya cambian solos.
- **Resumen antes que detalle; explicar solo cuando se pide.** Los párrafos van a un `HelpTip` o a un `EmptyState`.
- **Una acción principal por pantalla.** Lo ocasional va al menú «⋯». Lo destructivo, a los ajustes de la app.

## 2. Color

Usa siempre los tokens (`bg-surface`, `text-ink-soft`…). **Nunca un hexadecimal en un componente**: si falta un color, se añade un token en `globals.css` con su valor claro y oscuro.

| Token (clase) | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg` | #F6F7F9 | #0E1013 | Fondo de la aplicación |
| `surface` | #FFFFFF | #16191E | Tarjetas, tablas, paneles, barra lateral |
| `surface-muted` = `surface-2` | #F0F2F5 | #1D2127 | Cabeceras de tabla, hover, nav activa, chips |
| `line` / `line-strong` | #E3E6EB / #CFD4DC | #2A2F37 / #3A414B | Bordes de 1 px / bordes de controles |
| `ink` | #14171C | #ECEFF3 | Texto principal |
| `ink-soft` = `ink-2` | #5B6370 | #9AA3AF | Texto secundario |
| `muted` | #656D7A | #858E9B | Texto terciario (pasa AA a 12 px sobre `bg`, `surface` y `surface-2`) |
| `brand` | #3B5BDB | #7B93FF | Acción principal, foco, selección, enlaces |
| `brand-hover` / `brand-strong` | #3250C4 / #2B44B0 | #91A5FF / #B9C6FF | Hover del principal / texto sobre `brand-soft` |
| `brand-soft` | #EAEEFD | #1E2647 | Fondo de selección, fila de «tu app» |
| `on-brand` | #FFFFFF | #0E1013 | Texto sobre `brand` (en oscuro, el blanco daría 2,9:1) |
| `link` | = `brand` | = `brand` | Texto de enlace |
| `up` / `down` | #12805C / #C2362B | #3DD68C / #FF6B5F | Subidas y bajadas, siempre con ▲▼ |
| `warn-fg` = `warn` / `warn-bg` | #9A5B00 / #FFF4E0 | #F5B54A / #2E2210 | Avisos |
| `danger` / `danger-soft` | #B42318 / #FCECEA | #FF7B72 / #2D1414 | Errores y acciones destructivas |
| `ios-*`, `android-*` | | | Insignias de la tienda |
| `series-own` | = `brand` | = `brand` | «Tu app» en todos los gráficos |
| `series-1…5` | | | Competidores, en orden fijo (paleta validada para daltonismo) |
| `heat-1…5` / `on-heat` | #EAF1FB → #1E4F95 / #FFFFFF | #1C2533 → #9CC0F2 / #0E1013 | Mapa de calor (Tendencias): un solo tono; texto `ink` en 1–3 y `on-heat` en 4–5 (`HEAT_CLASS` de `lib/trends-view.ts`) |
| `overlay` | | | Fondo detrás de diálogos y paneles |
| `panel` | = `bg` | = `bg` | Heredado; ya no hay panel de contenido |

- **El azul es escaso:** acción principal, foco, enlaces, selección y la serie de tu app. Nunca como fondo de sección.
- **Los colores semánticos solo con significado.** `up` y `down` para variaciones, `danger` para errores, `warn` para avisos.
- **La dirección nunca depende solo del color:** ▲3, ▼2, «=», «Entra», «Sale».
- `warn` es #9A5B00 y no #B26A00 (el del documento de rediseño), porque este da 3,9:1 sobre blanco.

## 3. Tipografía

- **Inter** para todo, con cifras tabulares y dígitos abiertos (`font-feature-settings: "tnum", "cv11"` en `body`). **JetBrains Mono** solo para nombres de variables, valores técnicos y contadores de caracteres.
- **Escala** (clases de `globals.css`):

  | Clase | Tamaño | Uso |
  |---|---|---|
  | `text-label` | 12 | Etiquetas, cabeceras de tabla, chips |
  | `text-table` | 13 | Celdas de tabla, navegación, botones |
  | `text-body` | 14 | Texto (es el tamaño del `body`) |
  | `text-card-title` | 16 | Títulos de tarjeta y de diálogo |
  | `text-page-title` | 20 | Título de página (`PageHeader`) |
  | `text-kpi` / `text-kpi-lg` | 28 / 32 | Cifras de los KPI |

- Títulos a 600 (`font-semibold`) con tracking −0,02 em. Nada de 700.

## 4. Forma, profundidad y espacio

- **Radios:** 10 px en tarjetas (`rounded-card`), 8 px en controles (`rounded-control`) y 999 px en chips (`rounded-full`).
- **Sombras solo en lo que flota:** diálogos, paneles laterales, menús, popovers, tooltips y toasts (`shadow-float`). Las tarjetas van con borde `line`, sin sombra.
- **Tarjetas solo para agrupar.** Una tabla va directamente sobre la superficie, nunca una tarjeta dentro de otra.
- **Rejilla de 4 px.** Padding de tarjeta de 16 a 20 px y 24 px entre bloques. El contenido llega a 1280 px como máximo, salvo las tablas.

## 5. Componentes

Están en `components/ui/` (y en `components/ui.tsx` los de siempre). Reutilízalos antes de crear otro.

| Componente | Cuándo usarlo |
|---|---|
| `Button` (`variant`: primary, secondary, ghost, danger; `size`: sm, md, lg, icon) | Toda acción. Una `primary` por pantalla. Con `asChild` estiliza un `Link` |
| `buttonPrimary`, `buttonSecondary`, `inputClass` (`components/ui.tsx`) | Las cadenas de siempre, para formularios de servidor. Salen de `buttonVariants` |
| `Card`, `PageHeader` (`title`, contexto en `children`, `actions`) | Agrupar contenido; cabecera de cada pantalla con su acción principal y «⋯» |
| `Dialog` | Confirmaciones y formularios cortos |
| `Sheet` (480 px, a la derecha; `side="bottom"` en móvil) | Detalle y edición de una fila sin salir de la tabla |
| `Popover` | Paneles pequeños: filtros, selectores |
| `DropdownMenu` | El menú «⋯» de acciones ocasionales |
| `Tabs` | Cambiar de vista dentro de un panel. **No** para navegar entre páginas |
| `Tooltip` | Nombre de un botón de icono (ratón y teclado) |
| `HelpTip` | El «?» que explica un título o una columna; también se abre con un toque |
| `Command` / `CommandDialog` | Selector de app y paleta ⌘K |
| `Toaster` + `toast()` de `sonner` | Confirmar una acción terminada («38 ideas descartadas»), con «Ver resultado» o «Deshacer» |
| `KpiCard` | Las 3 o 4 cifras de arriba de una pantalla: etiqueta, número, `DeltaBadge` y `Sparkline` opcional |
| `DeltaBadge` | Variación: ▲3, ▼2, «=», «Entra», «Sale» |
| `RankBadge` | Posición: «#14», «>30» en gris, borde azul si está al alcance |
| `StatusDot` | Estado de la salud ASO, siempre con texto |
| `EmptyState` | Cuando no hay nada: icono, título, una frase y un botón |
| `Skeleton`, `SkeletonText`, `SkeletonKpi`, `SkeletonTable`, `SkeletonChart` | Carga con la forma del contenido real |
| `DataTable` (+ `TableSearch`, `FacetFilter`, `ViewOptions`, `useTableView`, `SelectionBar`) | Toda tabla de datos: buscador y facetas en la barra, «Vistas» (columnas y densidad, en localStorage), cabecera fija, cifras a la derecha, filas de 44 o 36 px, selección con barra flotante y `card` para el móvil. La lógica de filtros está en `lib/data-table.ts`. Ejemplo: Keywords › Seguimiento |

### Navegación (`components/nav/`)

- **Dos marcos:** `app/(global)/layout.tsx` fuera de una app y `app/a/[app]/layout.tsx` dentro. Los dos usan `ShellLayout`: barra lateral, columna de contenido y `<main>`, que es lo que hace scroll.
- **Barra lateral:** `SidebarFrame` con `SidebarLink`, con el icono a 16 px y el contador `NavCount` (`tone="brand"` solo para lo no leído). Las entradas de la app salen de `NAV_GROUPS` en `lib/app-nav.ts`: una sección nueva se añade allí, no en el JSX.
- **Cabecera de la app** (`AppHeader`, 56 px): identidad a la izquierda, y a la derecha la fecha, «Buscar», **una** acción principal («Actualizar posiciones») y «⋯». Las páginas no repiten el nombre de la app ni un enlace «App / sección».
- **Selector de app** (`AppSwitcher`) y **paleta** (`PaletteProvider`, ⌘K) usan `Command`. Los dos agrupan por app, con un elemento por mercado.
- **Pestañas con URL:** Ajustes de la app usa `Tabs` con una URL por pestaña (`SettingsTabs`), con `activationMode="manual"` para que las flechas no carguen páginas. Son las únicas pestañas que navegan; el resto de `Tabs` cambia de vista sin salir de la página.
- **Lo destructivo** va a Ajustes › Zona de peligro, en un `Dialog` que pide escribir el nombre (`UnfollowDialog`). Nunca `window.confirm` ni un menú.

- Los componentes de shadcn/ui se adaptan a **nuestros** tokens. No se usa su `globals.css` ni sus nombres (`muted` es aquí un texto, no un fondo).
- Iconos: `lucide-react`, 16 px en botones y menús, `aria-hidden` cuando hay texto al lado.
- Gráficos: Recharts con `--series-own` para tu app y `--series-1…5` para la competencia, rejilla `--line`, ejes `--muted` y tooltip sobre `surface` con `shadow-float`. No se usa `@tremor/react`.

## 6. Responsive y accesibilidad

- **Puntos de corte:** móvil por debajo de 640 px (`sm`), tablet de 640 a 1024 y escritorio desde 1024 (`lg`). Por debajo de `sm` la barra lateral pasa a una barra inferior (`MobileNav`) y las secciones de la app se abren desde la cabecera en una `Sheet`. De `sm` a `lg` la barra lateral muestra solo iconos (los textos quedan para los lectores de pantalla con `sm:max-lg:sr-only`).
- **Objetivos táctiles de 44 px** en móvil (`min-h-11`). Se compactan a 32 px desde `md`.
- **El `body` nunca hace scroll horizontal.** Las tablas anchas hacen scroll dentro de su contenedor, y en móvil pasan a tarjetas (`card` de `DataTable`). `npm run test:e2e` lo comprueba en todas las rutas a 390 y 1440 px.
- **Contraste AA** en los dos temas. `/dev/ui` se comprueba con axe en `npm run test:e2e`.
- Foco visible siempre (`outline` de 2 px en `brand`).

## 7. Sí y no

**Sí**
- Una sola acción principal por vista; el resto, secundarias, fantasma o en «⋯».
- Cifras alineadas a la derecha en las tablas.
- Probar cada pantalla en claro y en oscuro, y en `/dev/ui` cuando se toca un componente.

**No**
- Hexadecimales o colores de Tailwind sueltos (`text-gray-500`) en componentes.
- Sombras en tarjetas, degradados, un segundo acento decorativo.
- Párrafos de explicación en la pantalla: van a un `HelpTip` o al README.
- Pestañas horizontales para navegar.

## 8. Guía para agentes

- «Añade una pantalla nueva siguiendo DESIGN.md: `PageHeader` con una acción principal, 3 o 4 `KpiCard` y una `DataTable`.»
- «Cambia este párrafo por un `HelpTip` junto al título.»
- «Revisa esta vista contra DESIGN.md: colores sueltos, pesos 700, sombras en tarjetas y más de una acción principal.»

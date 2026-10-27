---
name: Rankeo
description: "Dashboard ASO denso y sobrio, inspirado en el sistema de Linear (vía awesome-claude-design / getdesign.md). Un solo acento lavanda (#5e6ad2), superficies escalonadas con bordes finos en vez de sombras, Inter con tracking negativo en títulos. Oscuro por defecto, como Linear; modo claro opcional desde la barra lateral."
source: https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md
---

# Rankeo · DESIGN.md

Este archivo describe cómo debe verse la app. Lo leen los agentes de diseño (Claude Design) y de código antes de crear o cambiar pantallas. Los valores reales viven en `app/globals.css`; aquí está el porqué.

## 1. Tono

Herramienta de trabajo, no página de marketing. Densa, precisa y tranquila: las tablas de keywords y los gráficos de posición son el protagonista, el marco desaparece. Inspiración: la app de Linear.

- **Oscuro por defecto.** El modo claro se activa con el botón de la barra lateral (`data-theme="light"` en `<html>`, guardado en `localStorage`). En Tailwind usa la variante `light:` para retoques solo de claro.
- **Ventana y panel.** La barra lateral va sobre el fondo de ventana (`bg`) sin borde; el contenido vive en un panel redondeado (`panel`) separado 8px del borde, como en Linear.
- **Compacto.** Texto base de 14px, navegación y botones de 13px y 32px de alto en escritorio (44px en móvil).

## 2. Color

Usa siempre los tokens de Tailwind (`bg-surface`, `text-muted`…), nunca colores sueltos.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg` | #f1f2f4 | #08090a | Fondo de ventana y barra lateral |
| `panel` | #fcfcfd | #0f1011 | Panel de contenido |
| `surface` | #ffffff | #141516 | Tarjetas y tablas |
| `surface-muted` | #f1f2f4 | #1c1d1f | Elemento elevado: hover, nav activa, tooltip |
| `line` / `line-strong` | #e4e5e8 / #d3d5da | #23252a / #34343a | Bordes de 1px |
| `ink` / `ink-soft` / `muted` | #0f1011 / #3c3f45 / #62666d | #f7f8f8 / #d0d6e0 / #8a8f98 | Texto principal, secundario, terciario |
| `brand` | #5e6ad2 | #5e6ad2 | Botón primario, foco, línea de la app en gráficos |
| `brand-hover` | #4f5bc4 | #6d78e0 | Hover del botón primario |
| `link` | #4f5bc4 | #828fff | Texto de enlace (contraste AA sobre las superficies) |
| `brand-soft` | #eceefb | #1e2140 | Fila de "tu app" resaltada |

- La lavanda es escasa: botón primario, foco, enlaces, la serie de tu app. Nunca como fondo de sección.
- Para texto lavanda usa `text-link`, no `text-brand` (en oscuro `brand` no llega a 4.5:1).
- Colores semánticos solo con significado: `up`/`down` para subidas y bajadas de posición, `danger` para errores, `warn` para avisos, `ios`/`android` para la tienda.
- Gráficos con varias series: `--series-1…5` en ese orden (paleta validada para daltonismo). Es la excepción al acento único, igual que las etiquetas de color dentro del producto de Linear.

## 3. Tipografía

- Inter (sustituto libre de la fuente de Linear) para todo; JetBrains Mono para cifras de posición, ids y contadores.
- Títulos en 600 (`font-semibold`) con tracking −0.02em. Nada de 700.
- Cuerpo 14–15px a 400; etiquetas de botón 14px a 500.
- Eyebrows/encabezados de grupo: 12px, mayúsculas, tracking positivo, `text-muted`.

## 4. Componentes

Están en `components/ui.tsx`; reutilízalos.

- **Botón primario**: `bg-brand`, texto blanco, `rounded-md` (6px), 13px a 500, hover a `brand-hover`.
- **Botón secundario**: `bg-surface-muted`, borde `line-strong`.
- **Input**: `rounded-md`, borde `line-strong`; al enfocar, borde `brand` y anillo de 2px `brand/50`.
- **Card**: `bg-surface`, borde `line`, `rounded-xl` y un filo de luz arriba (`shadow-[inset_0_1px_0_0_var(--edge)]`). Sin sombra proyectada.
- **Navegación**: icono de 16px + texto de 13px; la activa se marca por elevación (`surface-muted` + `text-ink`), no con lavanda.
- **Badges/píldoras**: `rounded-md` o `rounded-full`, 12px.
- **Tooltip de gráfico**: `surface-muted` + borde `line-strong`, sin sombra.

## 5. Layout

- Base de 4px. Padding de tarjeta 20–24px; separación entre bloques 24px.
- Barra lateral de 224px en escritorio; arriba en móvil.
- Ancho de contenido fluido; las tablas pueden hacer scroll horizontal dentro de su tarjeta, nunca la página.

## 6. Profundidad

La jerarquía se marca con la escalera de superficies (`bg` → `panel` → `surface` → `surface-muted`) y bordes finos. Evita `shadow-*` salvo en menús flotantes.

## 7. Sí y no

**Sí**
- Una única acción primaria lavanda por vista.
- Cifras alineadas a la derecha y en mono en las tablas.
- Probar cada pantalla en claro y oscuro.

**No**
- Segundo color de acento decorativo, degradados o tarjetas con brillo.
- Botones en píldora.
- Negro puro `#000` como fondo.
- Colores hexadecimales en componentes: añade un token en `globals.css`.

## 8. Responsive

- Breakpoint principal `md` (768px): la barra lateral pasa arriba y las rejillas a una columna.
- Objetivos táctiles de al menos 44px (`min-h-11`).

## 9. Guía para agentes

- "Añade una pantalla nueva siguiendo DESIGN.md: tarjetas `Card`, título con `PageHeader`, una sola acción primaria."
- "Crea un gráfico de Recharts con los colores de `--series-*`, rejilla `--line`, ejes `--muted` y tooltip sin sombra."
- "Revisa esta vista contra DESIGN.md y corrige colores sueltos, pesos 700 y sombras."

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Diseño

Antes de crear o cambiar UI, sigue `DESIGN.md`: claro por defecto con oscuro opcional (variante `dark:`), un solo acento azul, sombras solo en lo que flota y una acción principal por pantalla.
- Usa los tokens de `app/globals.css` (`bg-surface`, `text-ink-soft`, `text-label`…), nunca hexadecimales ni colores sueltos en componentes.
- Reutiliza `components/ui/` (Button, Dialog, Sheet, KpiCard, DeltaBadge, RankBadge, EmptyState, HelpTip…) y `cn()` de `lib/cn.ts`. Los componentes de shadcn se adaptan a nuestros tokens; no se copia su `globals.css`.
- Comprueba los cambios en `/dev/ui` en los dos temas y con `npm run test:e2e` (contra una base de datos de prueba, nunca producción).

# AGENTS.md (frontend)

## Que es este repo

Frontend de Agroposta: **producto** chat GPT-like + **lab** `/dev` con 7 strategies RAG.

- **Producto** (`/`): Odoo-like — left sidebar (logo, `Mis investigadas/planes`, user), center chat (human right bubble / agent left), right panel finito con 2 iconos `pin` + `campana` (colapsado, expande a investigadas pinneadas). Stack Next.js 16.2.9 + React 19.2.7 + Tailwind v4, Vercel `https://agro-rag-front.vercel.app`. Chat usa **solo `baseline` (Semantic) en prod** — lo dejo anotado: no cambiar hasta que avises “PROD con usuarios” (decisión de tier). Valores `k/temperature/sem_bm25/lex_bm25` los toma de lo que dejes en `/dev` (no UI en producto).
- **Lab** (`/dev`): abierto, sin gate — `app/(dev)/dev/page.tsx` con grilla 3×2 (+1) 7 strategies + toggles, para investigar RAG. No se muestra al usuario final.

Stack base: Next.js 16.2.9 + React 19.2.7 + Tailwind v4 + TypeScript 5.9.3.

## Estructura clave

- `app/(dev)/dev/page.tsx`: lab `/dev` — 7 strategies (`baseline`, `lexical`, `hybrid`, `rerank`, `query_rewrite`, `multi_query`, `hyde`) con `StrategyCard` (streaming SSE). Abierto, sin auth gate. `fetch("/api/proxy/compare/stream")` relativo.
- `app/(dashboard)/layout.tsx` + `app/(dashboard)/page.tsx`: producto chat — layout 3 cols (left sidebar 280px | center chat max 760px | right panel finito colapsado 56px → 340px con pins), derivado de Odoo `globals.css` (warm light/dark tokens + density `builder/client`). Right panel inicial solo 2 iconos `pin` + `campana` (como Odoo), sin contenido hasta que haya pins.
- `app/components/StrategyCard.tsx`: usado solo en `/dev` — estados `idle`/`retrieving`/`streaming`/`done`/`error` + trace.
- `app/components/ChatBubble.tsx` / `MessageList.tsx` / `Composer.tsx`: producto chat — burbujas human derecha / agent izquierda (Odoo style), sources colapsables.
- `app/components/ComparePanel.tsx`: legacy 6 cards non-stream — mantener solo referencia.
- `app/globals.css`: traer sistema Odoo `globals.css` como base (tokens `:root`/`dark` + `@theme inline` + density), luego adaptar a verde campo. `DESIGN_GUIDELINES.md` de referencia en `../design-system/`.
- `next.config.js`: rewrites `/api/proxy/*` -> `${process.env.BACKEND_URL || "http://127.0.0.1:8002"}/:path*` (Railway prod, 127 dev)

## Comandos utiles

```bash
npm install                # instalar deps
npm run dev                # dev server en :3002
npm run build              # production build
npm run start              # production server

# El backend tiene que estar corriendo en :8002:
cd ../agro-rag-back && uv run uvicorn api.main:app --port 8002 --app-dir src
```

## Convenciones

- **Puerto del dev server**: 3002
- **Tailwind v4**: sin `tailwind.config.js`, se configura via `@import "tailwindcss"` en `globals.css`
- **No commitear**: `node_modules/`, `.next/`, `out/`, `*.tsbuildinfo`
- **Custom CSS** (variables de color) en `app/globals.css` — usar las vars de `:root` (`--bg`, `--accent`, etc) en vez de hardcodear hex

## Workflow de ramas (obligatorio desde 2026-09-03)

Nunca a `main` directo. Baby steps en rama paralela back+front con mismo nombre:

```bash
git checkout -b feat/<nombre> && git push -u origin feat/<nombre>
# ... commits chicos ...
git status; git diff; git log --oneline -5
git add <archivos> && git commit -m "feat: ..." && git push
# PR → merge a main lo hace martin en GitHub (Vercel deploya)
```

## Si vas a tocar el comparador / chat

- **Lab `/dev` (`app/(dev)/dev/page.tsx` + `StrategyCard.tsx`):** junta `enabled` (toggles), `k`, `temperature`, `sem_bm25`/`lex_bm25`, `lang` y hace `POST /api/proxy/compare/stream` (SSE `strategy_retrieve`/`strategy_token`/`strategy_done`/`strategy_error`). Cada card `idle`→`retrieving`→`streaming` (▌)→`done` (`⏱ 📄 🎟` + fuentes + trace) / `error`. Valores elegidos acá son los que toma el producto (no hay UI para esto en `/`). **No tocar prod chat hasta avisar “PROD con usuarios” — baseline only fijo.**
- **Producto chat (`app/(dashboard)/page.tsx`):** 1 burbuja por turno, `POST /api/proxy/compare/stream` con `enabled:["baseline"]` + `history` (mensajes previos). No muestra `k/temperature` — los hereda de `/dev`. Right panel fino con iconos `pin`/`campana` (Odoo `app/globals.css:291` sidebar 240px→56px colapsada).
- **Backend:** `run_compare_stream` fan-out (`asyncio.gather`) + `trace` por strategy. Default 6 son `baseline`, `hybrid`, `rerank`, `query_rewrite`, `multi_query`, `hyde`; `lexical` y `rerank_ce` extra.

Legacy: `ComparePanel.tsx` non-stream `POST /api/proxy/compare` 6 cards — solo referencia.

## Si vas a tocar el layout

El layout 2-col es CSS Grid:
- `grid-template-columns: minmax(0, 1fr) 420px` en desktop
- Stack vertical en `<1100px` de ancho
- El chat-pane tiene scroll propio (`max-height: calc(100vh - 280px)`)

El composer (input) esta fixed al bottom con `position: fixed; bottom: 0`.

## Si moviste el repo o cambio el path absoluto

Si el path del repo cambia (ej. `mv agro-rag-front/ /otro/lugar/` o `git clone` en otra maquina), Turbopack entra en loop de panics "Next.js package not found" porque `node_modules` y `.next` tienen paths absolutos hardcodeados.

Sintoma: localhost:3002 se recarga en loop infinito y el log muestra:
```
FATAL: Failed to write app endpoint /page
Caused by: Next.js package not found
```

**Fix:**
```bash
cd agro-rag-front
rm -rf node_modules .next
npm install
npm run dev
```

Aplicar SIEMPRE despues de cualquier move, rename, o fresh clone.

## Rate limit del backend

El backend tiene rate limit de OpenAI (200K TPM en tier default). Si ves muchas cards con ❌ y "Rate limit reached", es el backend que se quedó sin budget. Soluciones: esperar 1 min, upgrade de tier, o menos preguntas seguidas en el report.

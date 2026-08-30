# AGENTS.md (frontend)

## Que es este repo

Frontend de Agroposta: comparador de 7 strategies RAG con streaming. La pantalla tiene grilla 3×2 (+1) con toggles ON/OFF por strategy.

Stack: Next.js 16.2.9 + React 19.2.7 + Tailwind v4 + TypeScript 5.9.3. Deploy en Vercel `https://agro-rag-front.vercel.app`.

## Estructura clave

- `app/page.tsx`: 7 strategies (`baseline`, `lexical`, `hybrid`, `rerank`, `query_rewrite`, `multi_query`, `hyde`) — cada una con `StrategyCard` (streaming SSE). Usa `fetch("/api/proxy/compare/stream")` relativo (evita CORS + mixed-content)
- `app/components/StrategyCard.tsx`: card principal (streaming) — estados `idle`/`retrieving`/`streaming`/`done`/`error`, toggle ON/OFF, historial por strategy, métricas + fuentes + trace expandible
- `app/components/ComparePanel.tsx`: legacy 6 cards non-stream (`POST /api/proxy/compare`) — mantener solo para referencia
- `app/globals.css`: `@import "tailwindcss"` + estilos custom del compare panel / strategy cards
- `next.config.js`: rewrites `/api/proxy/*` -> `${process.env.BACKEND_URL || "http://127.0.0.1:8002"}/:path*` (Railway `https://agro-back-production.up.railway.app` en prod, `127.0.0.1:8002` en dev)

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

## Si vas a tocar el comparador

El flujo actual es streaming via `app/page.tsx` + `app/components/StrategyCard.tsx`:

- `app/page.tsx` junta `enabled` (toggles), `k`, `temperature`, `sem_bm25`/`lex_bm25`, `lang` y hace `POST /api/proxy/compare/stream` (SSE `strategy_retrieve` / `strategy_token` / `strategy_done` / `strategy_error`).
- `StrategyCard` muestra por strategy: `idle` ("Esperando una consulta...") → `retrieving` (spinner "Buscando información...") → `streaming` (tokens + `▌`) → `done` (answer + métricas `⏱ 📄 🎟` + "Ver fuentes" + "Ver trace") / `error` (❌ mensaje OpenAI).
- Cada card tiene toggle ON/OFF; `enabled` filtra qué strategies corren (default solo `baseline`).

Legacy: `app/components/ComparePanel.tsx` hace `POST /api/proxy/compare` non-stream con 6 cards (`idle`/`running`/`done`/`error`). No tocar salvo para referencia.

Las strategies se ejecutan en el backend en paralelo (`asyncio.gather` + `run_compare_stream`) y el `extra` field trae metadata (retrieval timings, trace). Las 6 del comparador default son `baseline`, `hybrid`, `rerank`, `query_rewrite`, `multi_query`, `hyde`; `lexical` y `rerank_ce` son extra (`get_extra_strategies`).

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

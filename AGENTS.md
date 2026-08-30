# AGENTS.md (frontend)

## Que es este repo

Frontend de Agroposta: chat con comparador de RAG lado a lado. La pantalla tiene 2 columnas — chat a la izquierda, comparador de 6 strategies a la derecha.

Stack: Next.js 16.2.9 + React 19.2.7 + Tailwind v4 + TypeScript 5.9.3.

## Estructura clave

- `app/page.tsx`: layout 2-col (chat izq + comparador der)
- `app/components/ComparePanel.tsx`: 6 cards con estado per-card (idle/running/done/error)
- `app/globals.css`: `@import "tailwindcss"` + estilos custom del compare panel
- `next.config.js`: rewrites `/api/proxy/*` -> `${process.env.BACKEND_URL || "http://127.0.0.1:8002"}/:path*` (Railway en prod, `127.0.0.1:8002` en dev)
- `app/page.tsx`: usa `fetch("/api/proxy/compare/stream")` relativo (evita CORS + mixed-content)

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

El componente `app/components/ComparePanel.tsx` hace `POST /api/proxy/compare` cuando el user envia una pregunta. Muestra 6 cards con estado per-card:
- `idle`: "Sin consulta"
- `running`: spinner + border pulse
- `done`: answer + métricas + botón "Ver fuentes" (expande hasta 4 sources)
- `error`: ❌ con el mensaje de OpenAI (rate limit, etc)

Las 6 strategies se ejecutan en el backend en paralelo (asyncio.gather) y devuelven sus métricas. El `extra` field del response tiene metadata por strategy.

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

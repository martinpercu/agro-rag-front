# Agroposta Frontend

Frontend de Agroposta: chat con comparador de RAG lado a lado.

## Stack

- **Next.js 16.2.9** (con Turbopack)
- **React 19.2.7**
- **Tailwind v4.3.2** (configurado via `@tailwindcss/postcss`)
- **TypeScript 5.9.3**
- **Node 22+**

## Estructura

```
agroposta-web/
├── app/
│   ├── layout.tsx                 (root layout)
│   ├── page.tsx                   (chat + comparador, 2 columnas)
│   ├── globals.css                (Tailwind v4 + estilos custom)
│   └── components/
│       └── ComparePanel.tsx       (6 cards del comparador)
├── package.json
├── next.config.js                 (rewrites /api/proxy/* -> :8002)
├── postcss.config.mjs             (@tailwindcss/postcss)
├── tsconfig.json
└── next-env.d.ts
```

## Setup

```bash
# 1. Instalar deps
npm install

# 2. Levantar dev server
npm run dev
# -> http://localhost:3002
```

El backend (`../agro-back/`) tiene que estar corriendo en `:8002` para que el proxy funcione.

## Componentes

### `app/page.tsx`
Layout 2 columnas:
- **Izquierda**: chat que pega a `POST /api/proxy/chat/stream` (SSE), muestra el answer streameando + fuentes + botón descarga PDF
- **Derecha**: comparador con 6 cards. Cuando se envia una pregunta, dispara `POST /api/proxy/compare` en paralelo

En pantallas `<1100px` de ancho, el panel se apila debajo del chat.

### `app/components/ComparePanel.tsx`
6 cards (Baseline, Hybrid BM25, Rerank LLM, Query Rewrite, Multi Query, HyDe). Cada card tiene:
- Estado per-card: `idle | running | done | error`
- Mientras corre: spinner + border pulse animado
- Cuando termina: answer + métricas (latencia, fuentes, tokens) + botón "Ver fuentes"

## Convenciones

- **Puerto**: 3002
- **API backend**: `http://127.0.0.1:8002` (proxy via `next.config.js`)
- **No commitear**: `node_modules/`, `.next/`, `out/`, `*.tsbuildinfo`
- **Tailwind v4**: se configura via `@import "tailwindcss"` en `globals.css`, no hay `tailwind.config.js`

## Ver el CLAUDE.md

`cat CLAUDE.md` para contexto adicional sobre el proyecto.

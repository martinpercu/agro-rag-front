# AGENTS.md (frontend)

## What is this repo

Frontend for Agroposta: **product** chat GPT-like + **lab** `/dev` with 7 strategies RAG. Product will evolve to richer backend events; lab stays as research zone never seen by user.

- **Product** (`/`): Odoo-like — left sidebar (logo, `Mis investigadas/planes`, user), center chat (human right bubble / assistant left), right panel thin with 2 icons `pin` + `campana` (collapsed, expands to pinned investigations). Stack Next.js 16.2.9 + React 19.2.7 + Tailwind v4, Vercel `https://agro-rag-front.vercel.app`. Chat currently uses **baseline only** (`POST /api/proxy/compare/stream` with `enabled:["baseline"]`, traced as `user:compare_stream` per Supabase user, streaming kept). Future will move to `POST /api/proxy/chat` `user:chat` with 5-node graph when needed. Values `k/temperature/sem_bm25/lex_bm25` taken from `/dev` localStorage (no UI in product).
- **Lab** (`/dev`): open, no gate — `app/(dev)/dev/page.tsx` grid 3×2 (+1) 7 strategies + toggles, for RAG investigation. Not shown to end user.

Base stack: Next.js 16.2.9 + React 19.2.7 + Tailwind v4 + TypeScript 5.9.3.

**State 2026-09-04:** product Odoo layout `globals.css` with Oliva `#3A5A40` / Tranquera tokens, Inter + Roboto_Mono, dashboard 3 cols. Both `main` branches merged (`ddde9a6` back, `4740235` front). Langfuse separation `lab:compare_stream` vs `user:chat/user:compare_stream` done.

## Key structure

- `app/(dev)/dev/page.tsx`: lab `/dev` — 7 strategies (`baseline`, `lexical`, `hybrid`, `rerank`, `query_rewrite`, `multi_query`, `hyde`) with `StrategyCard` (streaming SSE). Open, no auth gate. `fetch("/api/proxy/compare/stream")` relative, traced as `lab:compare_stream` `session_id="lab"` `tags:["lab"]` (single lab user).
- `app/(dashboard)/layout.tsx` + `app/(dashboard)/page.tsx`: product chat — layout 3 cols (left sidebar 280px | center chat max 760px | right panel thin collapsed 56px → 340px with pins), derived from Odoo `globals.css` (warm light/dark tokens + density `builder/client`). Right panel initial only 2 icons `pin` + `campana` (Odoo), no content until pins. Product chat `page.tsx:156` does `POST /api/proxy/compare/stream` with `enabled:["baseline"]` + `history` + `lang/k/temperature` + `Authorization: Bearer <supabase>` if logged, traced as `user:compare_stream` `session_id=tester` `tags:["user"]` (per Supabase user, streaming kept). Also calls `POST /api/proxy/plan/parse` after stream (`page.tsx:271`) to extract `divisions` and `POST /api/proxy/investigations` to save (both per user, `plan_parse` traced, `investigations` not traced).
- `app/components/StrategyCard.tsx`: only in `/dev` — states `idle`/`retrieving`/`streaming`/`done`/`error` + trace.
- `app/components/ChatBubble.tsx` / `MessageList.tsx` / `Composer.tsx`: product chat — human right / assistant left bubbles (Odoo style), collapsible sources.
- `app/components/ComparePanel.tsx`: legacy 6 cards non-stream — keep as reference.
- `app/globals.css`: Odoo `globals.css` base (tokens `:root`/`dark` + `@theme inline` + density), then adapted to field green Oliva/Tranquera. `DESIGN_GUIDELINES.md` / `../design-system/` as reference.
- `app/lib/supabase.ts`: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` (publishable `sb_publishable_...`), `supabase.auth.getSession()` used in `page.tsx:142`.
- `next.config.js`: rewrites `/api/proxy/*` -> `${process.env.BACKEND_URL || "http://127.0.0.1:8002"}/:path*` (Railway prod, 127 dev)

## Useful commands

```bash
npm install                # install deps
npm run dev                # dev server on :3002 (next dev -p 3002)
npm run build              # production build
npm run start              # production server

# Backend must be running on :8002:
cd ../agro-rag-back && set -a; source .env; set +a
export LANGFUSE_HOST=http://localhost:3003
export LANGFUSE_PUBLIC_KEY=pk-lf-1a76f15c-9fa5-41fd-a58f-ed4755633990
export LANGFUSE_SECRET_KEY=sk-lf-8557a1d4-ac9b-47bc-ace9-997df892edbc
uv run uvicorn api.main:app --host 127.0.0.1 --port 8002 --app-dir src  # pinecone 768

# Tail logs:
tail -f /tmp/agro-front.log
tail -f /tmp/agro-back.log
```

## Conventions

- **Dev server port:** `3002` (Langfuse UI is `3003`, not conflict)
- **Tailwind v4:** no `tailwind.config.js`, via `@import "tailwindcss"` in `globals.css`
- **Don't commit:** `node_modules/`, `.next/`, `out/`, `*.tsbuildinfo`
- **Custom CSS** vars in `app/globals.css` — use `:root` vars (`--bg`, `--accent`, etc) not hardcoded hex
- **Design tokens:** Oliva `#3A5A40` primary, Tranquera dark, Inter + Roboto_Mono (`app/layout.tsx:1`)

## Branch workflow (mandatory since 2026-09-03)

Never to `main` directly. Baby steps in independent branch per repo:

```bash
git checkout -b feat/<name> && git push -u origin feat/<name>
# ... small commits ...
git status; git diff; git log --oneline -5
git add <files> && git commit -m "feat: ..." && git push
# PR → merge to main done by martin in GitHub (Vercel deploys)
```

Branches front and back **DO NOT go in parallel by default**. Each repo handles its own branch if the change is only there. Only when the session requires implementing from both sides (e.g. API contract change) create branches with same name in both and coordinate from root.

## If you touch the comparator / chat

- **Lab `/dev` (`app/(dev)/dev/page.tsx` + `StrategyCard.tsx`):** collects `enabled` (toggles), `k`, `temperature`, `sem_bm25`/`lex_bm25`, `lang` and does `POST /api/proxy/compare/stream` (SSE `strategy_retrieve`/`strategy_token`/`strategy_done`/`strategy_error`). Each card `idle`→`retrieving`→`streaming` (▌)→`done` (`⏱ 📄 🎟` + sources + trace) / `error`. Values chosen here are inherited by product (no UI for this in `/`). **Lab traced as `lab:compare_stream` `lab` user, never per real user.**
- **Product chat (`app/(dashboard)/page.tsx`):** 1 bubble per turn, currently `POST /api/proxy/compare/stream` with `enabled:["baseline"]` + `history` (previous messages), traced as `user:compare_stream` `sessionId=tester` (per Supabase user, streaming kept). Future move to `POST /api/proxy/chat` `user:chat` with 5-node graph when product needs richer events. Does not show `k/temperature` — inherits from `/dev`. Right panel thin with `pin`/`campana` icons (Odoo `app/globals.css:291` sidebar 240px→56px collapsed). Also does `POST /api/proxy/plan/parse` after stream to get `divisions` + `POST /api/proxy/investigations` to save.
- **Backend:** `run_compare_stream` fan-out (`asyncio.gather`) + `trace` per strategy. Default 6 are `baseline`, `hybrid`, `rerank`, `query_rewrite`, `multi_query`, `hyde`; `lexical` and `rerank_ce` extra. Product `user:chat` will use `src/agent/graph.py` 5 nodes instead.

Legacy: `ComparePanel.tsx` non-stream `POST /api/proxy/compare` 6 cards — reference only.

## Observability — Langfuse separation

- **Lab `/dev`:** trace `lab:compare_stream` `session_id="lab"` `user_id="lab"` `tags:["lab"]` — single lab user, not per real Supabase user, so `Users`/`Sessions` not polluted. See `src/api/main.py:203` `is_lab = not (enabled==["baseline"])`.
- **Product `/`:** trace `user:compare_stream` (current) and `user:chat` (future) `session_id=userId` (`_extract_session_id()` from `Authorization: Bearer <jwt>.sub` or `X-User-Id`, fallback `anon`) `tags:["user"]` — per Supabase user (`alice@example.com` vs `bob@example.com` distinct in Langfuse `Users`/`Sessions`). Keeps streaming (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`).
- UI: `http://localhost:3003/project/cmtm1hco50006jt0775kjzrvg` → filter `tags:lab` vs `tags:user`, or `name:lab:compare_stream` vs `user:compare_stream`/`user:chat`.

## If you touch the layout

The layout 2-col is CSS Grid:
- `grid-template-columns: minmax(0, 1fr) 420px` on desktop
- Stack vertical on `<1100px`
- Chat pane has own scroll (`max-height: calc(100vh - 280px)`)

Composer (input) is fixed at bottom with `position: fixed; bottom: 0`.

## If you moved the repo or path changed

If repo path changes (e.g. `mv agro-rag-front/ /other/` or fresh clone), Turbopack loops with `Next.js package not found` because `node_modules` and `.next` have hardcoded absolute paths.

Symptom: `localhost:3002` reloads infinitely and log shows:
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

Always apply after any move, rename, or fresh clone.

## Supabase keepalive

Supabase project `https://ujytfzskyizupdvuxewq.supabase.co` pauses if no auth activity. Keep alive via any `supabase.auth.*` call. Last keepalive `keepalive-...@gmail.com` `98445c8d...` via `node /tmp/supabase_keepalive3.cjs` (`supabase.auth.signUp`). Frontend `page.tsx:142` `supabase.auth.getSession()` on every chat already hits Auth, but do a manual `signUp` every 2-3 weeks if not using front.

## Rate limit of backend

Backend has OpenAI rate limit (200K TPM default). If you see many cards with ❌ and "Rate limit reached", it's backend out of budget. Solutions: wait 1 min, upgrade tier, or fewer sequential questions in report.

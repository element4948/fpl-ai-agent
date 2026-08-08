# FPL AI Agent

Personal, data-assisted Fantasy Premier League decision system. It builds pre-season drafts, explains player selection, recommends a starting XI/captain/transfers, creates a 3–8 Gameweek roadmap, and analyzes a connected FPL entry and mini-league when public FPL data is available.

> Important: this is a decision-support tool, not an autonomous FPL account manager. It never submits transfers, captains, chips, or lineups to FPL.

## Current architecture

- Next.js 16 App Router, React 19, TypeScript.
- Official FPL API is the primary source for players, prices, fixtures, entry picks, history, and leagues.
- API-Football is optional enrichment for current-team lineup/minutes/stat evidence.
- Recent news is optional supporting evidence and is never treated as official confirmation by itself.
- Upstash Redis/Vercel KV REST is optional and only used to sync the owner's settings across browsers.
- The dashboard has a fast Official-FPL response followed by a slower verified response.

Read these before changing model behavior:

1. [AGENTS.md](./AGENTS.md)
2. [Architecture](./docs/ARCHITECTURE.md)
3. [Data sources](./docs/DATA_SOURCES.md)
4. [Model and optimizer](./docs/MODEL_AND_OPTIMIZER.md)
5. [Operations](./docs/OPERATIONS.md)
6. [Testing](./docs/TESTING.md)
7. [Known limitations](./docs/KNOWN_LIMITATIONS.md)

The in-app `/docs` page is a user guide. Files under `docs/` are the developer/AI handoff source.

## Local setup

Requirements:

- Node.js 20 or newer
- npm

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. If another app uses that port, Next.js may select another port.

Production verification:

```bash
npm run build
npm run start
```

## Environment variables

All variables are optional for a basic Official-FPL-only local run.

| Variable | Purpose |
|---|---|
| `API_FOOTBALL_KEY` | Optional API-Football enrichment. Never expose in client code. |
| `KV_REST_API_URL` | Upstash/Vercel KV REST endpoint. |
| `KV_REST_API_TOKEN` | Upstash/Vercel KV REST token. |
| `UPSTASH_REDIS_REST_URL` | Supported alias for the KV URL. |
| `UPSTASH_REDIS_REST_TOKEN` | Supported alias for the KV token. |
| `FPL_APP_PASSWORD` | Owner login password for cross-browser profile sync. |
| `FPL_SESSION_SECRET` | Long random secret used to sign the owner session cookie. |

Never commit `.env.local` or real keys. `.env*` is ignored except `.env.example`.

## Main routes

| Route | Method | Purpose |
|---|---|---|
| `/api/bootstrap?fast=1` | GET | Fast Official-FPL dashboard and Best draft. |
| `/api/bootstrap` | GET | Enriched dashboard and all four draft modes. |
| `/api/analyze` | POST | Analyze a public FPL entry squad. |
| `/api/decision` | POST | Weekly decision/captain/transfer/chip summary. |
| `/api/league` | POST | Mini-league standings and gap strategy. |
| `/api/player/:id` | GET | Player evidence, history, and fixtures. |
| `/api/fixture-status` | GET | Official fixture freshness/status. |
| `/api/session` | GET/POST/DELETE | Owner session. |
| `/api/profile` | GET/PUT/DELETE | Cloud-synced settings. |

## Safe contribution workflow

Work on `main` unless the owner explicitly requests another branch.

1. Inspect `git status` and preserve existing user changes.
2. Do not replace or delete whole folders.
3. Change the smallest relevant engine and update its documentation.
4. If dashboard model output changes, bump both cache keys in `app/api/bootstrap/route.ts`.
5. Run `npm run build`.
6. Run the manual draft/API checks in `docs/TESTING.md`.
7. Commit only files belonging to the requested change.
8. Push/deploy only when explicitly requested.

## Trust boundary

A legal squad is not automatically a final recommendation. `validation.valid` checks FPL construction rules; `trust.status` checks evidence readiness. Pre-season or incomplete external evidence can leave a draft provisional/insufficient even when the squad is legal.

# Architecture

## Goal

Convert football/FPL data into a small number of explainable decisions: initial squad, starting XI, captain/vice, transfer/roll, chip posture, and multi-Gameweek plan.

## Runtime flow

```text
Official FPL APIs ─┐
API-Football ──────┼─> ModelPlayer[] ─> risk/starter/position/projection
Recent news ───────┘                       │
                                           ├─> targets/captains
                                           ├─> draft optimizer + validation
FPL Entry/Picks ───────────────────────────┼─> my-team analysis/transfers
League standings ──────────────────────────└─> league strategy
```

## Frontend

- `app/page.tsx`: client dashboard, profile/settings, progressive data loading, all primary sections.
- `app/globals.css`: responsive visual system.
- `components/`: small shared UI components.
- `app/docs/page.tsx`: user-facing guide.

## API layer

- `bootstrap`: dashboard payload. Fast mode omits external verification and builds only Best. Full mode enriches candidates and builds Best/Alternative/Differential/Safe.
- `analyze`: loads a public entry and its current/last public picks, enriches the selected players, then validates and recommends lineup/transfers.
- `decision`: builds the weekly action summary from a live squad, saved planned squad, or model draft.
- `league`: reads the first standings page and returns managers above the owner plus a basic gap strategy.
- `player/:id`: detailed history, upcoming fixtures, external evidence.
- `profile`/`session`: optional single-owner cloud settings.

## Domain pipeline

1. `lib/fpl.ts` fetches Official FPL data and creates `ModelPlayer` objects.
2. `lib/player-identity.ts` verifies provider IDs/names inside the confirmed current team; `lib/api-football.ts` only applies minutes/lineup/stat evidence after that gate passes.
3. `lib/external-news.ts` optionally classifies and verifies recent news signals.
4. `lib/starter.ts`, `risk.ts`, `confidence.ts`, `position-model.ts`, and projection code enrich player readiness and upside.
5. `lib/scoring.ts` ranks targets/captains.
6. `lib/rules.ts` and `squad-optimizer.ts` construct and validate drafts.
7. `lib/lineup.ts` chooses a legal formation and orders the bench.
8. `lib/transfers.ts`, `decision.ts`, `season-roadmap.ts`, and `chips.ts` create actions.

`types/fpl.ts` is the shared domain schema. Modify it before changing API/UI contracts.

## Caching

- Official FPL fetches and dashboard payloads use Next caching.
- Fast dashboard: five-minute server cache plus stale-while-revalidate.
- Verified dashboard: fifteen-minute server cache plus stale-while-revalidate.
- Optional verified providers have per-source time budgets. A slow API-Football/news/history adapter returns an explicit unavailable/partial state instead of holding the main recommendation indefinitely.
- Cache keys include a manual version suffix. Bump both fast and verified keys after model/schema changes.
- The frontend intentionally shows fast data first, then requests verified data. Never allow a failed enrichment request to blank the draft section.

## Persistence and security

- Without KV configuration, settings remain local to the browser.
- With Upstash/KV and owner credentials, settings are stored under one fixed personal-profile key.
- Session cookie is HTTP-only, same-site lax, secure in production, and valid for one year.
- This is single-owner authentication, not multi-user authorization.

## Deployment

GitHub `main` is the production source. Vercel should build the Next.js project with the environment variables documented in `OPERATIONS.md`.

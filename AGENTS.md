# Instructions for AI coding agents

This repository belongs to a single user and directly supports their FPL decisions. Optimize for correctness, explainability, current evidence, speed, and safe incremental changes.

## Mandatory reading order

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DATA_SOURCES.md`
4. `docs/MODEL_AND_OPTIMIZER.md`
5. `docs/TESTING.md`
6. `docs/KNOWN_LIMITATIONS.md`

## Non-negotiable rules

- Work on `main` unless the user explicitly requests another branch.
- Inspect current branch, status, and uncommitted changes first.
- Never delete or replace an entire folder to add one file.
- Never restore/revert user changes unless the deletion/change is clearly accidental and scoped.
- Never commit secrets, `.env.local`, `.next`, `node_modules`, or `.vercel`.
- Never claim a data source was checked unless the response contains evidence from that source.
- Never interpret missing risk/news data as zero risk.
- Never force premium players because of price/reputation; compare marginal projected points.
- Never choose cheap players solely to meet budget; Starting XI players must pass the strict starter gate.
- Bench players follow the lean emergency-cover policy documented in `MODEL_AND_OPTIMIZER.md`.
- A single difficult fixture does not justify permanent premium bench spend; the roadmap/free-transfer layer handles planned fixture changes.
- No-hit transfers are the default. Any hit must show expected net gain after hit cost and durable multi-GW benefit.
- FPL public APIs cannot reveal a private pre-deadline squad. Do not label that as an invalid Entry ID.
- The application recommends actions only; do not automate actions on the official FPL account.

## Required verification

- Run `npm run build` after TypeScript/code changes.
- For draft changes, inspect real `/api/bootstrap?fast=1` output: 15 players, legal positions, max 3 per club, budget/bank target, 11 starters, 4 bench, bench cost target, and no bench overspend error.
- For full-mode changes, inspect `/api/bootstrap` when external calls are available.
- Update cache keys in `app/api/bootstrap/route.ts` whenever output logic/schema changes, otherwise users may see stale drafts.
- Update relevant documentation in the same change.

## High-risk files

- `lib/fpl.ts`: transforms raw source data into the central `ModelPlayer`.
- `lib/rules.ts`: draft gates, fallback, bench rebalancing, final validation.
- `lib/squad-optimizer.ts`: bounded global squad search.
- `lib/lineup.ts`: formation, XI, and bench ordering.
- `lib/scoring.ts`, `lib/position-model.ts`: player/captain/position ranking.
- `lib/transfers.ts`: transfer legality and gain.
- `app/api/bootstrap/route.ts`: caching and fast/full payload behavior.

Change these only after reading their complete current contents. Do not copy old implementations from historical update files.

## Documentation authority

- Current developer truth: `README.md`, `AGENTS.md`, and `docs/`.
- User-facing explanation: `app/docs/page.tsx`.
- Files named `*_UPDATE.md`, `START_HERE.md`, or `REPLACE_INSTRUCTIONS.md` are historical records, not current implementation instructions.

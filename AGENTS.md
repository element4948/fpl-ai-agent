# Instructions for AI coding agents

This repository belongs to a single user and directly supports their FPL decisions. Optimize for correctness, explainability, current evidence, speed, and safe incremental changes.

## Mandatory reading order

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DATA_SOURCES.md`
4. `docs/MODEL_AND_OPTIMIZER.md`
5. `docs/TESTING.md`
6. `docs/KNOWN_LIMITATIONS.md`

## Multi-agent coordination

More than one AI coding agent works on this repository (for example OpenAI
Codex and Claude), one at a time. Git on `main` is the single source of
truth, and `HANDOFF.md` is the shared living state note. Follow this to make
switching agents safe and conflict-free.

### Start-of-session checklist

1. Read `AGENTS.md` (this file), then `README.md`, then `docs/`.
2. Read `HANDOFF.md` to learn current state, work in progress, and next steps.
3. Run `git status` and `git log --oneline -5`. Confirm the working tree is
   clean and you are on `main` (or the branch the owner named).
4. If the working tree is NOT clean, do not start new work. Reconcile first:
   the previous agent may have left unfinished changes described in
   `HANDOFF.md`. Commit, or ask the owner, before proceeding.
5. Bring `main` up to date before editing (`git pull` when a remote is
   reachable), so you build on the latest commit, not a stale copy.

### During the session

- Make small, focused commits. Do not accumulate a large uncommitted diff.
- Change only the files the requested task needs. Never `git add -A`
  blindly; add specific paths so scratch files never get committed.
- Never delete or replace an entire folder to add one file.

### End-of-session checklist (handoff)

1. Run `npm run build` (or at least `npm run lint`) after any code change.
2. Update `HANDOFF.md`: current state, anything left in progress, next
   steps, a dated "Recent activity" line, and any gotchas.
3. Update `CHANGELOG.md` and relevant `docs/` when behavior changes.
4. Commit with a clear message (see convention below). Leave the working
   tree clean so the next agent starts from a known state.
5. Push only when the owner explicitly requests it.

### Commit message convention

Use short, typed, imperative subjects so history is readable across agents:

- `feat: ...` new user-facing capability
- `fix: ...` bug fix
- `refactor: ...` behavior-preserving restructuring
- `docs: ...` documentation only
- `chore: ...` tooling/config/housekeeping

### Never leave a broken handoff

Do not end a session with a half-applied change, a failing build, or a
dirty tree that the next agent cannot interpret. If you must stop early,
commit a `wip:` checkpoint and describe exactly what is unfinished in
`HANDOFF.md`.

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

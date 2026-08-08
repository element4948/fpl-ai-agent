# Handoff — shared state for AI coding agents

> Purpose: this repository is developed by more than one AI coding agent
> (e.g. OpenAI Codex and Claude), one at a time, on the same `main` branch.
> Git is the single source of truth. This file is the living handoff note.
> Every agent MUST read this file at the start of a session and update it at
> the end. Keep it short, current, and honest.

## How to use this file

- At session start: read this file, then follow the start checklist in `AGENTS.md`.
- During the session: keep working-tree changes scoped and committed in small steps.
- At session end: update the three sections below, then commit.

---

## Current state

- Branch: `main`
- Last commit: `dcea0da` (stage 2 reliability + deploy).
- Build/typecheck: `npm run build` and `npm run lint` (now full `strict`) pass.
- Tests: `npm run test` (vitest) — 12 passing. NOTE: run `npm install` first to
  pull the newly added `vitest` devDependency.
- Working tree at handoff: clean. Local commits are NOT yet pushed to origin.

## In progress / not finished

Improvement plan has 4 stages (see GAP_ANALYSIS). Stages 1-2 DONE and committed:

- Stage 1 (`7689d3d`): team-strength scale fix, selling-price estimate in
  transfers, targetScore risk sign, degraded-data safety, FPL User-Agent,
  errors no longer cached.
- Stage 2 (`dcea0da`): full `strict` TS, vitest unit tests, GitHub Actions CI,
  vercel.json crons + route `maxDuration`, whole-word news matching.

Stages 3-4 NOT started (next work):

- Stage 3 (model quality): wire `lib/player-history.ts` into a real minutes
  model; opponent/venue-adjusted xGI + `expectedGoalsConceded` clean sheets;
  offline backtest + bias correction; multi-transfer/hit plans; rolling
  transfer roadmap; chip EV.
- Stage 4 (UX): copy-picks / FPL deep-link; live deadline countdown;
  de-duplicate the decision cards + per-pick trust chips; verify/repair mobile;
  split the ~2000-line `app/page.tsx` into components.

## Next steps / open priorities

Start Stage 3 with the minutes model (highest scoring-accuracy leverage), then
xGI/xGC, then backtest. Keep each change small, run `npm run build`+`npm run test`,
update this file, commit.

Deferred/optional (from audit, not yet done): session-token expiry, profile
route try/catch, optimizer beam-width/labeling, `any` cleanup in page.tsx.

## Recent activity (newest first)

- 2026-08-08 — Stage 2: strict TS + tests + CI + deploy config + news matching (`dcea0da`).
- 2026-08-08 — Stage 1: correctness fixes (`7689d3d`).
- 2026-08-08 — Added multi-agent coordination protocol (`431aa5e`).

## Gotchas / notes for the next agent

- `main` is the production/Vercel source. Push only when the owner requests it.
- Never commit `.env.local`, `.next`, `node_modules`, or secrets.
- After any code change run `npm run build` and `npm run test` before committing.
- If dashboard model output/schema changes, bump BOTH cache keys in
  `app/api/bootstrap/route.ts`.
- FPL API blocks datacenter IPs (403); it works from residential IPs / Vercel
  with the User-Agent added in `lib/fpl.ts`. You cannot hit the FPL API from
  every CI/sandbox environment.
- `_to_delete/` (if present) is scratch that could not be auto-removed; safe for
  the owner to delete, must not be committed.
- `GAP_ANALYSIS.md` (delivered to the owner) is the full audit behind these stages.

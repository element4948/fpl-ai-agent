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
- Last committed baseline before this session: `a0960da` (shared finished-Gameweek calibration).
- Current change set: parallel calibration/provider loading, immutable one-write-per-Gameweek forecast persistence and dashboard cache v23.
- Verification in this workspace: Next production compilation and production TypeScript check succeed; direct identity regression checks pass. Full Vitest remains blocked because local `node_modules` is missing the committed `vitest` dependency and network access cannot download it; run `npm install && npm run build && npm run test` in a networked environment before deployment.
- Working tree should be clean after the current scoped commit. Local commits are not pushed unless the owner asks.

## In progress / not finished

Improvement plan has 4 stages (see GAP_ANALYSIS). Stages 1-2 DONE and committed:

- Stage 1 (`7689d3d`): team-strength scale fix, selling-price estimate in
  transfers, targetScore risk sign, degraded-data safety, FPL User-Agent,
  errors no longer cached.
- Stage 2 (`dcea0da`): full `strict` TS, vitest unit tests, GitHub Actions CI,
  vercel.json crons + route `maxDuration`, whole-word news matching.

Stages 3-4 NOT started (next work):

- Stage 3 (model quality) — DONE: multi-transfer/hit plans (`d43c0f0`, exposed as `transferPlans`).
  Backtest harness added (`scripts/backtest.mjs`, `npm run backtest`) — RUN IT on a
  machine with FPL API access once the season has a few finished GWs, then
  calibrate per-position from backtest-report.json.
  TODO: wire `lib/player-history.ts` into a real minutes
  model; opponent/venue-adjusted xGI + `expectedGoalsConceded` clean sheets;
  offline backtest + bias correction; multi-transfer/hit plans; rolling
  transfer roadmap; chip EV.
- Stage 4 (UX) — DONE (part 1, `d2a3680`): deadline countdown, copy-picks + FPL
  link, degraded-data banner, transferPlans surfaced in the decision card.
  DONE (`dec90e1`): per-pick trust chips; EV chip planner. Mobile: globals.css
  already has responsive rules (decision grid, target table, pitch, overflow-x) —
  no fix needed.
  IN PROGRESS: page.tsx split — cache/persistence extracted to lib/dashboard-cache.ts
  (`36815a5`) and badges to components/PlayerBadges.tsx (`7c51172`). NEXT: extract
  PlayerRow, DraftCard, RiskMonitor into components/. DONE so far: MoreSection,
  SeasonRoadmapCard, PlayerBadges, dashboard-cache. NOTE: RiskMonitor/DraftPlayerTile/
  PlayerRow depend on PlayerDetailButton — extract the PlayerDetail trio (shared
  window-event) first, then those. `dict` is imported from @/lib/i18n so components can import it too.
  CAUTION: openPlayerDetail/PlayerDetailButton/PlayerDetailModal share a window
  event mechanism — extract them together.
  Optional: de-duplicate decision vs lower detail cards.

## Next steps / open priorities

Next model priority is observing the first finished-Gameweek calibration samples, then validating correction/readiness output against the offline backtest before changing thresholds.
Keep each change small, run `npm run build`+`npm run test`, update this file, commit.

Deferred/optional (from audit, not yet done): session-token expiry, profile
route try/catch, optimizer beam-width/labeling, `any` cleanup in page.tsx.

## Recent activity (newest first)

- 2026-08-15 — Removed calibration from the verified dashboard's serial critical path and changed per-Gameweek forecast persistence to one immutable KV write.
- 2026-08-15 — Added shared KV forecast snapshots, Official FPL event-live evaluation and conservative position-level calibration correction after 3 events / 60 samples.
- 2026-08-15 — Wired Official FPL recent-five starts/minutes/60+ rate/trend into role projections for a bounded shortlist and reduced overlapping API-Football role weight.
- 2026-08-15 — Added one-per-club official news searches for shortlisted players, per-feed coverage, collision-safe aliases and correct independent-publisher corroboration.
- 2026-08-15 — Added a bounded structured international-minutes scan, identity-safe joins, recovery-time fatigue adjustments, readiness/UI coverage and regression tests.
- 2026-08-14 — Added API-Football player identity verification using current team, full/display-name scoring, stable provider IDs and ambiguity rejection; only verified identities can alter minutes/starter projections.
- 2026-08-14 — Added same-position counterfactual explanations without player-name rules, explicit available/partial/missing source readiness, and Telegram entry/rank, differential, chip and coverage sections.
- 2026-08-14 — Expanded the existing API-Football key usage to separately weighted 45-day club-friendly lineup/minutes and upcoming PL odds; fixed previous-season PL fallback suppressing current friendly evidence; added press-conference report signals and explicit international-minutes gap reporting.
- 2026-08-14 — Normalized dashboard spacing; moved Telegram digest to 17:00 Ulaanbaatar, added long-message chunking and owner-only manual sends; corrected draft gate-rank and legal-formation validation labels.
- 2026-08-09 — Refactor: extracted MoreSection + SeasonRoadmapCard to components/; gitignored auto-generated next-env.d.ts.
- 2026-08-08 — Refactor: extracted DataQualityBadge/FixtureTrendBadge to components/PlayerBadges.tsx (`7c51172`).
- 2026-08-08 — Refactor: extracted dashboard/decision caches to lib/dashboard-cache.ts (`36815a5`), first step of page.tsx split.
- 2026-08-08 — Stage 4: per-pick trust chips + EV-based chip planner; verified mobile CSS is already responsive (`dec90e1`).
- 2026-08-08 — Stage 4 (part 1): deadline countdown, copy picks, FPL link, degraded banner, transferPlans surfaced (`d2a3680`).
- 2026-08-08 — Stage 3: offline backtest harness `scripts/backtest.mjs` (`9985933`).
- 2026-08-08 — Stage 3 (part 1): multi-transfer + hit-aware transfer plans (`d43c0f0`).
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
- In the 2026-08-14 local workspace, `node_modules` did not contain Vitest even though it is declared in the lockfile. Do not weaken TypeScript configuration to hide this; install dependencies with modern Node/npm when network is available.
- `GAP_ANALYSIS.md` (delivered to the owner) is the full audit behind these stages.

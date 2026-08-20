# Changelog

## 2026-08-15

- Added per-source Fresh/Aging/Stale/Missing tracking and removed expired, uncorroborated first-choice boosts from starter minutes, Expected Points and draft eligibility.
- Added calibration drift protection with collecting/uncertain/ready/paused states and automatic rollback when deployed MAE underperforms the saved baseline.
- Added calibration sample-gate progress, estimated multiplier uncertainty, and before/after position xP ranks.
- Added before/after xP provenance and isolated calibration contribution to transfer gain.
- Exposed active position calibration on player, draft, captain, transfer and detail views with multiplier/sample/Gameweek provenance.
- Parallelized calibration I/O with verified provider scans and reduced immutable forecast persistence from two KV requests to one.
- Added a shared server-side forecast calibration loop using finished-Gameweek Official FPL live points, position-level MAE/bias tracking, and conservative sample-gated projection correction.
- Added bounded Official FPL recent-five history enrichment for starter confidence, predicted minutes, role trend and draft eligibility, with API-Football overlap de-duplicated.
- Added one-per-club official-domain news searches for verified draft candidates, conservative player-name aliases, per-feed coverage, and correct publisher-domain corroboration.
- Made confirmed/corroborated news update risk breakdown consistently with availability, minutes and projections.
- Added quota-bounded API-Football international fixture/minutes enrichment using the verified player-identity gate.
- Added recovery-time-based international fatigue risk without treating national-team minutes as proof of a Premier League starting role.
- Exposed international fixture/player coverage in Model Readiness and the dashboard source status.

## Unreleased

- Corrected the Starting XI pitch order and center-line orientation; forwards now appear ahead of midfield, defence, and goalkeeper on every responsive layout.
- Removed clipped fixed-height Starting XI cards and constrained every formation row to an explicit pitch column, preventing intrinsic-width overflow into the bench while keeping rows centered across desktop and mobile.
- Scheduled a 30-minute critical-change monitor with KV-safe, decision-aware Telegram reminders at 24h, 6h, and 90m before the deadline.
- Added My Team-first monitoring across decision/Telegram flows, semantic news clustering with source counts, a compact deadline-decision contract/UI, bounded decision enrichment, and cache-age delivery telemetry.
- Added bounded verified-provider latency, per-source timing/timeout status, a Best-squad-first critical-news brief, browser-side new-item detection, and conservative trusted-claim conflict resolution.
- Hardened official-news hostname verification, changed corroboration from category-level to semantic claim-level, and separated unrelated headlines from availability evidence.
- Kept legal squad validation separate from evidence trust and made verified dashboard payloads explicitly degraded while draft evidence remains incomplete.
- Added provider-ID, current-team and full/display-name identity verification for API-Football evidence; ambiguous same-team matches are rejected before they can alter projections.
- Expanded the existing API-Football connector with separately weighted 45-day club-friendly lineup/minutes and upcoming match-winner odds checks, plus published press-conference news detection; no new credential is required.
- Added name-independent draft counterfactuals that compare every selected player with the strongest omitted same-position alternative and explain budget, club-limit, projection, fixture and whole-squad trade-offs.
- Added explicit source-readiness coverage and critical-gap reporting; missing external evidence no longer looks complete.
- Expanded Telegram decisions with entry/rank, differential, chip and data-coverage sections.
- Normalized dashboard spacing across desktop, tablet, and mobile sections.
- Scheduled the daily Telegram digest for 17:00 Ulaanbaatar, added safe long-message chunking, and protected manual production sends with the owner session.
- Corrected draft formation validation wording and removed false final-gate `#1` ranks for ineligible players.
- Added complete AI/developer handoff documentation.
- Added multi-agent coordination protocol (HANDOFF.md + AGENTS.md section) for safe Codex/Claude handoffs.
- Documented architecture, sources, optimizer invariants, operations, testing, and limitations.
- Marked legacy ZIP/replace notes as historical.

## 2026-08 — Draft budget and usability

- Reworked the draft UI and responsive pitch layout.
- Added source/criteria/rank visibility and compact player evidence.
- Added fast and verified dashboard loading.
- Added lean-bench hard constraints and emergency-cover policy.
- Reinvested bench savings into the Starting XI.
- Added paired cross-position budget reallocation.
- Added cross-browser owner profile sync through optional Upstash/Vercel KV.

## Earlier v4/v5 foundation

- Added Decision Engine, fixture engine, bilingual UI, risk/confidence explanations, entry analysis, captain, transfer, league, chip, and documentation pages.

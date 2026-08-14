# Changelog

## Unreleased

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

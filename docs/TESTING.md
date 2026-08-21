# Testing contract

The repository has a Vitest unit suite and GitHub Actions CI. Automated tests cover core model regressions, but every model change still requires the manual API checks below because external provider availability and live FPL data cannot be fully represented by fixtures.

## Required build

```bash
npm run build
npm run test
```

## Draft API checks

Run the app, request `/api/bootstrap?fast=1`, and verify Best:

- 15 unique players;
- 2 GKP, 5 DEF, 5 MID, 3 FWD;
- maximum three per team;
- total cost does not exceed mode maximum spend;
- bank meets mode target;
- 11 starters and 4 bench players;
- legal formation;
- all XI players pass reliable starter requirements;
- bench cost is at or under reported usable target/tolerance;
- four emergency-cover candidates reported;
- no bench overspend validation error;
- fixture arrays and FDR values are present when Official FPL fixtures are available.
- every selection-audit alternative is same-position and reports a legal-swap blocker honestly;
- source readiness distinguishes available, partial and missing feeds instead of reporting configured sources as successful.

Request `/api/bootstrap` and repeat for Best, Alternative, Differential, and Safe when external services are available. A failed external provider must not produce an empty draft array.

## Regression scenarios

1. Cheap but zero-minute player: must not enter XI solely because of price/FDR.
2. Confirmed injury/transfer-away warning: must be blocked or clearly provisional.
3. Reliable £4.5 GKP versus £6.0 GKP: premium wins only when marginal xP justifies reallocation.
4. Expensive bench: optimizer must rebuild lean cover and reinvest savings in XI.
5. Paired reallocation: downgrade in one position plus upgrade in another can beat two individually impossible moves.
6. Club-limit edge: replacement never creates a fourth player from one club.
7. Entry before deadline: return the public-picks limitation, not “invalid ID”.
8. No API-Football key: Official-FPL dashboard still works.
9. KV missing: local settings still work and cloud API reports unconfigured.
10. Mobile widths: no horizontal page overflow and all 11 pitch cards remain accessible.
11. Better omitted player: selection audit explains projection/price/fixture deltas and whether budget, club limit, or global squad balance blocked the direct swap.
12. Telegram digest: leads with one clear action block; separates My Team risks from transfer-target warnings; states the free-transfer assumption; renders entry/rank, captain/vice, transfer or hold, differential, chip advice, league context and coverage when available; and never labels a pre-deadline watchlist player as the owner's captain.
13. API-Football limited plan: unavailable friendly/odds endpoints leave explicit zero coverage and never remove Official-FPL drafts.
14. Friendly evidence: affects starter confidence less than two or more current-season competitive starts.
15. Pre-season fallback: previous-season PL evidence does not suppress current-season friendly starts/minutes, and the two samples are never averaged into one role rate.
16. Identity collisions: exact full names match, unique surname tokens may match within one confirmed team, but two same-team surname candidates must be rejected as ambiguous.
17. Provider-ID consistency: one FPL player cannot receive evidence from two different API-Football player IDs in the same scan.
18. International minutes: only identity-verified provider IDs receive minutes; recent heavy workload increases fatigue risk, older/light workload decays, and the signal never raises club starter confidence.
19. Official-club news: team-domain feeds are matched by full/display/unique-surname aliases; same-team surname collisions are rejected; Google redirect URLs do not collapse two publisher domains into one source.
20. News source trust: lookalike publisher domains never become official through substring matching, unrelated headlines remain `other`, and different claims in one category do not corroborate each other.
21. News contradictions: a newer official return/stay can supersede an older warning, while an unverified secondary claim cannot erase a trusted injury/transfer warning.
22. Provider latency: optional verified adapters respect their dashboard time budgets, expose timeout/timing state, and never remove the Official-FPL draft.
23. Deadline decision: one response contains captain/vice, transfer-or-hold, chip, 11-player legal XI, four-player bench, critical risks and readiness.
24. News clustering/priority: equivalent claims collapse to the strongest source with source count; My Team precedes transfer targets and general Best-draft news.
25. Recent minutes: five strong starts raise minutes confidence, repeated low-minute appearances lower it, empty/pre-season history has no effect, and API-Football does not reapply the same current-match role at full weight.
26. Starting XI pitch: rows render FWD, MID, DEF, GKP from top to bottom, remain horizontally centered, show each card without vertical clipping, and keep the center line horizontal on desktop and mobile.
27. Deadline reminders: 24h/6h/90m windows select correctly, expired deadlines do not send, and an unchanged decision produces the same dedup key.
28. Pitch-card readability: every starter card has the same compact hierarchy (identity, xP/starter/risk, all five upcoming fixtures, details), long names truncate safely, and optional warnings do not hide the core metrics.
29. Optimizer objective alignment: immediate projection remains the largest starter signal, but a materially stronger mode-specific multi-Gameweek score can win a close comparison; completed-state ranking and bench reinvestment use the same objective.
30. Role transition: a trusted explicit move to the player's current FPL club cannot carry a previous-club nailed label into the XI without current-team role evidence; unrelated transfer rumours and player names are never blacklisted.

## Transfer checks

- same-position replacement;
- within bank/selling-price budget approximation;
- club limit respected;
- free-transfer count clamped to 0–5;
- incoming player passes starter/risk/news gates;
- hit suggestions show net gain after cost and are not the default.

## Documentation checks

When behavior changes, update `docs/MODEL_AND_OPTIMIZER.md`, the user-facing `/docs` page where relevant, cache keys, and `CHANGELOG.md`.

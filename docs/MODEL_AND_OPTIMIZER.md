# Model and optimizer contract

This document describes invariants. Current numeric weights live in code and must be reviewed there before editing.

## Central player model

`ModelPlayer` in `types/fpl.ts` contains identity, FPL price/position/team, official totals, projection horizons, fixtures, starter/minutes probability, risk/confidence, positional upside, evidence, and explanation keys.

## Expected points

Expected Points is a projection, not guaranteed points. `lib/fpl.ts` combines available Official FPL expectation/form/points fields, minutes readiness, fixture projection, and evidence quality. The model exposes next-event and multi-GW projections. Higher is better.

Fixture inputs include:

- next opponent and H/A;
- Official FPL FDR, where 1 is easiest and 5 hardest;
- average difficulty and per-event projection over the configured horizon.

Fixture is important but cannot rescue a player with poor appearance probability.

API-Football market odds are stored as corroborating evidence only. They are not yet added to Expected Points because doing so before calibration would double-count team strength already represented by FDR and projections.

## Forecast calibration

Before each deadline the verified dashboard stores one immutable next-Gameweek forecast in the configured KV store. After a Gameweek is marked finished, the stored forecast is compared with Official FPL's event-live total points. MAE, bias and within-two-points accuracy are measured overall and by position. Event-live/KV reads run in parallel with verified news/history/provider scans so calibration does not add a separate serial wait to the dashboard.

Calibration cannot alter recommendations from one noisy week. A position correction activates only after at least three measured Gameweeks and 60 matched player results. The observed actual/predicted ratio is shrunk toward 1.0 and hard-clamped to 0.88–1.12 before it scales current Expected Points and projection horizons. Missing KV configuration or live results leaves the base model unchanged.

When a correction is active, player/draft/captain/transfer/detail views expose its before/after Expected Points, before/after all-player xP rank, position multiplier, measured sample and Gameweek count. A uniform position multiplier cannot change rank within that same position; therefore the UI deliberately labels this as all-player xP rank, not draft-gate or position rank. When exact squared errors exist, the UI also exposes an estimated 95% multiplier range; this is model-error uncertainty, not a guarantee about an individual player's score. Transfer suggestions separately report how much of their modeled gain came from calibration. No badge means no correction was applied; it must not be interpreted as a perfect or fully calibrated prediction. Collecting positions explicitly show progress toward the 3-Gameweek/60-sample gate.

The live guard has four states: `collecting`, `uncertain`, `ready`, and `paused`. A correction is applied only in `ready`: the sample gate must pass and the estimated multiplier range must exclude 1.0. Every saved calibrated forecast also stores its uncalibrated baseline. New multipliers are always learned from that baseline, never from previously corrected output, preventing a calibration feedback loop. After at least 20 deployed comparisons, calibration is automatically paused when its observed MAE is more than 2% plus 0.02 points worse than the baseline MAE. Paused/uncertain positions revert to multiplier 1.0.

## Starter and risk gates

`lib/starter.ts` estimates starter confidence, predicted minutes, appearance probability, and starter label. `isReliableStarter` is the strict XI gate. Risk is never zero merely because evidence is missing.

Starting XI expectations:

- active/available status;
- no confirmed high-severity warning;
- current role not backup;
- sufficient starter confidence, predicted minutes, appearance probability, and evidence quality.

Current-season competitive lineups may strongly update minutes confidence. Club-friendly starts/minutes are tracked separately over a bounded 45-day window and provide a smaller pre-season update; they are never averaged into or treated as equivalent to competitive starts.

For the bounded shortlist, Official FPL `element-summary` supplies the latest five match records. Start rate, average minutes, 60+ minute rate and minutes trend are blended into starter confidence and predicted minutes with sample-size weights (five matches stronger than two). A good recent Official FPL sample becomes the primary role signal; overlapping API-Football competitive evidence is reduced to corroboration weight to prevent double-counting. Empty pre-season history does not create a synthetic role update.

External lineup evidence affects the model only after the identity gate passes: current team, normalized full/display name, stable API player ID, and a clear score margin over same-team alternatives. Ambiguous matches are counted in coverage diagnostics but rejected from player projections.

Recent structured international minutes use the same verified provider ID. The model scans a bounded 21-day/latest-60-fixture window in API-safe batches and applies only a small fatigue adjustment that decays with recovery time. International starts/minutes never update Premier League starter confidence because national-team role and club role are different signals.

Official-club news is queried once per current club represented in the verified shortlist. A club-domain injury/absence/transfer warning is confirmed evidence; reliable media becomes corroborated only when publisher-domain metadata shows at least two independent sources. Confirmed/corroborated high warnings reduce availability, minutes, projection and draft eligibility consistently. Missing news is unknown, not a clean bill of health.

## Position model

`lib/position-model.ts` evaluates different return routes:

- GKP: clean-sheet/save/bonus and penalty-save evidence when available;
- DEF: clean sheet, defensive contributions, xG/xA, goals/assists, set pieces;
- MID: xGI, goals/assists, clean-sheet point, set pieces/penalties, minutes;
- FWD: xG/xA, goals, penalties, minutes and bonus potential.

Position signals inform projection and selection explanations. Do not multiply the same fixture/xG/minutes signal again in every ranking layer.

## Draft construction

FPL hard rules:

- 15 players: 2 GKP, 5 DEF, 5 MID, 3 FWD;
- total cost at or below £100.0m;
- maximum three players per club;
- legal Starting XI formation: one GKP, 3–5 DEF, 2–5 MID, 1–3 FWD;
- exactly 11 starters and four substitutes.

`lib/squad-optimizer.ts` performs a bounded beam search over eligible candidates, preserves score and budget-efficient paths, and re-ranks completed squads by their strongest legal XI rather than treating all 15 players equally. It is an approximation, not a mathematical proof of the global optimum.

## Lean bench policy

The bench is emergency cover, not four extra premium starters.

- The XI uses the strict reliable-starter gate.
- Reserve candidates must be active, non-backup, non-unknown, free of confirmed high warnings, and pass the lower emergency minutes/appearance/risk thresholds in code.
- Bench target is derived from the cheapest actually constructible usable reserve combination for the chosen formation.
- A reliable starting goalkeeper should not create a premium backup-GK budget unless evidence justifies it.
- One difficult future fixture never adds permanent bench premium. Planned changes belong to free-transfer/roadmap logic.
- `lib/rules.ts` rebuilds a lean bench after the XI is selected, then reinvests released budget into the XI.
- Reinvestment tests direct same-position upgrades and paired cross-position reallocations, such as downgrading an overpriced MID to improve a DEF, while preserving formation, total budget, unique players, and club limits.
- An expensive defender/goalkeeper is selected only when its marginal projected gain beats alternative uses of the money. Price/reputation alone is not a selection reason.

## Draft modes

- Best: highest overall projected XI outcome with normal risk controls.
- Safe: minutes/availability/evidence weighted more strongly.
- Alternative: value and a different price structure receive more weight.
- Differential: ownership receives a negative weight but does not bypass starter/evidence rules.

Modes may share players when the evidence strongly favors them. They must not be made artificially different solely for UI variety.

## Validation versus trust

- `validateSquad`: legal FPL construction and optimizer safety checks.
- `buildDraftTrust`: whether evidence is sufficient for a final recommendation.
- A legal but insufficient-evidence squad is provisional, not final-ready.
- Selection audit ranks are honest about the active gate: a player not present in the eligible pool has no final-gate rank (`—`) and must never be presented as `#1` by a missing-index fallback.
- Each selected player is also compared with the strongest omitted same-position candidate using the same mode score. The audit reports projection, next-five, score, price, budget and club-limit deltas; it never relies on a player-name exception.
- A legal direct alternative can still lose because the complete squad/formation has a better total outcome. This is labelled as a global squad-balance decision, not proof that the selected player is individually superior on every metric.

## Captain and vice

Captain ranking uses expected points, multi-GW/fixture context, minutes/appearance, risk, and position upside. Captain must come from the proposed XI. Vice provides appearance fallback and should not share the same avoidable availability risk.

## Transfers

Transfers are same-position, budget-safe, max-three-per-club safe, and reject high-risk incoming players. Default behavior avoids hits. Expected gain is evaluated after hit cost and should be durable beyond one isolated fixture.

## Roadmap and chips

Roadmap summarizes 3–8 Gameweeks; it is not a promise that transfers will occur. Chips use fixture density, squad condition, captain opportunity, and league context. A Double Gameweek alone is never sufficient justification.

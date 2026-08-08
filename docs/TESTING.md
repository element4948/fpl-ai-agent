# Testing contract

There is currently no automated test suite or CI. Until one is added, every model change requires the following manual checks. Adding Vitest/unit fixtures and a GitHub Actions build is a priority.

## Required build

```bash
npm run build
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

## Transfer checks

- same-position replacement;
- within bank/selling-price budget approximation;
- club limit respected;
- free-transfer count clamped to 0–5;
- incoming player passes starter/risk/news gates;
- hit suggestions show net gain after cost and are not the default.

## Documentation checks

When behavior changes, update `docs/MODEL_AND_OPTIMIZER.md`, the user-facing `/docs` page where relevant, cache keys, and `CHANGELOG.md`.

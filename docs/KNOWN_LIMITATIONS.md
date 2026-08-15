# Known limitations

## Model and evidence

- Pre-season starter confidence is inherently uncertain; previous-season minutes are a prior, not proof of the new manager's XI.
- Free public sources do not provide complete standardized friendly, national-team, press-conference, depth-chart, or dressing-room data.
- API-Football availability depends on the key's plan and current-season coverage.
- Structured international minutes cover only competitions and fixtures returned by the configured API-Football plan within the bounded recent window; missing coverage remains unknown rather than zero fatigue.
- News matching/classification can miss aliases or ambiguous names. API-Football identity matching now rejects ambiguity, but transliteration/name changes can therefore leave valid evidence unmatched until an alias is added.
- Official-club news uses bounded Google News RSS site queries rather than scraping club websites; indexing delays and clubs whose headlines omit the player's name can leave coverage incomplete.
- FDR is a team-level difficulty signal and does not predict player minutes.
- Expected Points is not calibrated against a multi-season automated backtest in this repository.
- Beam search is bounded and can miss the mathematical global optimum.
- FPL selling price can differ from current purchase price; transfer modeling is an approximation unless the exact entry selling price is available.

## Product

- Single owner only; no multi-user accounts or authorization model.
- Mini-league analysis currently uses the returned standings page and does not fetch every rival squad/history.
- The system cannot read private pre-deadline picks from Official FPL.
- It does not execute FPL actions.
- Chip logic is advisory and not a full-season stochastic optimizer.
- Cloud profile stores settings, not a complete historical database of every weekly squad/decision.

## Engineering

- Vitest unit tests and a GitHub Actions CI workflow exist, but live-provider end-to-end coverage remains limited by API availability, quotas, and secrets.
- The current local workspace may require `npm install` before Vitest/build can run because its `node_modules` is incomplete.
- Much of the dashboard is concentrated in `app/page.tsx`; component extraction would improve maintainability.
- Some response shapes use `any` in UI/API glue.
- Historical update markdown files remain for provenance and must not be used as current instructions.

## Required wording

Do not describe a provisional draft as guaranteed, final, or error-free. Clearly distinguish:

- legal squad;
- model recommendation;
- evidence-verified recommendation;
- data unavailable/unknown.

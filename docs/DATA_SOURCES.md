# Data sources and evidence policy

## Source matrix

| Source | Used for | Authority | Failure behavior |
|---|---|---|---|
| Official FPL `bootstrap-static` | players, teams, positions, prices, status/news, ownership, season totals, xG/xA fields | Primary | Dashboard reports FPL unavailable. |
| Official FPL `fixtures` | opponents, home/away, FDR, next 3/5/8 schedule | Primary | Fixture fields become limited; do not invent fixtures. |
| Official FPL `element-summary/:id` | recent history and upcoming player fixtures | Primary | Player detail returns unavailable. |
| Official FPL entry/picks | public squad, bank, value, rank | Primary but deadline-limited | Before picks are public, use saved planned draft and explain limitation. |
| Official FPL league standings | rank/gap | Primary | Return a clear ID/not-found error. |
| API-Football | current-team lineup/minutes/stat corroboration, bounded PL club-friendly lineups, normalized upcoming match-winner odds | Optional secondary | Continue with Official FPL and mark each enrichment unavailable. |
| Recent news scan | injury, role, transfer, suspension and published press-conference context | Supporting evidence | Missing news never equals confirmation or zero risk. |

## Freshness

- Official FPL fetches are cached to protect latency and rate limits.
- Fast dashboard intentionally uses only Official FPL data.
- Verified dashboard checks external evidence for a bounded shortlist, not every player in the database.
- News categories have age limits in `lib/external-news.ts`; old headlines must not remain active indefinitely.

## Evidence rules

- Official club/FPL information outranks media reports.
- A high-severity external warning blocks a pick only when confirmed or corroborated according to source verification logic.
- Source count is displayed as coverage, not added repeatedly to the player score.
- API-Football previous-season statistics may provide a prior but cannot alone prove a current starting role.
- Current-team mismatch, transfer uncertainty, or season-plan failure must remain visible in evidence/trust output.
- Model Readiness reports each configured source as available, partial, or missing and exposes critical gaps. A configured adapter is not counted as successful unless the current response contains usable evidence.

## API-Football season selection

`lib/api-football.ts` derives the football season from the current date and uses Premier League league ID 39. Free/limited plans may not expose the requested season or endpoints. In that case the scan returns an explicit error and zero matched evidence; it must not silently reuse unrelated seasons as current proof.

## Sources not currently integrated

- Paid Opta event feed.
- Complete FBref/Understat ingestion.
- Dedicated multi-bookmaker/player-prop odds beyond the bounded API-Football match-winner check.
- SofaScore/OneFootball private/unofficial scraping.
- Full press-conference transcripts when no official/reliable public report is published.
- Structured national-team minutes and complete friendly coverage outside API-Football's plan/competition coverage.
- Reddit/X consensus.

Do not write documentation or UI suggesting these sources are active until code, licensing, freshness checks, and failure handling exist.

The product cannot honestly promise “all football data”. Paid/private feeds, unavailable plan endpoints, and sources that prohibit scraping remain missing. The dashboard and Telegram digest must report those gaps instead of converting missing evidence into zero risk or full confidence.

## Adding a source

1. Confirm terms/licensing and whether server-side caching is allowed.
2. Add a server-only adapter returning typed evidence.
3. Include source name, observed time, data season, verification tier, and failure state.
4. Match players conservatively; do not rely on surname only where collisions exist.
5. Apply evidence once in the projection/risk pipeline; avoid double-counting it in draft score.
6. Add manual fixtures/tests and update this document.

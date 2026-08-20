# Data sources and evidence policy

## Source matrix

| Source | Used for | Authority | Failure behavior |
|---|---|---|---|
| Official FPL `bootstrap-static` | players, teams, positions, prices, status/news, ownership, season totals, xG/xA fields | Primary | Dashboard reports FPL unavailable. |
| Official FPL `fixtures` | opponents, home/away, FDR, next 3/5/8 schedule | Primary | Fixture fields become limited; do not invent fixtures. |
| Official FPL `element-summary/:id` | recent five-match starts/minutes/60+ rate/trend for a bounded shortlist, plus player detail history and upcoming fixtures | Primary | Continue with cumulative Official FPL fields and report zero recent-history coverage. |
| Official FPL entry/picks | public squad, bank, value, rank | Primary but deadline-limited | Before picks are public, use saved planned draft and explain limitation. |
| Official FPL league standings | rank/gap | Primary | Return a clear ID/not-found error. |
| API-Football | current-team lineup/minutes/stat corroboration, bounded PL club-friendly lineups, recent structured international minutes, normalized upcoming match-winner odds | Optional secondary | Continue with Official FPL and mark each enrichment unavailable. |
| Official club news search | one bounded Google News RSS site-query per shortlisted player's current club; injury, availability, transfer and press-conference headlines from the club domain | Official supporting evidence | Per-club feed success is reported; missing results never equal confirmation or zero risk. |
| Recent news scan | player-specific injury, role, transfer, suspension and published press-conference context | Supporting evidence | Missing news never equals confirmation or zero risk. |

## Freshness

- Official FPL fetches are cached to protect latency and rate limits.
- Fast dashboard intentionally uses only Official FPL data.
- Verified dashboard checks external evidence for a bounded shortlist, not every player in the database.
- News categories have age limits in `lib/external-news.ts`; old headlines must not remain active indefinitely.
- `lib/data-freshness.ts` labels every applicable player source as `fresh`, `aging`, `stale`, or `missing` with source-specific time windows. A successful scan with no player evidence is not presented as proof of a clean role/risk state.
- An expired first-choice role assessment cannot raise starter confidence, predicted minutes, appearance probability, Expected Points, or projection horizons. It must be corroborated by fresh/aging current-season competitive evidence or a sufficiently strong recent Official FPL history sample.
- Previous-season API-Football evidence is always context (`aging`) rather than current-role proof, even when it was fetched recently.

## Evidence rules

- Official club/FPL information outranks media reports.
- Official club searches are constrained to the configured current-club domain, then matched to the player with display/full-name aliases. Surname-only matching is allowed only when it is unique inside that club.
- Google News redirect URLs are not treated as independent publishers; corroboration counts the article publisher domain from the RSS source metadata.
- Official publishers require an exact configured hostname or subdomain boundary; lookalike domains containing an official club domain as a substring remain secondary.
- Multi-source corroboration requires the same semantic claim (for example ruled out versus merely doubtful), not only the same broad news category. Unclassified headlines remain `other` context and never masquerade as availability evidence.
- When trusted availability/transfer claims conflict, the highest-authority and then newest published claim remains active; the superseded claim stays visible in the conflict summary but no longer applies a projection penalty. Unverified secondary claims never erase trusted warnings.
- A high-severity external warning blocks a pick only when confirmed or corroborated according to source verification logic.
- Source count is displayed as coverage, not added repeatedly to the player score.
- API-Football previous-season statistics may provide a prior but cannot alone prove a current starting role.
- API-Football player evidence must pass current-team matching plus full/display-name scoring and API player-ID consistency. Ambiguous identities are rejected and never change minutes, starter confidence, or Expected Points.
- Recent international minutes are joined only through an API player ID already verified by that identity gate. They can add a small, recovery-time-based fatigue penalty, but they never prove or disprove the player's Premier League starting role.
- Current-team mismatch, transfer uncertainty, or season-plan failure must remain visible in evidence/trust output.
- Model Readiness reports each configured source as available, partial, or missing and exposes critical gaps. A configured adapter is not counted as successful unless the current response contains usable evidence.
- The dashboard critical-news brief prioritizes Best-squad players, medium/high severity, official confirmation and corroboration. The browser compares it with the last verified cache and marks newly observed items.
- Once a live or planned squad is available, the private decision response replaces Best-draft priority with My Team first, then monitored transfer targets. Equivalent headlines sharing one semantic claim are clustered under the strongest source with a visible source count.

## API-Football season selection

`lib/api-football.ts` derives the football season from the current date and uses Premier League league ID 39. Free/limited plans may not expose the requested season or endpoints. In that case the scan returns an explicit error and zero matched evidence; it must not silently reuse unrelated seasons as current proof.

## Sources not currently integrated

- Paid Opta event feed.
- Complete FBref/Understat ingestion.
- Dedicated multi-bookmaker/player-prop odds beyond the bounded API-Football match-winner check.
- SofaScore/OneFootball private/unofficial scraping.
- Full press-conference transcripts when no official/reliable public report is published.
- Complete national-team/friendly coverage outside API-Football's plan and the bounded 21-day/latest-60-fixture competition scan.
- Reddit/X consensus.

Do not write documentation or UI suggesting these sources are active until code, licensing, freshness checks, and failure handling exist.

The product cannot honestly promise “all football data”. Paid/private feeds, unavailable plan endpoints, and sources that prohibit scraping remain missing. The dashboard and Telegram digest must report those gaps instead of converting missing evidence into zero risk or full confidence.

## Adding a source

1. Confirm terms/licensing and whether server-side caching is allowed.
2. Add a server-only adapter returning typed evidence.
3. Include source name, observed time, data season, verification tier, and failure state.
4. Match players conservatively with provider ID, current team, full/display name and an ambiguity margin; never rely on surname alone where collisions exist.
5. Apply evidence once in the projection/risk pipeline; avoid double-counting it in draft score.
6. Add manual fixtures/tests and update this document.

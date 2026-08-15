import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getBootstrap, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDraft } from '@/lib/rules';
import { rankCaptainCandidates, topTargetsByPosition } from '@/lib/scoring';
import { chipPlanner } from '@/lib/chips';
import { buildRiskMonitor } from '@/lib/risk-monitor';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildModelReadiness } from '@/lib/readiness';
import { buildSeasonRoadmap } from '@/lib/season-roadmap';
import { applyApiFootballEvidence, getApiFootballEvidence } from '@/lib/api-football';

export const revalidate = 900;
// The verified dashboard fans out to API-Football + news feeds; the default
// serverless timeout (10s) can cut a cold request off. Allow up to 60s.
export const maxDuration = 60;

export async function GET(request: Request) {
  const fast = new URL(request.url).searchParams.get('fast') === '1';
  try {
    const payload = fast ? await getFastDashboard() : await getVerifiedDashboard();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': fast
          ? 'public, s-maxage=300, stale-while-revalidate=1800'
          : 'public, s-maxage=900, stale-while-revalidate=3600',
      },
    });
  } catch {
    // Never cache an FPL outage. Returning the error object *inside* the cached
    // function froze a blank dashboard for the full TTL; throw there and return
    // an explicit, uncached error here so it recovers as soon as FPL is healthy.
    return NextResponse.json(
      { error: 'FPL API unavailable', isPreSeason: true, degraded: true, drafts: [], topPlayers: [] },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

const getFastDashboard = unstable_cache(
  () => buildDashboardPayload(true),
  ['fpl-dashboard-fast-v20-official-club-news'],
  { revalidate: 300 },
);

const getVerifiedDashboard = unstable_cache(
  () => buildDashboardPayload(false),
  ['fpl-dashboard-verified-v20-official-club-news'],
  { revalidate: 900 },
);

async function buildDashboardPayload(fast: boolean) {
  const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
  // Throw (do not return) so unstable_cache never stores an outage response.
  if (!boot) throw new Error('FPL_API_UNAVAILABLE');
  const next = nextEvent(boot.events);
  const completedGameweeks = boot.events.filter((event) => event.finished).length;
  const basePlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completedGameweeks);
  // The fast response makes the page usable immediately. The client then asks
  // for the fully verified version in the background.
  const [apiFootballScan, newsScan] = fast
    ? [
        {
          enabled: false, matchedPlayers: 0, fixturesChecked: 0,
          friendlyFixturesChecked: 0, oddsFixturesChecked: 0, oddsTeamsMatched: 0,
          identityMatched: 0, identityAmbiguous: 0, identityUnmatched: 0,
          internationalFixturesChecked: 0, internationalPlayersMatched: 0,
          evidence: new Map<number, never>(),
        },
        null,
      ] as const
    : await Promise.all([
        getApiFootballEvidence(basePlayers),
        getExternalNewsSignals(basePlayers, finalCandidateIdsFor(basePlayers)),
      ]);
  const statsPlayers = applyApiFootballEvidence(basePlayers, apiFootballScan);
  const modes = fast
    ? (['Best'] as const)
    : (['Best','Alternative','Differential','Safe'] as const);
  const players = newsScan ? applyExternalNewsSignals(statsPlayers, newsScan) : statsPlayers;
  const isOldGw38 = next?.name?.includes('38') && next?.deadline_time && new Date(next.deadline_time).getTime() < Date.now();
  const isPreSeason = completedGameweeks === 0 || !next || !next.deadline_time || !!isOldGw38;
  const lastFinishedEvent = [...boot.events]
    .filter((event) => event.finished)
    .sort((a, b) => b.id - a.id)[0];
  const liveUnfinishedEvent = boot.events.find(
    (event) => event.is_current && !event.finished,
  );
  const calibrationEvent = liveUnfinishedEvent ? null : lastFinishedEvent;
  const topPlayers = [...players].sort((a,b) => (b.expectedPoints + b.valueScore - b.risk * 0.03) - (a.expectedPoints + a.valueScore - a.risk * 0.03)).slice(0, 40);
  // Always return usable Official-FPL drafts in the fast response. External
  // verification can replace them later, but a failed/slow enrichment request
  // must never leave the Draft Teams section empty.
  const drafts = modes.map((mode) => buildDraft(players, mode, fast ? 'fast' : 'full'));
  const roadmap = fast ? null : buildSeasonRoadmap(drafts[0]?.players || [], players);
  return {
    nextEvent: isPreSeason ? null : next,
    isPreSeason,
    playerCount: players.length,
    teamCount: boot.teams.length,
    fixtureCount: fixtures?.length || 0,
    fixtureReady: !!fixtures?.length,
    fixtureSource: 'Official FPL fixtures API',
    fixtureUpdatedAt: new Date().toISOString(),
    apiFootball: {
      enabled: apiFootballScan.enabled,
      matchedPlayers: apiFootballScan.matchedPlayers,
      fixturesChecked: apiFootballScan.fixturesChecked,
      friendlyFixturesChecked: apiFootballScan.friendlyFixturesChecked,
      oddsFixturesChecked: apiFootballScan.oddsFixturesChecked,
      oddsTeamsMatched: apiFootballScan.oddsTeamsMatched,
      identityMatched: apiFootballScan.identityMatched,
      identityAmbiguous: apiFootballScan.identityAmbiguous,
      identityUnmatched: apiFootballScan.identityUnmatched,
      internationalFixturesChecked: apiFootballScan.internationalFixturesChecked,
      internationalPlayersMatched: apiFootballScan.internationalPlayersMatched,
      error: apiFootballScan.error,
    },
    newsVerification: newsScan ? {
      ok: newsScan.ok,
      checkedPlayers: newsScan.checkedIds.size,
      officialClubCheckedPlayers: newsScan.officialClubCheckedIds.size,
      officialClubFeedsChecked: newsScan.officialClubFeedsChecked,
      officialClubFeedsAttempted: newsScan.officialClubFeedsAttempted,
      officialClubSignals: newsScan.officialClubSignals,
      checkedAt: newsScan.checkedAt,
    } : null,
    verificationPending: fast,
    dataStatus: {
      fixtures: !!fixtures?.length,
      news: fast ? 'skipped' : newsScan?.ok ? 'ok' : 'unavailable',
      apiFootball: apiFootballScan.error ? 'unavailable' : apiFootballScan.enabled ? 'ok' : 'skipped',
      // Degraded = fixtures missing, or the verified news scan failed. The UI
      // should warn and avoid presenting these recommendations as verified.
      degraded: !fixtures?.length || (!fast && !newsScan?.ok),
    },
    topPlayers,
    topTargets: topTargetsByPosition(players),
    captainShortlist: rankCaptainCandidates(players, 10),
    riskMonitor: buildRiskMonitor(players).slice(0, 30),
    readiness: buildModelReadiness(players),
    roadmap,
    calibration: calibrationEvent
      ? {
          eventId: calibrationEvent.id,
          actuals: boot.elements.map((player) => ({
            id: player.id,
            name: player.web_name,
            points: Number(player.event_points || 0),
          })),
        }
      : null,
    drafts,
    chips: chipPlanner({
      hasEntry: false,
      isPreSeason,
      ...(roadmap ? { roadmap } : {}),
    }),
  };
}

function finalCandidateIdsFor(players: ReturnType<typeof toModelPlayers>) {
  return ['GKP', 'DEF', 'MID', 'FWD'].flatMap((position) =>
    players
      .filter((player) => player.position === position)
      .sort((a, b) =>
        (b.expectedPoints + b.projection.next5 / Math.max(1, b.projection.gameweeks) + b.valueScore * 0.4) -
        (a.expectedPoints + a.projection.next5 / Math.max(1, a.projection.gameweeks) + a.valueScore * 0.4),
      )
      .slice(0, 12)
      .map((player) => player.id),
  );
}

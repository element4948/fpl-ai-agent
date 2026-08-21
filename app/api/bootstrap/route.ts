import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getBootstrap, getEventLive, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDraft } from '@/lib/rules';
import { rankCaptainCandidates, topTargetsByPosition } from '@/lib/scoring';
import { chipPlanner } from '@/lib/chips';
import { buildRiskMonitor } from '@/lib/risk-monitor';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildModelReadiness } from '@/lib/readiness';
import { buildSeasonRoadmap } from '@/lib/season-roadmap';
import { applyApiFootballEvidence, getApiFootballEvidence } from '@/lib/api-football';
import { applyRecentHistoryEvidence, getRecentHistoryEvidence } from '@/lib/history-enrichment';
import { applyCalibrationProfile, refreshServerCalibration, saveServerForecast } from '@/lib/server-calibration';
import { applyDataFreshnessGuard } from '@/lib/data-freshness';
import { buildCriticalNewsBrief } from '@/lib/news-brief';
import { withTimeBudget } from '@/lib/provider-budget';

export const revalidate = 900;
// The verified dashboard fans out to API-Football + news feeds; the default
// serverless timeout (10s) can cut a cold request off. Allow up to 60s.
export const maxDuration = 60;

export async function GET(request: Request) {
  const fast = new URL(request.url).searchParams.get('fast') === '1';
  try {
    const payload = fast ? await getFastDashboard() : await getVerifiedDashboard();
    const payloadAgeMs = Math.max(0, Date.now() - Date.parse(payload.generatedAt));
    return NextResponse.json({
      ...payload,
      delivery: {
        mode: fast ? 'fast' : 'verified',
        payloadAgeMs,
        cacheHitLikely: payloadAgeMs >= 1_000,
      },
    }, {
      headers: {
        'X-FPL-Payload-Age-Ms': String(payloadAgeMs),
        'X-FPL-Cache-Hit-Likely': String(payloadAgeMs >= 1_000),
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
  ['fpl-dashboard-fast-v30-role-transition'],
  { revalidate: 300 },
);

const getVerifiedDashboard = unstable_cache(
  () => buildDashboardPayload(false),
  ['fpl-dashboard-verified-v30-role-transition'],
  { revalidate: 900 },
);

async function buildDashboardPayload(fast: boolean) {
  const generatedAt = new Date().toISOString();
  const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
  // Throw (do not return) so unstable_cache never stores an outage response.
  if (!boot) throw new Error('FPL_API_UNAVAILABLE');
  const next = nextEvent(boot.events);
  const completedGameweeks = boot.events.filter((event) => event.finished).length;
  const lastFinishedEvent = [...boot.events]
    .filter((event) => event.finished)
    .sort((a, b) => b.id - a.id)[0];
  const liveUnfinishedEvent = boot.events.find(
    (event) => event.is_current && !event.finished,
  );
  const calibrationEvent = liveUnfinishedEvent ? null : lastFinishedEvent;
  const playerNames = new Map(boot.elements.map((player) => [player.id, player.web_name]));
  // Start calibration I/O before the slower provider scans. It is independent
  // from news/history enrichment and should not extend the verified critical path.
  const calibrationPromise = fast
    ? Promise.resolve({
        configured: false,
        results: [],
        profile: { active: false, events: 0, updatedAt: new Date().toISOString(), positions: {} },
        actuals: [] as Array<{ id: number; name: string; points: number }>,
      })
    : (calibrationEvent ? getEventLive(calibrationEvent.id) : Promise.resolve(null))
        .then((eventLive) => {
          const actuals = eventLive?.elements.map((player) => ({
            id: player.id,
            name: playerNames.get(player.id) || String(player.id),
            points: Number(player.stats.total_points || 0),
          })) || [];
          return refreshServerCalibration(calibrationEvent?.id, actuals)
            .then((state) => ({ ...state, actuals }));
        });
  const basePlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completedGameweeks);
  // The fast response makes the page usable immediately. The client then asks
  // for the fully verified version in the background.
  const candidateIds = finalCandidateIdsFor(basePlayers);
  const providerStartedAt = Date.now();
  const providerTimings: Record<string, { durationMs: number; timedOut: boolean }> = {};
  const timed = async <T>(name: string, promise: Promise<T>, fallback: T, timeoutMs: number) => {
    const result = await withTimeBudget(promise, fallback, timeoutMs);
    providerTimings[name] = result.timing;
    return result.value;
  };
  const apiFootballFallback = {
    enabled: true, matchedPlayers: 0, fixturesChecked: 0,
    friendlyFixturesChecked: 0, oddsFixturesChecked: 0, oddsTeamsMatched: 0,
    identityMatched: 0, identityAmbiguous: 0, identityUnmatched: 0,
    internationalFixturesChecked: 0, internationalPlayersMatched: 0,
    evidence: new Map<number, never>(), error: 'API-Football verification exceeded the 12-second dashboard budget.',
  };
  const newsFallback = {
    signals: new Map(), checkedIds: new Set<number>(), checkedAt: new Date().toISOString(),
    officialClubCheckedIds: new Set<number>(), officialClubFeedsChecked: 0,
    officialClubFeedsAttempted: 0, officialClubSignals: 0, conflicts: [], ok: false,
  };
  const historyFallback = {
    analyses: new Map(), checkedIds: new Set<number>(), checkedAt: new Date().toISOString(),
    requestedPlayers: 0, successfulPlayers: 0, ok: false,
  };
  const [apiFootballScan, newsScan, historyScan] = fast
    ? [
        {
          enabled: false, matchedPlayers: 0, fixturesChecked: 0,
          friendlyFixturesChecked: 0, oddsFixturesChecked: 0, oddsTeamsMatched: 0,
          identityMatched: 0, identityAmbiguous: 0, identityUnmatched: 0,
          internationalFixturesChecked: 0, internationalPlayersMatched: 0,
          evidence: new Map<number, never>(),
        },
        null,
        {
          analyses: new Map(), checkedIds: new Set<number>(), checkedAt: new Date().toISOString(),
          requestedPlayers: 0, successfulPlayers: 0, ok: true,
        },
      ] as const
    : await Promise.all([
        timed('apiFootball', getApiFootballEvidence(basePlayers), apiFootballFallback, 12_000),
        timed('news', getExternalNewsSignals(basePlayers, candidateIds), newsFallback, 8_000),
        timed('history', getRecentHistoryEvidence(basePlayers, candidateIds), historyFallback, 10_000),
      ]);
  const historyPlayers = applyRecentHistoryEvidence(basePlayers, historyScan);
  const statsPlayers = applyApiFootballEvidence(historyPlayers, apiFootballScan);
  const modes = fast
    ? (['Best'] as const)
    : (['Best','Alternative','Differential','Safe'] as const);
  const evidencePlayers = newsScan ? applyExternalNewsSignals(statsPlayers, newsScan) : statsPlayers;
  const freshnessPlayers = applyDataFreshnessGuard(evidencePlayers, {
    officialCheckedAt: generatedAt,
    fixturesAvailable: Boolean(fixtures?.length),
    verified: !fast,
  });
  const isOldGw38 = next?.name?.includes('38') && next?.deadline_time && new Date(next.deadline_time).getTime() < Date.now();
  const isPreSeason = completedGameweeks === 0 || !next || !next.deadline_time || !!isOldGw38;
  const calibrationState = await calibrationPromise;
  const { actuals: calibrationActuals, ...serverCalibration } = calibrationState;
  const players = applyCalibrationProfile(freshnessPlayers, serverCalibration.profile);
  const topPlayers = [...players].sort((a,b) => (b.expectedPoints + b.valueScore - b.risk * 0.03) - (a.expectedPoints + a.valueScore - a.risk * 0.03)).slice(0, 40);
  // Always return usable Official-FPL drafts in the fast response. External
  // verification can replace them later, but a failed/slow enrichment request
  // must never leave the Draft Teams section empty.
  const drafts = modes.map((mode) => buildDraft(players, mode, fast ? 'fast' : 'full'));
  const newsBrief = buildCriticalNewsBrief(players, drafts[0]?.players || [], newsScan?.conflicts || []);
  const roadmap = fast ? null : buildSeasonRoadmap(drafts[0]?.players || [], players);
  if (!fast) await timed(
    'forecastStorage',
    saveServerForecast(next?.id, next?.deadline_time, players),
    undefined,
    2_000,
  );
  return {
    nextEvent: isPreSeason ? null : next,
    isPreSeason,
    playerCount: players.length,
    teamCount: boot.teams.length,
    fixtureCount: fixtures?.length || 0,
    fixtureReady: !!fixtures?.length,
    fixtureSource: 'Official FPL fixtures API',
    fixtureUpdatedAt: new Date().toISOString(),
    generatedAt,
    providerTimings: fast ? null : {
      totalDurationMs: Date.now() - providerStartedAt,
      ...providerTimings,
    },
    freshness: {
      fresh: players.filter((player) => player.dataFreshness?.status === 'fresh').length,
      aging: players.filter((player) => player.dataFreshness?.status === 'aging').length,
      stale: players.filter((player) => player.dataFreshness?.status === 'stale').length,
      missing: players.filter((player) => player.dataFreshness?.status === 'missing').length,
    },
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
      conflictsResolved: newsScan.conflicts.length,
    } : null,
    newsBrief,
    historyVerification: {
      ok: historyScan.ok,
      requestedPlayers: historyScan.requestedPlayers,
      successfulPlayers: historyScan.successfulPlayers,
      checkedAt: historyScan.checkedAt,
    },
    verificationPending: fast,
    dataStatus: {
      fixtures: !!fixtures?.length,
      news: fast ? 'skipped' : newsScan?.ok ? 'ok' : 'unavailable',
      apiFootball: apiFootballScan.error ? 'unavailable' : apiFootballScan.enabled ? 'ok' : 'skipped',
      evidenceLimited: !fast && drafts.some((draft) => draft.trust.status !== 'verified'),
      // Optional providers may be unavailable without blanking the product,
      // but a verified response with insufficient draft evidence must remain
      // visibly degraded rather than looking final-ready.
      degraded: !fixtures?.length || (!fast && (!newsScan?.ok || drafts.some((draft) => draft.trust.status !== 'verified'))),
    },
    topPlayers,
    topTargets: topTargetsByPosition(players),
    captainShortlist: rankCaptainCandidates(players, 10),
    riskMonitor: buildRiskMonitor(players).slice(0, 30),
    readiness: buildModelReadiness(players, serverCalibration.results),
    serverCalibration,
    roadmap,
    calibration: calibrationEvent
      ? {
          eventId: calibrationEvent.id,
          actuals: calibrationActuals,
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

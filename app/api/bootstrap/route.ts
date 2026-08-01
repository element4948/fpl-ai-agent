import { NextResponse } from 'next/server';
import { getBootstrap, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDraft } from '@/lib/rules';
import { rankCaptainCandidates, topTargetsByPosition } from '@/lib/scoring';
import { chipPlanner } from '@/lib/chips';
import { buildRiskMonitor } from '@/lib/risk-monitor';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildModelReadiness } from '@/lib/readiness';
import { buildSeasonRoadmap } from '@/lib/season-roadmap';
import { applyApiFootballEvidence, getApiFootballEvidence } from '@/lib/api-football';

export async function GET() {
  const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
  if (!boot) return NextResponse.json({ error: 'FPL API unavailable', isPreSeason: true, drafts: [], topPlayers: [] }, { status: 200 });
  const next = nextEvent(boot.events);
  const completedGameweeks = boot.events.filter((event) => event.finished).length;
  const basePlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completedGameweeks);
  const apiFootballScan = await getApiFootballEvidence(basePlayers);
  const statsPlayers = applyApiFootballEvidence(basePlayers, apiFootballScan);
  const modes = ['Best','Alternative','Differential','Safe'] as const;
  const preliminaryDrafts = modes.map((mode) => buildDraft(statsPlayers, mode));
  const preliminaryIds = [...new Set(preliminaryDrafts.flatMap((draft) => draft.players.map((player) => player.id)))];
  const firstPassPlayers = applyExternalNewsSignals(
    statsPlayers,
    await getExternalNewsSignals(statsPlayers, preliminaryIds),
  );
  const firstPassDrafts = modes.map((mode) => buildDraft(firstPassPlayers, mode));
  const finalCandidateIds = [...new Set([
    ...preliminaryIds,
    ...firstPassDrafts.flatMap((draft) => draft.players.map((player) => player.id)),
  ])];
  const players = applyExternalNewsSignals(
    statsPlayers,
    await getExternalNewsSignals(statsPlayers, finalCandidateIds),
  );
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
  const drafts = modes.map((mode) => buildDraft(players, mode));
  const roadmap = buildSeasonRoadmap(drafts[0]?.players || [], players);
  return NextResponse.json({
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
      error: apiFootballScan.error,
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
    chips: chipPlanner({ hasEntry: false, isPreSeason, roadmap }),
  });
}

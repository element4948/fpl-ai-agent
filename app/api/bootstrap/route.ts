import { NextResponse } from 'next/server';
import { getBootstrap, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDraft } from '@/lib/rules';
import { rankCaptainCandidates, topTargetsByPosition } from '@/lib/scoring';
import { chipPlanner } from '@/lib/chips';
import { buildRiskMonitor } from '@/lib/risk-monitor';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildModelReadiness } from '@/lib/readiness';
import { buildSeasonRoadmap } from '@/lib/season-roadmap';

export async function GET() {
  const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
  if (!boot) return NextResponse.json({ error: 'FPL API unavailable', isPreSeason: true, drafts: [], topPlayers: [] }, { status: 200 });
  const next = nextEvent(boot.events);
  const completedGameweeks = boot.events.filter((event) => event.finished).length;
  const basePlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completedGameweeks);
  const players = applyExternalNewsSignals(
    basePlayers,
    await getExternalNewsSignals(basePlayers),
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
  const drafts = ['Best','Alternative','Differential','Safe'].map(mode => buildDraft(players, mode as any));
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

import { NextResponse } from 'next/server';
import { getBootstrap, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDraft } from '@/lib/rules';
import { rankCaptainCandidates, topTargetsByPosition } from '@/lib/scoring';
import { chipPlanner } from '@/lib/chips';

export async function GET() {
  const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
  if (!boot) return NextResponse.json({ error: 'FPL API unavailable', isPreSeason: true, drafts: [], topPlayers: [] }, { status: 200 });
  const next = nextEvent(boot.events);
  const players = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id);
  const isOldGw38 = next?.name?.includes('38') && next?.deadline_time && new Date(next.deadline_time).getTime() < Date.now();
  const isPreSeason = !next || !next.deadline_time || !!isOldGw38;
  const topPlayers = [...players].sort((a,b) => (b.expectedPoints + b.valueScore - b.risk * 0.03) - (a.expectedPoints + a.valueScore - a.risk * 0.03)).slice(0, 40);
  const drafts = ['Best','Alternative','Differential','Safe'].map(mode => buildDraft(players, mode as any));
  return NextResponse.json({
    nextEvent: isPreSeason ? null : next,
    isPreSeason,
    playerCount: players.length,
    teamCount: boot.teams.length,
    fixtureCount: fixtures?.length || 0,
    fixtureReady: !!fixtures?.length,
    topPlayers,
    topTargets: topTargetsByPosition(players),
    captainShortlist: rankCaptainCandidates(players, 10),
    drafts,
    chips: chipPlanner({ hasEntry: false, isPreSeason }),
  });
}

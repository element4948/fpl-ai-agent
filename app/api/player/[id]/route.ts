import { NextResponse } from 'next/server';

import { getBootstrap, getFixtures, getPlayerSummary, nextEvent, toModelPlayers } from '@/lib/fpl';
import { analyzePlayerHistory } from '@/lib/player-history';
import { applyApiFootballEvidence, getApiFootballEvidence } from '@/lib/api-football';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const playerId = Number(id);

  if (!Number.isInteger(playerId) || playerId <= 0) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }

  const [boot, fixtures, summary] = await Promise.all([
    getBootstrap(),
    getFixtures(),
    getPlayerSummary(playerId),
  ]);

  if (!boot || !summary) {
    return NextResponse.json(
      { error: 'Player data unavailable' },
      { status: 404 },
    );
  }

  const basePlayer = toModelPlayers(
    boot.elements.filter((item) => item.id === playerId),
    boot.teams,
    boot.element_types,
    fixtures || [],
    nextEvent(boot.events)?.id,
    boot.events.filter((event) => event.finished).length,
  )[0];

  if (!basePlayer) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const apiFootballScan = await getApiFootballEvidence([basePlayer]);
  const statsPlayer = applyApiFootballEvidence([basePlayer], apiFootballScan)[0];
  const player = applyExternalNewsSignals(
    [statsPlayer],
    await getExternalNewsSignals([statsPlayer], [statsPlayer.id]),
  )[0];

  return NextResponse.json({
    player,
    recent: analyzePlayerHistory(summary.history, 5),
    history: summary.history.slice(-10),
    upcomingFixtures: summary.fixtures.slice(0, 5),
    updatedAt: new Date().toISOString(),
    source: apiFootballScan.identityMatched
      ? 'Official FPL API + API-Football + verified news scan'
      : 'Official FPL API + verified news scan',
    apiFootball: {
      enabled: apiFootballScan.enabled,
      matchedPlayers: apiFootballScan.matchedPlayers,
      fixturesChecked: apiFootballScan.fixturesChecked,
      identityMatched: apiFootballScan.identityMatched,
      identityAmbiguous: apiFootballScan.identityAmbiguous,
      identityUnmatched: apiFootballScan.identityUnmatched,
      internationalFixturesChecked: apiFootballScan.internationalFixturesChecked,
      internationalPlayersMatched: apiFootballScan.internationalPlayersMatched,
      error: apiFootballScan.error,
    },
  });
}

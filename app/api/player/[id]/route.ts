import { NextResponse } from 'next/server';

import { getBootstrap, getFixtures, getPlayerSummary, nextEvent, toModelPlayers } from '@/lib/fpl';
import { analyzePlayerHistory } from '@/lib/player-history';

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

  const player = toModelPlayers(
    boot.elements.filter((item) => item.id === playerId),
    boot.teams,
    boot.element_types,
    fixtures || [],
    nextEvent(boot.events)?.id,
    boot.events.filter((event) => event.finished).length,
  )[0];

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  return NextResponse.json({
    player,
    recent: analyzePlayerHistory(summary.history, 5),
    history: summary.history.slice(-10),
    upcomingFixtures: summary.fixtures.slice(0, 5),
    updatedAt: new Date().toISOString(),
    source: 'Official FPL API',
  });
}

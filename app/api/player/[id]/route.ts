import { NextResponse } from 'next/server';

import { getBootstrap, getFixtures, getPlayerSummary, nextEvent, toModelPlayers } from '@/lib/fpl';
import { analyzePlayerHistory } from '@/lib/player-history';
import { applyApiFootballEvidence, getApiFootballEvidence } from '@/lib/api-football';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { applyRecentHistoryEvidence } from '@/lib/history-enrichment';
import { applyCalibrationProfile, refreshServerCalibration } from '@/lib/server-calibration';

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

  const calibrationPromise = refreshServerCalibration(undefined, []);

  const recent = analyzePlayerHistory(summary.history, 5);
  const historyPlayer = applyRecentHistoryEvidence([basePlayer], {
    analyses: new Map([[basePlayer.id, recent]]),
    checkedIds: new Set([basePlayer.id]),
    checkedAt: new Date().toISOString(),
    requestedPlayers: 1,
    successfulPlayers: 1,
    ok: true,
  })[0];
  const apiFootballScan = await getApiFootballEvidence([historyPlayer]);
  const statsPlayer = applyApiFootballEvidence([historyPlayer], apiFootballScan)[0];
  const evidencePlayer = applyExternalNewsSignals(
    [statsPlayer],
    await getExternalNewsSignals([statsPlayer], [statsPlayer.id]),
  )[0];
  const calibration = await calibrationPromise;
  const player = applyCalibrationProfile([evidencePlayer], calibration.profile)[0];

  return NextResponse.json({
    player,
    recent,
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
    calibration: {
      configured: calibration.configured,
      unavailable: 'unavailable' in calibration ? calibration.unavailable : false,
      events: calibration.profile.events,
    },
  });
}

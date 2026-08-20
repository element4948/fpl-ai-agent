import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntry, getEntryPicks, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDecision } from '@/lib/decision';
import type { Goal, ModelPlayer, RiskProfile } from '@/types/fpl';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { applyApiFootballEvidence, getApiFootballEvidence } from '@/lib/api-football';
import { applyRecentHistoryEvidence, getRecentHistoryEvidence } from '@/lib/history-enrichment';
import { buildCriticalNewsBrief } from '@/lib/news-brief';
import { withTimeBudget } from '@/lib/provider-budget';

// External enrichment (API-Football + news) can exceed the default 10s timeout.
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const entryId = String(body.entryId || '').trim();
  const riskProfile = (body.riskProfile || 'balanced') as RiskProfile;
  const goal = (body.goal || 'both') as Goal;
  const requestedFreeTransfers = Number(body.freeTransfers);
  const freeTransfers = Number.isFinite(requestedFreeTransfers)
    ? Math.max(0, Math.min(5, requestedFreeTransfers))
    : 1;
  const plannedSquadIds = Array.isArray(body.plannedSquadIds)
    ? body.plannedSquadIds.map(Number).filter(Number.isFinite)
    : [];
  const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
  if (!boot) return NextResponse.json({ error: 'FPL API unavailable' }, { status: 200 });

  const next = nextEvent(boot.events);
  const completedGameweeks = boot.events.filter(event => event.finished).length;
  const basePlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completedGameweeks);
  const apiFallback = {
    enabled: true, matchedPlayers: 0, fixturesChecked: 0, friendlyFixturesChecked: 0,
    oddsFixturesChecked: 0, oddsTeamsMatched: 0, identityMatched: 0, identityAmbiguous: 0,
    identityUnmatched: 0, internationalFixturesChecked: 0, internationalPlayersMatched: 0,
    evidence: new Map<number, never>(), error: 'API-Football exceeded the 12-second decision budget.',
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
  const [apiResult, newsResult, historyResult] = await Promise.all([
    withTimeBudget(getApiFootballEvidence(basePlayers), apiFallback, 12_000),
    withTimeBudget(getExternalNewsSignals(basePlayers, plannedSquadIds), newsFallback, 8_000),
    withTimeBudget(getRecentHistoryEvidence(basePlayers, plannedSquadIds), historyFallback, 10_000),
  ]);
  const apiFootballScan = apiResult.value;
  const newsScan = newsResult.value;
  const historyScan = historyResult.value;
  const providerTimings = {
    apiFootball: apiResult.timing,
    news: newsResult.timing,
    history: historyResult.timing,
  };
  const historyPlayers = applyRecentHistoryEvidence(basePlayers, historyScan);
  const statsPlayers = applyApiFootballEvidence(historyPlayers, apiFootballScan);
  const allPlayers = applyExternalNewsSignals(statsPlayers, newsScan);
  const oldGw38 = next?.name?.includes('38') && next?.deadline_time && new Date(next.deadline_time).getTime() < Date.now();
  const isPreSeason = completedGameweeks === 0 || !next || !next.deadline_time || !!oldGw38;

  if (!entryId || isPreSeason) {
    const plannedSquad = plannedSquadIds.length === 15
      ? allPlayers.filter((player) => plannedSquadIds.includes(player.id))
      : [];
    return NextResponse.json({
      ...buildDecision({
        allPlayers,
        squad: plannedSquad.length === 15 ? plannedSquad : undefined,
        riskProfile,
        goal,
        isPreSeason: true,
      }),
      squadSource: plannedSquad.length === 15 ? 'planned-draft' : 'model-draft',
      newsBrief: buildCriticalNewsBrief(allPlayers, plannedSquad, newsScan.conflicts),
      entryAvailability: entryId
        ? 'Official FPL public API does not expose the private pre-deadline squad. A saved planned draft is used until picks become public.'
        : 'No Entry ID connected.',
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
      historyVerification: {
        ok: historyScan.ok,
        requestedPlayers: historyScan.requestedPlayers,
        successfulPlayers: historyScan.successfulPlayers,
        checkedAt: historyScan.checkedAt,
      },
      providerTimings,
    });
  }

  const event = currentEvent(boot.events);
  if (!event?.id) return NextResponse.json(buildDecision({ allPlayers, riskProfile, goal, isPreSeason: true }));

  const [entry, picks] = await Promise.all([getEntry(entryId), getEntryPicks(entryId, event.id)]);
  if (!entry || !picks?.picks) {
    return NextResponse.json({
      ...buildDecision({ allPlayers, riskProfile, goal, isPreSeason: true }),
      warning: 'Entry data not found. Pre-season model shown instead.',
    });
  }

  const map = new Map(allPlayers.map(p => [p.id, p]));
  // Estimate per-player selling price from the team's total selling value
  // (entry_history.value). The public API does not expose per-player selling
  // price; scaling market price by value/marketSum corrects the systematic
  // over-statement of funds when players have risen in price.
  const marketSum = picks.picks.reduce((sum: number, pick: any) => sum + (map.get(pick.element)?.price || 0), 0);
  const teamValue = Number((picks.entry_history?.value || 0) / 10);
  const sellRatio = marketSum > 0 && teamValue > 0 ? Math.min(1, teamValue / marketSum) : 1;
  const squad = picks.picks
    .map((pick: any) => {
      const player = map.get(pick.element);
      return player ? { ...player, sellingPrice: Number((player.price * sellRatio).toFixed(1)) } : undefined;
    })
    .filter(Boolean) as ModelPlayer[];
  const bank = Number((picks.entry_history?.bank || 0) / 10);

  return NextResponse.json({
    ...buildDecision({ allPlayers, squad, bank, freeTransfers, riskProfile, goal, isPreSeason: false }),
    newsBrief: buildCriticalNewsBrief(allPlayers, squad, newsScan.conflicts),
    entry,
    bank,
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
    historyVerification: {
      ok: historyScan.ok,
      requestedPlayers: historyScan.requestedPlayers,
      successfulPlayers: historyScan.successfulPlayers,
      checkedAt: historyScan.checkedAt,
    },
    providerTimings,
  });
}

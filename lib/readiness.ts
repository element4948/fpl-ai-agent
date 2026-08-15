import type { CalibrationResult, ModelPlayer, ModelReadiness } from '@/types/fpl';

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildModelReadiness(
  players: ModelPlayer[],
  calibration: CalibrationResult[] = [],
): ModelReadiness {
  const count = Math.max(players.length, 1);
  const goodData = players.filter((player) => player.dataQuality === 'good').length / count;
  const trustedExternal = players.filter((player) =>
    player.externalNews?.some((signal) => signal.tier !== 'secondary'),
  ).length;
  const newsChecked = players.filter((player) => Boolean(player.newsCheckedAt)).length;
  const officialClubChecked = players.filter((player) => Boolean(player.officialClubNewsCheckedAt)).length;
  const recentHistoryChecked = players.filter((player) => Boolean(player.historyCheckedAt)).length;
  const apiLineups = players.filter((player) =>
    Boolean(player.apiFootball?.identityVerified) && (player.apiFootball?.matches || 0) > 0,
  ).length;
  const clubFriendlies = players.filter((player) => (player.apiFootball?.friendlyMatches || 0) > 0).length;
  const marketOdds = players.filter((player) => player.apiFootball?.oddsWinProbability != null).length;
  const internationalMinutes = players.filter((player) =>
    Boolean(player.apiFootball?.identityVerified) && (player.apiFootball?.internationalMatches || 0) > 0,
  ).length;
  const pressConference = players.filter((player) =>
    player.externalNews?.some((signal) => signal.category === 'press-conference'),
  ).length;
  const internationalSignals = players.filter((player) =>
    player.externalNews?.some((signal) => signal.category === 'international'),
  ).length;
  const friendlyInternational = players.filter((player) =>
    player.externalNews?.some((signal) =>
      ['friendly', 'international', 'fatigue'].includes(signal.category),
    ),
  ).length;
  const calibratedEvents = calibration.length;
  const fixtureCoverage = players.filter((player) => player.fixture?.fixtures.length).length / count;
  const evidenceCoverage = players.reduce(
    (sum, player) => sum + (player.evidence?.coverageScore || 0),
    0,
  ) / count;
  const positionCoverage = players.filter((player) => {
    if (player.position === 'GKP') return player.saves > 0 || player.cleanSheets > 0;
    if (player.position === 'DEF') return player.cleanSheets > 0 || player.defensiveContributionPer90 > 0 || player.expectedGoalInvolvements > 0;
    return player.expectedGoalInvolvements > 0 || player.defensiveContributionPer90 > 0;
  }).length / count;
  const plannedPlayers = players.filter((player) => player.projection.gameweeks >= 3).length / count;
  const newsCheckedCoverage = newsChecked / count;
  const officialClubCoverage = officialClubChecked / count;
  const recentHistoryCoverage = recentHistoryChecked / count;
  const apiLineupCoverage = apiLineups / count;
  const clubFriendlyCoverage = clubFriendlies / count;
  const oddsCoverage = marketOdds / count;
  const pressCoverage = pressConference / count;
  const internationalCoverage = internationalSignals / count;
  const structuredInternationalCoverage = internationalMinutes / count;
  const trustedExternalCoverage = trustedExternal / count;
  const friendlyCoverage = friendlyInternational / count;
  const sourceStatus = (
    coverage: number,
    partialThreshold = 0.01,
    availableThreshold = 0.8,
  ): 'available' | 'partial' | 'missing' =>
    coverage >= availableThreshold ? 'available' : coverage >= partialThreshold ? 'partial' : 'missing';
  const sources: ModelReadiness['sources'] = [
    { id: 'official-fpl', label: 'Official FPL player data', status: 'available', coverage: 100 },
    { id: 'official-fixtures', label: 'Official FPL fixtures', status: sourceStatus(fixtureCoverage), coverage: clamp(fixtureCoverage * 100) },
    { id: 'official-history', label: 'Official FPL live/history fields', status: sourceStatus(goodData), coverage: clamp(goodData * 100) },
    { id: 'recent-player-history', label: 'Official FPL recent 5-match history', status: sourceStatus(recentHistoryCoverage), coverage: clamp(recentHistoryCoverage * 100) },
    { id: 'api-football', label: 'API-Football lineup/minutes corroboration', status: sourceStatus(apiLineupCoverage), coverage: clamp(apiLineupCoverage * 100) },
    { id: 'club-friendlies', label: 'Structured club-friendly lineup/minutes', status: sourceStatus(clubFriendlyCoverage), coverage: clamp(clubFriendlyCoverage * 100) },
    { id: 'market-odds', label: 'API-Football normalized match odds', status: sourceStatus(oddsCoverage), coverage: clamp(oddsCoverage * 100) },
    { id: 'recent-news', label: 'Recent injury/transfer/news scan', status: sourceStatus(newsCheckedCoverage), coverage: clamp(newsCheckedCoverage * 100) },
    { id: 'official-club-news', label: 'Official club news search', status: sourceStatus(officialClubCoverage), coverage: clamp(officialClubCoverage * 100) },
    { id: 'press-conference', label: 'Official/reliable press-conference reports', status: sourceStatus(pressCoverage), coverage: clamp(pressCoverage * 100) },
    { id: 'international-minutes', label: 'Structured international minutes', status: sourceStatus(structuredInternationalCoverage), coverage: clamp(structuredInternationalCoverage * 100) },
    { id: 'calibration', label: 'Finished-GW prediction calibration', status: calibratedEvents >= 5 ? 'available' : calibratedEvents ? 'partial' : 'missing', coverage: clamp((calibratedEvents / 5) * 100) },
  ];
  const missingCritical = sources
    .filter((source) => source.status !== 'available')
    .map((source) => `${source.label}: ${source.coverage}% coverage`);

  return {
    rules: 100,
    // The optimizer is a bounded beam search, not a mathematical proof of the
    // global optimum, so readiness must not claim 100%.
    squadOptimization: 88,
    officialData: clamp(evidenceCoverage * 0.75 + fixtureCoverage * 25),
    positionModels: clamp(45 + positionCoverage * 50),
    starterMinutes: clamp(goodData * 50 + recentHistoryCoverage * 30 + apiLineupCoverage * 20),
    injuryAvailability: clamp(65 + newsCheckedCoverage * 15 + officialClubCoverage * 10 + trustedExternalCoverage * 10),
    transferNews: clamp(newsCheckedCoverage * 50 + officialClubCoverage * 20 + trustedExternalCoverage * 30),
    // News mentions are not the same as a structured friendly/national-team
    // minutes feed, so this category is deliberately capped below "ready".
    friendlyInternational: Math.min(85, clamp(clubFriendlyCoverage * 35 + structuredInternationalCoverage * 35 + internationalCoverage * 10 + friendlyCoverage * 5)),
    multiSourceVerification: clamp(25 + newsCheckedCoverage * 20 + officialClubCoverage * 15 + apiLineupCoverage * 20 + oddsCoverage * 10 + pressCoverage * 10),
    calibration: clamp(10 + calibratedEvents * 14),
    multiGameweekPlanning: clamp(30 + plannedPlayers * 65),
    sources,
    missingCritical,
  };
}

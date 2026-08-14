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
  const apiFootball = players.filter((player) => Boolean(player.apiFootball)).length;
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
  const apiFootballCoverage = apiFootball / count;
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
    { id: 'api-football', label: 'API-Football lineup/minutes corroboration', status: sourceStatus(apiFootballCoverage), coverage: clamp(apiFootballCoverage * 100) },
    { id: 'recent-news', label: 'Recent injury/transfer/news scan', status: sourceStatus(newsCheckedCoverage), coverage: clamp(newsCheckedCoverage * 100) },
    { id: 'friendly-international', label: 'Friendly/international structured minutes', status: sourceStatus(friendlyCoverage), coverage: clamp(friendlyCoverage * 100) },
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
    starterMinutes: clamp(goodData * 70 + apiFootballCoverage * 30),
    injuryAvailability: clamp(70 + newsCheckedCoverage * 20 + trustedExternalCoverage * 10),
    transferNews: clamp(newsCheckedCoverage * 65 + trustedExternalCoverage * 35),
    // News mentions are not the same as a structured friendly/national-team
    // minutes feed, so this category is deliberately capped below "ready".
    friendlyInternational: Math.min(45, clamp(newsCheckedCoverage * 35 + friendlyCoverage * 10)),
    multiSourceVerification: clamp(40 + newsCheckedCoverage * 30 + apiFootballCoverage * 30),
    calibration: clamp(10 + calibratedEvents * 14),
    multiGameweekPlanning: clamp(30 + plannedPlayers * 65),
    sources,
    missingCritical,
  };
}

import type { DraftTrust, ModelPlayer, PlayerEvidence } from '@/types/fpl';

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildPlayerEvidence(player: ModelPlayer): PlayerEvidence {
  const availableMetrics: string[] = ['price', 'ownership', 'status'];
  const missingMetrics: string[] = [];

  if (player.fixture?.fixtures.length) availableMetrics.push('fixtures');
  else missingMetrics.push('fixtures');

  if (player.minutes > 0 || player.starts > 0) {
    availableMetrics.push('minutes', 'starts');
  } else {
    missingMetrics.push('live minutes', 'starts');
  }

  if (player.form > 0 || player.totalPoints > 0) availableMetrics.push('form', 'FPL points');
  else missingMetrics.push('live form');

  if (player.expectedGoalInvolvements > 0) availableMetrics.push('xG', 'xA', 'xGI');
  else missingMetrics.push('xG/xA/xGI');

  if (player.ictIndex > 0) availableMetrics.push('ICT', 'influence', 'creativity', 'threat');
  else missingMetrics.push('ICT metrics');

  if (player.signals.length || player.status !== 'a') availableMetrics.push('official availability/news');
  else availableMetrics.push('official status');

  const liveDataScore =
    player.dataQuality === 'good' ? 32 : player.dataQuality === 'limited' ? 18 : 4;
  const coverageScore = clamp(
    22 +
      liveDataScore +
      (player.fixture?.fixtures.length ? 14 : 0) +
      (player.expectedGoalInvolvements > 0 ? 14 : 0) +
      (player.ictIndex > 0 ? 10 : 0) +
      (player.signals.length || player.status !== 'a' ? 8 : 4),
  );

  return {
    coverageScore,
    trustLevel:
      player.dataQuality === 'good' && coverageScore >= 78
        ? 'high'
        : coverageScore >= 52
          ? 'medium'
          : 'low',
    availableMetrics,
    missingMetrics,
    sources: [
      {
        id: 'official-fpl',
        label: 'Official FPL player data',
        status: 'available',
      },
      {
        id: 'official-fpl-fixtures',
        label: 'Official FPL fixtures',
        status: player.fixture?.fixtures.length ? 'available' : 'missing',
      },
      {
        id: 'official-fpl-history',
        label: 'Official FPL live/history indicators',
        status:
          player.dataQuality === 'good'
            ? 'available'
            : player.dataQuality === 'limited'
              ? 'limited'
              : 'missing',
      },
    ],
  };
}

export function buildDraftTrust(
  squad: ModelPlayer[],
  startingXI: ModelPlayer[],
): DraftTrust {
  const goodDataPlayers = squad.filter((player) => player.dataQuality === 'good').length;
  const limitedDataPlayers = squad.filter((player) => player.dataQuality === 'limited').length;
  const unknownDataPlayers = squad.filter((player) => player.dataQuality === 'unknown').length;
  const lowCoverageStarters = startingXI.filter(
    (player) => (player.evidence?.coverageScore || 0) < 52,
  );
  const unreliableStarters = startingXI.filter(
    (player) => player.starterConfidence < 68 || player.predictedMinutes < 60,
  );
  const missingFixturePlayers = squad.filter(
    (player) => !player.fixture?.fixtures.length,
  );
  const newsCheckedPlayers = squad.filter((player) => player.newsCheckedAt).length;
  const officialWarnings = squad.filter((player) =>
    player.signals.some((signal) => signal.severity === 'high'),
  );
  const currentRoleVerifiedStarters = startingXI.filter((player) =>
    Boolean(
      (player.apiFootball?.currentSeason &&
        player.apiFootball.currentTeamMatched &&
        player.apiFootball.identityVerified &&
        player.apiFootball.competitiveMatches >= 2) ||
      (player.roleAssessment?.role === 'first-choice' &&
        player.roleAssessment.confidence >= 75),
    ),
  );
  const averageCoverage = squad.length
    ? squad.reduce((sum, player) => sum + (player.evidence?.coverageScore || 0), 0) /
      squad.length
    : 0;
  const rawScore = clamp(
    averageCoverage -
      lowCoverageStarters.length * 7 -
      unreliableStarters.length * 8 -
      officialWarnings.length * 8 -
      (squad.length - newsCheckedPlayers) * 3 -
      unknownDataPlayers * 2,
  );
  const score = goodDataPlayers === 0 ? Math.min(72, rawScore) : rawScore;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (squad.length !== 15) blockers.push('15 тоглогчтой бүрэн squad бүрдээгүй.');
  if (lowCoverageStarters.length) {
    blockers.push(
      `${lowCoverageStarters.length} гарааны тоглогчийн evidence coverage хангалтгүй.`,
    );
  }
  if (unreliableStarters.length) {
    blockers.push(
      `${unreliableStarters.length} гарааны тоглогчийн минут/гарааны баталгаа хангалтгүй.`,
    );
  }
  if (officialWarnings.length) {
    blockers.push(`${officialWarnings.length} тоглогч Official FPL high warning-тай.`);
  }
  if (missingFixturePlayers.length) {
    blockers.push(`${missingFixturePlayers.length} тоглогчийн Official FPL fixture data алга.`);
  }
  if (newsCheckedPlayers < squad.length) {
    blockers.push(
      `${squad.length - newsCheckedPlayers} тоглогч recent injury/transfer/news scan-д хамрагдаагүй.`,
    );
  }
  if (currentRoleVerifiedStarters.length < startingXI.length) {
    blockers.push(
      `${startingXI.length - currentRoleVerifiedStarters.length} гарааны тоглогчийн current-team role хоёр дахь эх сурвалжаар баталгаажаагүй.`,
    );
  }
  if (limitedDataPlayers) warnings.push(`${limitedDataPlayers} тоглогч limited data-тай.`);
  if (unknownDataPlayers) warnings.push(`${unknownDataPlayers} тоглогч unknown data-тай.`);
  if (!squad.some((player) => player.expectedGoalInvolvements > 0)) {
    warnings.push('Live xG/xA/xGI өгөгдөл хараахан бүрдээгүй.');
  }

  return {
    score,
    status:
      blockers.length || score < 52
        ? 'insufficient'
        : score >= 80 &&
            newsCheckedPlayers === squad.length &&
            unknownDataPlayers === 0 &&
            currentRoleVerifiedStarters.length === startingXI.length
          ? 'verified'
          : 'provisional',
    sourceCount:
      1 +
      (squad.some((player) => Boolean(player.fixture?.fixtures.length)) ? 1 : 0) +
      (squad.some((player) => player.dataQuality !== 'unknown') ? 1 : 0) +
      (squad.some((player) => player.externalNews?.some((signal) => signal.tier === 'official')) ? 1 : 0) +
      (squad.some((player) => player.externalNews?.some((signal) => signal.tier === 'reliable')) ? 1 : 0) +
      (squad.some((player) => Boolean(player.apiFootball)) ? 1 : 0),
    goodDataPlayers,
    limitedDataPlayers,
    unknownDataPlayers,
    newsCheckedPlayers,
    blockers,
    warnings,
  };
}

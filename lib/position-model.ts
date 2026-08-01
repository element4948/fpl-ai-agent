import type { ModelPlayer } from '@/types/fpl';

function per90(value: number, minutes: number) {
  return minutes >= 90 ? (value / minutes) * 90 : 0;
}

function primarySetPieceBonus(player: ModelPlayer) {
  return (
    (player.setPieceRoles?.corners === 1 ? 0.55 : 0) +
    (player.setPieceRoles?.directFreeKicks === 1 ? 0.55 : 0) +
    (player.setPieceRoles?.penalties === 1 ? 0.85 : 0)
  );
}

export function fantasyReturnRouteScore(player: ModelPlayer): number {
  const xgi90 = per90(player.expectedGoalInvolvements, player.minutes);
  const returnsPerStart = player.starts > 0
    ? (player.goalsScored + player.assists) / player.starts
    : 0;
  const bonusPerStart = player.starts > 0 ? player.bonus / player.starts : 0;
  const setPieces = primarySetPieceBonus(player);

  if (player.position === 'MID') {
    return (
      Math.min(1.8, xgi90 * 3.2) +
      Math.min(1.1, returnsPerStart * 2) +
      setPieces +
      Math.min(0.7, player.defensiveContributionPoints * 0.35) +
      Math.min(0.35, bonusPerStart * 0.18) +
      Math.max(0, (player.teamOverallStrength - 3) * 0.12)
    );
  }

  if (player.position === 'FWD') {
    return (
      Math.min(2.2, xgi90 * 3.5) +
      Math.min(1.2, returnsPerStart * 2.2) +
      setPieces +
      Math.min(0.3, bonusPerStart * 0.15)
    );
  }

  return positionUpsideScore(player);
}

export function positionMetricChecks(player: ModelPlayer) {
  const common = [
    player.starterConfidence >= 68,
    player.predictedMinutes >= 60,
    player.risk <= 40,
    player.expectedPoints >= 3.5,
    (player.fixture?.averageDifficulty ?? 5) <= 3.3,
  ];
  if (player.position === 'GKP') {
    return [...common, player.cleanSheets > 0, player.saves > 0, player.teamDefensiveStrength >= 3];
  }
  if (player.position === 'DEF') {
    return [...common, player.cleanSheets > 0, player.expectedGoalInvolvements > 0, player.defensiveContributionPer90 > 0, player.teamDefensiveStrength >= 3];
  }
  if (player.position === 'MID') {
    return [...common, player.expectedGoalInvolvements > 0, player.form > 0, Object.values(player.setPieceRoles || {}).some((order) => order === 1), player.teamOverallStrength >= 3];
  }
  return [...common, player.expectedGoalInvolvements > 0, player.goalsScored > 0, player.threat > 0, player.teamOverallStrength >= 3];
}

export function positionUpsideScore(player: ModelPlayer): number {
  const xgi90 = per90(player.expectedGoalInvolvements, player.minutes);
  const goal90 = per90(player.goalsScored, player.minutes);
  const assist90 = per90(player.assists, player.minutes);
  const cleanSheetRate =
    player.starts > 0 ? player.cleanSheets / player.starts : 0;
  const setPieces = primarySetPieceBonus(player);

  if (player.position === 'GKP') {
    return (
      Math.min(1.5, cleanSheetRate * 2.4) +
      Math.min(1, per90(player.saves, player.minutes) * 0.16) +
      Math.min(0.7, player.penaltiesSaved * 0.25) +
      Math.min(0.6, per90(player.bonus, player.minutes) * 0.3) +
      Math.max(0, (player.teamDefensiveStrength - 3) * 0.16)
    );
  }

  if (player.position === 'DEF') {
    return (
      Math.min(1.8, xgi90 * 2.5) +
      Math.min(1.4, cleanSheetRate * 2.1) +
      Math.min(1.1, player.defensiveContributionPer90 * 0.09) +
      Math.min(0.8, goal90 * 2.4 + assist90 * 1.5) +
      Math.max(0, (player.teamDefensiveStrength - 3) * 0.14) +
      setPieces
    );
  }

  if (player.position === 'MID') {
    return (
      Math.min(2.5, xgi90 * 2.8) +
      Math.min(1.2, goal90 * 2.2 + assist90 * 1.5) +
      Math.min(0.7, per90(player.creativity, player.minutes) * 0.012) +
      Math.min(0.7, per90(player.threat, player.minutes) * 0.01) +
      setPieces +
      Math.max(-0.5, Math.min(0.8, (player.teamOverallStrength - 3) * 0.18))
    );
  }

  return (
    Math.min(3, xgi90 * 3) +
    Math.min(1.4, goal90 * 2.7 + assist90 * 1.2) +
    Math.min(0.9, per90(player.threat, player.minutes) * 0.012) +
    setPieces +
    Math.max(-0.6, Math.min(1, (player.teamOverallStrength - 3) * 0.22))
  );
}

export function positionSelectionReasons(player: ModelPlayer): string[] {
  const reasons: string[] = [];
  const xgi90 = per90(player.expectedGoalInvolvements, player.minutes);
  const cleanSheetRate =
    player.starts > 0 ? player.cleanSheets / player.starts : 0;

  if (player.position === 'GKP') {
    if (cleanSheetRate >= 0.3) reasons.push(`CS rate ${Math.round(cleanSheetRate * 100)}%`);
    if (per90(player.saves, player.minutes) >= 3) reasons.push('Save potential');
    if (player.penaltiesSaved > 0) reasons.push(`${player.penaltiesSaved} penalty save`);
  }

  if (player.position === 'DEF') {
    if (cleanSheetRate >= 0.3) reasons.push(`CS rate ${Math.round(cleanSheetRate * 100)}%`);
    if (xgi90 >= 0.12) reasons.push(`xGI/90 ${xgi90.toFixed(2)}`);
    if (player.defensiveContributionPer90 >= 8) {
      reasons.push(`DefCon/90 ${player.defensiveContributionPer90.toFixed(1)}`);
    }
  }

  if (player.position === 'MID' || player.position === 'FWD') {
    if (xgi90 >= 0.3) reasons.push(`xGI/90 ${xgi90.toFixed(2)}`);
    if (player.goalsScored + player.assists > 0) {
      reasons.push(`${player.goalsScored} goal · ${player.assists} assist`);
    }
  }

  if (player.position === 'MID' && fantasyReturnRouteScore(player) >= 1) {
    reasons.push('Оноо авах олон замтай');
  }

  if (player.setPieceRoles?.penalties === 1) reasons.push('1-р penalty taker');
  if (player.setPieceRoles?.directFreeKicks === 1) reasons.push('1-р free-kick taker');
  if (player.setPieceRoles?.corners === 1) reasons.push('1-р corner taker');

  return reasons;
}

import { ModelPlayer } from '@/types/fpl';

export function rankCaptainCandidates(players: ModelPlayer[], limit = 8) {
  return [...players]
    .filter(
      p =>
        p.position !== 'GKP' &&
        p.starterConfidence >= 60 &&
        p.predictedMinutes >= 55 &&
        (p.evidence?.coverageScore || 0) >= 45,
    )
    .sort((a, b) => captainScore(b) - captainScore(a))
    .slice(0, limit)
    .map(p => ({ ...p, captainScore: Number(captainScore(p).toFixed(2)) }));
}

export function captainScore(p: ModelPlayer) {
  const setPieceBonus =
    (p.setPieceRoles.penalties === 1 ? 0.35 : 0) +
    (p.setPieceRoles.directFreeKicks === 1 ? 0.12 : 0);
  return (
    p.expectedPoints * 2.1 +
    p.appearanceProbability * 1.5 +
    setPieceBonus -
    p.risk * 0.02
  );
}

export function topTargetsByPosition(players: ModelPlayer[]) {
  const groups: Record<string, ModelPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) {
    if (
      groups[p.position] &&
      p.starterConfidence >= 50 &&
      p.predictedMinutes >= 45 &&
      (p.evidence?.coverageScore || 0) >= 38
    ) {
      groups[p.position].push(p);
    }
  }
  for (const key of Object.keys(groups)) {
    groups[key] = groups[key]
      .sort((a, b) => targetScore(b) - targetScore(a))
      .slice(0, 8);
  }
  return groups;
}

function targetScore(player: ModelPlayer) {
  const gameweeks = Math.max(1, player.projection.gameweeks);
  const horizon =
    (player.projection.next3 / Math.min(3, gameweeks)) * 0.55 +
    (player.projection.next5 / Math.min(5, gameweeks)) * 0.45;
  return (
    player.expectedPoints * 1.15 +
    horizon * 1.2 +
    player.valueScore * 0.55 +
    player.appearanceProbability -
    player.risk * 0.018
  );
}

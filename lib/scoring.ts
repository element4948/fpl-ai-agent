import { ModelPlayer } from '@/types/fpl';

export function rankCaptainCandidates(players: ModelPlayer[], limit = 8) {
  return [...players]
    .filter(p => p.position !== 'GKP' && p.starterConfidence >= 60 && p.predictedMinutes >= 55)
    .sort((a, b) => captainScore(b) - captainScore(a))
    .slice(0, limit)
    .map(p => ({ ...p, captainScore: Number(captainScore(p).toFixed(2)) }));
}

export function captainScore(p: ModelPlayer) {
  return (
    p.expectedPoints * 1.55 +
    p.form * 0.7 +
    p.confidence * 0.04 +
    p.starterConfidence * 0.055 +
    p.predictedMinutes * 0.035 +
    Math.min(8, p.ownership * 0.08) -
    p.risk * 0.08
  );
}

export function topTargetsByPosition(players: ModelPlayer[]) {
  const groups: Record<string, ModelPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) {
    if (groups[p.position] && p.starterConfidence >= 50 && p.predictedMinutes >= 45) {
      groups[p.position].push(p);
    }
  }
  for (const key of Object.keys(groups)) {
    groups[key] = groups[key]
      .sort(
        (a, b) =>
          b.expectedPoints +
          b.valueScore +
          b.starterConfidence * 0.04 +
          b.predictedMinutes * 0.025 -
          b.risk * 0.025 -
          (a.expectedPoints +
            a.valueScore +
            a.starterConfidence * 0.04 +
            a.predictedMinutes * 0.025 -
            a.risk * 0.025),
      )
      .slice(0, 8);
  }
  return groups;
}

import type { ModelPlayer, RiskProfile } from '@/types/fpl';
import { calculateRisk } from './risk';

function clamp(value: number, min = 1, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function calculateConfidence(player: ModelPlayer, riskProfile: RiskProfile = 'balanced') {
  const risk = calculateRisk(player);
  const profileAdjustment = riskProfile === 'safe' ? -risk.total * 0.08 : riskProfile === 'aggressive' ? player.form * 0.8 : 0;
  const score =
    28 +
    player.expectedPoints * 5.2 +
    player.form * 2.2 +
    Math.min(18, player.predictedMinutes / 5) +
    player.starterConfidence * 0.16 +
    Math.min(8, player.ownership / 5) -
    risk.total * 0.36 +
    profileAdjustment;

  const dataQualityCap =
    player.dataQuality === 'good'
      ? 95
      : player.dataQuality === 'limited'
        ? 78
        : 55;
  const evidenceCap =
    player.evidence?.trustLevel === 'high'
      ? 95
      : player.evidence?.trustLevel === 'medium'
        ? 82
        : 62;
  return clamp(Math.min(score, dataQualityCap, evidenceCap));
}

import type { ModelPlayer } from '@/types/fpl';
import { validateSquad } from './rules';
import { isReliableStarter } from './starter';

export function suggestSafeTransfers(squad: ModelPlayer[], all: ModelPlayer[], bank = 0, freeTransfers = 1) {
  const usableFreeTransfers = Math.max(0, Math.min(5, freeTransfers));
  if (!squad?.length || usableFreeTransfers < 1) return [];
  const squadIds = new Set(squad.map(p => p.id));
  const currentSquadCost = squad.reduce((sum, player) => sum + player.price, 0);
  const suggestions: any[] = [];
  for (const out of squad) {
    const candidates = all
      .filter(p => !squadIds.has(p.id))
      .filter(p => p.positionId === out.positionId)
      .filter(p => p.price <= out.price + bank)
      .filter(p => p.risk <= 45 && isReliableStarter(p))
      .sort((a, b) => transferGain(b, out) - transferGain(a, out))
      .slice(0, 8);
    for (const inn of candidates) {
      const nextSquad = squad.map(p => p.id === out.id ? inn : p);
      const validation = validateSquad(nextSquad, currentSquadCost + bank);
      const gain = transferGain(inn, out);
      const urgentExit = out.risk >= 55 || !isReliableStarter(out, 50);
      const minimumGain = urgentExit ? 0.4 : usableFreeTransfers >= 5 ? 0.8 : 1.5;
      if (validation.valid && gain > minimumGain) {
        suggestions.push({
          out: out.name,
          in: inn.name,
          outPlayer: out,
          inPlayer: inn,
          expectedGain: Number(gain.toFixed(2)),
          costChange: Number((inn.price - out.price).toFixed(1)),
          hitCost: 0,
          freeTransfersUsed: 1,
          freeTransfersRemaining: usableFreeTransfers - 1,
          policy: urgentExit
            ? 'Urgent risk removal'
            : usableFreeTransfers >= 5
              ? 'Use transfer before storage cap'
              : 'Clear gain required; otherwise roll',
          reasons: buildReasons(out, inn),
        });
      }
    }
  }
  return suggestions.sort((a, b) => b.expectedGain - a.expectedGain).slice(0, 6);
}

function transferGain(inn: ModelPlayer, out: ModelPlayer) {
  return (
    (inn.expectedPoints - out.expectedPoints) +
    (inn.confidence - out.confidence) * 0.025 +
    (inn.starterConfidence - out.starterConfidence) * 0.045 +
    (inn.predictedMinutes - out.predictedMinutes) * 0.025 -
    (inn.risk - out.risk) * 0.035 +
    (inn.valueScore - out.valueScore) * 0.35
    + ((out.fixture?.averageDifficulty ?? 3) - (inn.fixture?.averageDifficulty ?? 3)) * 0.3
    + ((inn.evidence?.coverageScore || 0) - (out.evidence?.coverageScore || 0)) * 0.01
  );
}

function buildReasons(out: ModelPlayer, inn: ModelPlayer) {
  const r: string[] = [];
  if (inn.expectedPoints > out.expectedPoints) r.push('Higher projected points');
  if (inn.confidence > out.confidence) r.push('Better confidence/minutes profile');
  if (inn.risk < out.risk) r.push('Lower injury/rotation/news risk');
  if (inn.valueScore > out.valueScore) r.push('Better value score');
  if (inn.starterConfidence > out.starterConfidence) r.push('Higher starter confidence');
  if (inn.predictedMinutes > out.predictedMinutes) r.push('More predicted minutes');
  return r.length ? r : ['Model prefers incoming player'];
}

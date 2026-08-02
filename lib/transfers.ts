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
    const urgentExit = out.risk >= 55 || !isReliableStarter(out, 50);
    const candidates = all
      .filter(p => !squadIds.has(p.id))
      .filter(p => p.positionId === out.positionId)
      .filter(p => p.price <= out.price + bank)
      .filter(p => p.risk <= 40 && isReliableStarter(p))
      .filter(p => (p.evidence?.coverageScore || 0) >= 52)
      .filter(p => {
        const durability = transferDurability(p, out);
        return urgentExit || durability.availableWeeks < 2 || durability.favourableWeeks >= 2;
      })
      .sort((a, b) => transferGain(b, out) - transferGain(a, out))
      .slice(0, 8);
    for (const inn of candidates) {
      const nextSquad = squad.map(p => p.id === out.id ? inn : p);
      const validation = validateSquad(nextSquad, currentSquadCost + bank);
      const gain = transferGain(inn, out);
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
  const projectionAverage = (player: ModelPlayer, horizon: 3 | 5) =>
    player.projection[`next${horizon}`] /
    Math.max(1, Math.min(horizon, player.projection.gameweeks));
  const nextThreeGain = projectionAverage(inn, 3) - projectionAverage(out, 3);
  const nextFiveGain = projectionAverage(inn, 5) - projectionAverage(out, 5);
  const durability = transferDurability(inn, out);
  const likelyRoundTrip = durability.lateHorizonGain < -0.4;
  const shortFixtureChase = durability.availableWeeks >= 2 && durability.favourableWeeks < 2;
  return (
    (inn.expectedPoints - out.expectedPoints) * 0.45 +
    nextThreeGain * 0.35 +
    nextFiveGain * 0.2 -
    (inn.risk - out.risk) * 0.012 -
    (likelyRoundTrip ? 0.9 : 0) -
    (shortFixtureChase ? 1.5 : 0)
  );
}

function transferDurability(inn: ModelPlayer, out: ModelPlayer) {
  const outByEvent = new Map(out.projection.byEvent.slice(0, 5).map((item) => [item.event, item.points]));
  const gains = inn.projection.byEvent
    .slice(0, 5)
    .filter((item) => outByEvent.has(item.event))
    .map((item) => item.points - (outByEvent.get(item.event) || 0));
  const late = gains.slice(-2);
  return {
    availableWeeks: gains.length,
    favourableWeeks: gains.filter((gain) => gain >= 0.5).length,
    lateHorizonGain: late.length ? late.reduce((sum, gain) => sum + gain, 0) / late.length : 0,
  };
}

function buildReasons(out: ModelPlayer, inn: ModelPlayer) {
  const r: string[] = [];
  if (inn.expectedPoints > out.expectedPoints) r.push('Higher projected points');
  if (inn.confidence > out.confidence) r.push('Better confidence/minutes profile');
  if (inn.risk < out.risk) r.push('Lower injury/rotation/news risk');
  if (inn.valueScore > out.valueScore) r.push('Better value score');
  if (inn.starterConfidence > out.starterConfidence) r.push('Higher starter confidence');
  if (inn.predictedMinutes > out.predictedMinutes) r.push('More predicted minutes');
  if (inn.projection.next3 > out.projection.next3) r.push('Higher next 3 Gameweek projection');
  if (inn.projection.next5 > out.projection.next5) r.push('Stronger five-Gameweek transfer path');
  const durability = transferDurability(inn, out);
  if (durability.favourableWeeks >= 2) r.push('Upgrade holds across multiple Gameweeks');
  r.push('Confirm the FPL selling price before finalising');
  return r.length ? r : ['Model prefers incoming player'];
}

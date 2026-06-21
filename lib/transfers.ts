import { ModelPlayer } from '@/types/fpl';
import { validateSquad } from './rules';

export function suggestSafeTransfers(squad: ModelPlayer[], all: ModelPlayer[], bank = 0, freeTransfers = 1) {
  if (!squad?.length || freeTransfers < 1) return [];
  const squadIds = new Set(squad.map(p => p.id));
  const suggestions: any[] = [];
  for (const out of squad) {
    const candidates = all
      .filter(p => !squadIds.has(p.id))
      .filter(p => p.positionId === out.positionId)
      .filter(p => p.price <= out.price + bank)
      .filter(p => p.risk <= 45)
      .sort((a, b) => transferGain(b, out) - transferGain(a, out))
      .slice(0, 8);
    for (const inn of candidates) {
      const nextSquad = squad.map(p => p.id === out.id ? inn : p);
      const validation = validateSquad(nextSquad, 100 + bank);
      const gain = transferGain(inn, out);
      if (validation.valid && gain > 0.8) {
        suggestions.push({
          out: out.name,
          in: inn.name,
          outPlayer: out,
          inPlayer: inn,
          expectedGain: Number(gain.toFixed(2)),
          costChange: Number((inn.price - out.price).toFixed(1)),
          hitCost: 0,
          reasons: buildReasons(out, inn),
        });
      }
    }
  }
  return suggestions.sort((a, b) => b.expectedGain - a.expectedGain).slice(0, 6);
}

function transferGain(inn: ModelPlayer, out: ModelPlayer) {
  return (inn.expectedPoints - out.expectedPoints) + (inn.confidence - out.confidence) * 0.025 - (inn.risk - out.risk) * 0.035 + (inn.valueScore - out.valueScore) * 0.35;
}

function buildReasons(out: ModelPlayer, inn: ModelPlayer) {
  const r: string[] = [];
  if (inn.expectedPoints > out.expectedPoints) r.push('Higher projected points');
  if (inn.confidence > out.confidence) r.push('Better confidence/minutes profile');
  if (inn.risk < out.risk) r.push('Lower injury/rotation/news risk');
  if (inn.valueScore > out.valueScore) r.push('Better value score');
  return r.length ? r : ['Model prefers incoming player'];
}

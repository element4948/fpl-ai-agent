import { ModelPlayer, SquadValidation } from '@/types/fpl';

const POSITION_REQUIREMENTS: Record<string, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };

export function validateSquad(players: ModelPlayer[], budget = 100): SquadValidation {
  const errors: string[] = [];
  const totalCost = Number(players.reduce((s, p) => s + p.price, 0).toFixed(1));
  const positionCounts: Record<string, number> = {};
  const clubCounts: Record<string, number> = {};
  for (const p of players) {
    positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
    clubCounts[p.team] = (clubCounts[p.team] || 0) + 1;
  }
  if (players.length !== 15) errors.push(`Squad must have 15 players. Current: ${players.length}`);
  if (totalCost > budget) errors.push(`Budget exceeded: £${totalCost}m / £${budget}m`);
  for (const [pos, count] of Object.entries(POSITION_REQUIREMENTS)) {
    if ((positionCounts[pos] || 0) !== count) errors.push(`${pos} must be ${count}. Current: ${positionCounts[pos] || 0}`);
  }
  for (const [team, count] of Object.entries(clubCounts)) {
    if (count > 3) errors.push(`${team} has ${count} players. Max 3.`);
  }
  return { valid: errors.length === 0, totalCost, errors, positionCounts, clubCounts };
}

export function buildDraft(players: ModelPlayer[], mode: 'Best' | 'Alternative' | 'Differential' | 'Safe') {
  const sorted = [...players].sort((a, b) => {
    if (mode === 'Differential') return (b.expectedPoints * 0.75 + b.valueScore * 2 - b.ownership * 0.08 - b.risk * 0.03) - (a.expectedPoints * 0.75 + a.valueScore * 2 - a.ownership * 0.08 - a.risk * 0.03);
    if (mode === 'Safe') return (b.expectedPoints + b.confidence * 0.05 + b.minutes / 900 - b.risk * 0.05) - (a.expectedPoints + a.confidence * 0.05 + a.minutes / 900 - a.risk * 0.05);
    if (mode === 'Alternative') return (b.valueScore * 3 + b.expectedPoints * 0.5 - b.ownership * 0.015) - (a.valueScore * 3 + a.expectedPoints * 0.5 - a.ownership * 0.015);
    return (b.expectedPoints * 1.4 + b.valueScore - b.risk * 0.04) - (a.expectedPoints * 1.4 + a.valueScore - a.risk * 0.04);
  });
  const need: Record<string, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
  const picked: ModelPlayer[] = [];
  const clubCount: Record<string, number> = {};
  let budget = 100;
  for (const p of sorted) {
    if ((need[p.position] || 0) <= 0) continue;
    if ((clubCount[p.team] || 0) >= 3) continue;
    if (budget - p.price < 0) continue;
    picked.push(p);
    need[p.position] -= 1;
    clubCount[p.team] = (clubCount[p.team] || 0) + 1;
    budget = Number((budget - p.price).toFixed(1));
    if (picked.length === 15) break;
  }
  return {
    mode,
    players: picked,
    validation: validateSquad(picked),
    explanation: explainDraft(mode),
  };
}

function explainDraft(mode: string) {
  if (mode === 'Differential') return ['Lower ownership bias', 'Useful when chasing mini-league gaps', 'Higher risk than Safe draft'];
  if (mode === 'Safe') return ['Minutes and availability bias', 'Avoids injury/news risk', 'Good default for early season'];
  if (mode === 'Alternative') return ['Value-first structure', 'Different price distribution', 'Backup to Best Draft'];
  return ['Highest projected points bias', 'Uses price/value/risk together', 'Main recommended draft'];
}

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
    // Use the estimated selling price (<= market price when the player rose),
    // not the market price, so we never suggest an unaffordable transfer.
    const sellOut = out.sellingPrice ?? out.price;
    const urgentExit = out.risk >= 55 || !isReliableStarter(out, 50);
    const candidates = all
      .filter(p => !squadIds.has(p.id))
      .filter(p => p.positionId === out.positionId)
      .filter(p => p.price <= sellOut + bank)
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
      // Budget after the swap: current market value, minus the outgoing player's
      // market price, plus what we actually get for selling him, plus the bank.
      const validation = validateSquad(nextSquad, currentSquadCost - out.price + sellOut + bank);
      const gain = transferGain(inn, out);
      const minimumGain = urgentExit ? 0.4 : usableFreeTransfers >= 5 ? 0.8 : 1.5;
      if (validation.valid && gain > minimumGain) {
        suggestions.push({
          out: out.name,
          in: inn.name,
          outPlayer: out,
          inPlayer: inn,
          expectedGain: Number(gain.toFixed(2)),
          costChange: Number((inn.price - sellOut).toFixed(1)),
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

// ---- Multi-transfer / hit-aware planning ----------------------------------

export type TransferPlanMove = {
  out: string;
  in: string;
  outId: number;
  inId: number;
  gain: number;
  costChange: number;
};

export type TransferPlan = {
  moves: TransferPlanMove[];
  transfersUsed: number;
  hitCost: number;
  grossGain: number;
  netGain: number;
  recommended: boolean;
  label: string;
};

type Move = { out: ModelPlayer; in: ModelPlayer; gain: number; costChange: number };

function eligibleIncoming(out: ModelPlayer, squad: ModelPlayer[], all: ModelPlayer[], bank: number): ModelPlayer[] {
  const squadIds = new Set(squad.map((p) => p.id));
  const sellOut = out.sellingPrice ?? out.price;
  return all
    .filter((p) => !squadIds.has(p.id))
    .filter((p) => p.positionId === out.positionId)
    .filter((p) => p.price <= sellOut + bank)
    .filter((p) => p.risk <= 45 && isReliableStarter(p, 45))
    .filter((p) => (p.evidence?.coverageScore || 0) >= 45)
    .sort((a, b) => transferGain(b, out) - transferGain(a, out))
    .slice(0, 3);
}

function makePlan(moves: Move[], freeTransfers: number): TransferPlan {
  const transfersUsed = moves.length;
  const hitCost = 4 * Math.max(0, transfersUsed - freeTransfers);
  const grossGain = Number(moves.reduce((sum, m) => sum + m.gain, 0).toFixed(2));
  const netGain = Number((grossGain - hitCost).toFixed(2));
  return {
    moves: moves.map((m) => ({
      out: m.out.name,
      in: m.in.name,
      outId: m.out.id,
      inId: m.in.id,
      gain: Number(m.gain.toFixed(2)),
      costChange: m.costChange,
    })),
    transfersUsed,
    hitCost,
    grossGain,
    netGain,
    recommended: false,
    label:
      transfersUsed === 0
        ? 'Hold — roll transfer'
        : `${transfersUsed} transfer${transfersUsed > 1 ? 's' : ''}${hitCost > 0 ? ` (−${hitCost} hit)` : ''}`,
  };
}

/**
 * Evaluate hold / 1-move / 2-move options with hit accounting. A -4 hit is only
 * recommended when its net gain (after the hit) beats every no-hit option and a
 * churn threshold, so worthwhile double moves and hits are captured without
 * making hits the default. Returned sorted by net gain (best first).
 */
export function buildTransferPlans(
  squad: ModelPlayer[],
  all: ModelPlayer[],
  bank = 0,
  freeTransfers = 1,
): TransferPlan[] {
  const ft = Math.max(0, Math.min(5, freeTransfers));
  if (!squad?.length) return [];
  const currentSquadCost = squad.reduce((sum, p) => sum + p.price, 0);

  const singles: Move[] = [];
  for (const out of squad) {
    const sellOut = out.sellingPrice ?? out.price;
    for (const inn of eligibleIncoming(out, squad, all, bank)) {
      const nextSquad = squad.map((p) => (p.id === out.id ? inn : p));
      const budget = currentSquadCost - out.price + sellOut + bank;
      if (!validateSquad(nextSquad, budget).valid) continue;
      const gain = transferGain(inn, out);
      if (gain <= 0) continue;
      singles.push({ out, in: inn, gain, costChange: Number((inn.price - sellOut).toFixed(1)) });
      break;
    }
  }
  singles.sort((a, b) => b.gain - a.gain);

  const plans: TransferPlan[] = [makePlan([], ft)];
  if (singles[0]) plans.push(makePlan([singles[0]], ft));

  let bestPair: { moves: Move[]; gross: number } | null = null;
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      const a = singles[i];
      const b = singles[j];
      if (a.out.id === b.out.id || a.in.id === b.in.id) continue;
      const nextSquad = squad.map((p) => (p.id === a.out.id ? a.in : p.id === b.out.id ? b.in : p));
      const budget =
        currentSquadCost -
        a.out.price -
        b.out.price +
        (a.out.sellingPrice ?? a.out.price) +
        (b.out.sellingPrice ?? b.out.price) +
        bank;
      if (!validateSquad(nextSquad, budget).valid) continue;
      const gross = a.gain + b.gain;
      if (!bestPair || gross > bestPair.gross) bestPair = { moves: [a, b], gross };
    }
  }
  if (bestPair) plans.push(makePlan(bestPair.moves, ft));

  let best = plans[0];
  for (const plan of plans) if (plan.netGain > best.netGain) best = plan;
  const holdPlan = plans.find((p) => p.transfersUsed === 0) ?? plans[0];
  const chosen = best.transfersUsed > 0 && best.netGain > 0.5 ? best : holdPlan;
  for (const plan of plans) plan.recommended = plan === chosen;

  return plans.sort((a, b) => b.netGain - a.netGain);
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
  r.push('Selling price estimated from team value; confirm the exact figure in FPL');
  return r.length ? r : ['Model prefers incoming player'];
}

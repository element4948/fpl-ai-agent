import { isReliableStarter } from '@/lib/starter';
import { fantasyReturnRouteScore } from '@/lib/position-model';
import { lineupProjection, orderBenchForAutoSubs } from '@/lib/lineup';
import type { DraftTeam, ModelPlayer } from '@/types/fpl';

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

type State = {
  players: ModelPlayer[];
  ids: Set<number>;
  clubCounts: Map<number, number>;
  cost: number;
  score: number;
};

function isViableReserve(player: ModelPlayer) {
  const verifiedHighWarning = player.externalNews?.some(
    (signal) =>
      signal.severity === 'high' &&
      (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
  );
  return (
    player.status === 'a' &&
    player.dataQuality !== 'unknown' &&
    player.starterConfidence >= 58 &&
    player.predictedMinutes >= 50 &&
    player.appearanceProbability >= 0.58 &&
    player.risk <= 45 &&
    player.roleAssessment?.role !== 'backup' &&
    player.roleAssessment?.role !== 'competition' &&
    !verifiedHighWarning
  );
}

function isBudgetReserve(player: ModelPlayer) {
  const verifiedHighWarning = player.externalNews?.some(
    (signal) => signal.severity === 'high' &&
      (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
  );
  return player.status === 'a' &&
    player.dataQuality !== 'unknown' &&
    player.starterConfidence >= 38 &&
    player.predictedMinutes >= 25 &&
    player.appearanceProbability >= 0.4 &&
    player.risk <= 55 &&
    player.roleAssessment?.role !== 'backup' &&
    !verifiedHighWarning;
}

const SLOTS: Position[] = [
  'GKP', 'GKP',
  'FWD', 'FWD', 'FWD',
  'DEF', 'DEF', 'DEF', 'DEF', 'DEF',
  'MID', 'MID', 'MID', 'MID', 'MID',
];

const FORMATIONS: Array<Record<Position, number>> = [
  { GKP: 1, DEF: 3, MID: 4, FWD: 3 },
  { GKP: 1, DEF: 3, MID: 5, FWD: 2 },
  { GKP: 1, DEF: 4, MID: 3, FWD: 3 },
  { GKP: 1, DEF: 4, MID: 4, FWD: 2 },
  { GKP: 1, DEF: 4, MID: 5, FWD: 1 },
  { GKP: 1, DEF: 5, MID: 2, FWD: 3 },
  { GKP: 1, DEF: 5, MID: 3, FWD: 2 },
  { GKP: 1, DEF: 5, MID: 4, FWD: 1 },
];

function formationUncertaintyPenalty(
  starters: ModelPlayer[],
  formation: Record<Position, number>,
  mode: DraftTeam['mode'],
) {
  const uncertainShare = starters.filter((player) => player.dataQuality !== 'good').length /
    Math.max(1, starters.length);
  const extraDefenders = Math.max(0, formation.DEF - 3);
  const modeWeight = mode === 'Safe' ? 0.35 : mode === 'Best' ? 0.65 : mode === 'Alternative' ? 0.75 : 0.9;
  return extraDefenders * uncertainShare * modeWeight;
}

function money(value: number) {
  return Math.round(value * 10) / 10;
}

function remainingMinimum(
  slots: Position[],
  pools: Record<Position, ModelPlayer[]>,
) {
  return slots.reduce(
    (sum, position) =>
      sum +
      (pools[position].length
        ? Math.min(...pools[position].map((player) => player.price))
        : 100),
    0,
  );
}

function candidatePool(
  players: ModelPlayer[],
  position: Position,
  scorePlayer: (player: ModelPlayer) => number,
  scoreLimit: number,
  cheapLimit: number,
) {
  const positionPlayers = players.filter((player) => player.position === position);
  const highScore = [...positionPlayers]
    .sort((a, b) => scorePlayer(b) - scorePlayer(a))
    .slice(0, scoreLimit);
  const enablers = [...positionPlayers]
    .sort((a, b) => a.price - b.price || scorePlayer(b) - scorePlayer(a))
    .slice(0, cheapLimit);
  return [...highScore, ...enablers]
    .filter((player, index, list) => list.findIndex((item) => item.id === player.id) === index)
    .sort((a, b) => scorePlayer(b) - scorePlayer(a));
}

/*
 * A fantasy squad is not 15 equal starters. Re-rank completed states by the
 * strongest legal XI, while the bench receives only a cover value. This keeps
 * budget on high-upside starters instead of spreading it across 15 average
 * players.
 */
function completedSquadScore(
  players: ModelPlayer[],
  scorePlayer: (player: ModelPlayer) => number,
  mode: DraftTeam['mode'],
  viablePriceFloors: Record<Position, number>,
  budgetPriceFloors: Record<Position, number>,
) {
  let best = Number.NEGATIVE_INFINITY;
  for (const formation of FORMATIONS) {
    const starters = (Object.keys(formation) as Position[]).flatMap((position) =>
      players
        .filter((player) => player.position === position && isReliableStarter(player))
        .sort((a, b) => lineupProjection(b) - lineupProjection(a))
        .slice(0, formation[position]),
    );
    if (starters.length !== 11) continue;
    const ids = new Set(starters.map((player) => player.id));
    const bench = players.filter((player) => !ids.has(player.id));
    const starterScore = starters.reduce((sum, player) => sum + lineupProjection(player), 0);
    const captainCandidates = starters
      .filter((player) => player.position !== 'GKP')
      .sort((a, b) => lineupProjection(b) - lineupProjection(a));
    const captain = captainCandidates[0];
    const viceCaptain = captainCandidates[1];
    const captainExtra = captain ? lineupProjection(captain) : 0;
    const viceFallback = viceCaptain
      ? lineupProjection(viceCaptain) * (1 - (captain?.appearanceProbability || 0)) * 0.65
      : 0;

    const modeCoverMultiplier = mode === 'Safe' ? 0.5 : mode === 'Best' ? 0.38 : 0.25;
    const autoSubPlan = orderBenchForAutoSubs(starters, bench);
    const benchCover = autoSubPlan.expectedCoverValue * modeCoverMultiplier;
    const orderedOutfield = autoSubPlan.bench.filter((player) => player.position !== 'GKP');
    const backupGoalkeeper = autoSubPlan.bench.find((player) => player.position === 'GKP');
    const premiumWeights = mode === 'Safe' ? [2.8, 5.5, 8] : [3.5, 7, 10];
    const outfieldPremiumPenalty = orderedOutfield.reduce((penalty, player, index) => {
      const floor = index === 0 ? viablePriceFloors[player.position] : budgetPriceFloors[player.position];
      const premium = Math.max(0, player.price - floor);
      return penalty + premium * (premiumWeights[index] ?? 2.15);
    }, 0);
    const goalkeeperPremium = backupGoalkeeper
      ? Math.max(0, backupGoalkeeper.price - viablePriceFloors.GKP) *
        ((starters.find((player) => player.position === 'GKP')?.appearanceProbability ?? 0.9) >= 0.85 ? 10 : 4)
      : 0;
    const viableBaselineCost = orderedOutfield.reduce(
      (sum, player) => sum + budgetPriceFloors[player.position],
      backupGoalkeeper ? budgetPriceFloors.GKP : 0,
    );
    const benchCost = bench.reduce((sum, player) => sum + player.price, 0);
    const allowedPremium = mode === 'Safe' ? 0.7 : mode === 'Best' ? 0.4 : mode === 'Alternative' ? 0.3 : 0.2;
    const unjustifiedBenchSpend = Math.max(
      0,
      benchCost - viableBaselineCost - allowedPremium,
    );
    // Bench budget is a squad-construction rule, not a late warning. A state
    // that spends beyond the cheapest legal cover plus a small first-sub
    // allowance cannot win, irrespective of fixture rotation.
    if (unjustifiedBenchSpend > 0.001) continue;
    if (orderedOutfield.some((player) => !isBudgetReserve(player))) continue;
    const startingGoalkeeper = starters.find((player) => player.position === 'GKP');
    if (backupGoalkeeper && startingGoalkeeper && startingGoalkeeper.appearanceProbability >= 0.85 &&
        backupGoalkeeper.price > budgetPriceFloors.GKP + 0.1) continue;
    const benchSpendPenalty = Math.max(
      0,
      outfieldPremiumPenalty + goalkeeperPremium + unjustifiedBenchSpend * 12,
    );
    const modePreference = mode === 'Safe'
      ? players.reduce((sum, player) => sum + player.appearanceProbability, 0) * 0.04
      : mode === 'Alternative'
        ? players.reduce((sum, player) => sum + player.valueScore, 0) * 0.025
        : mode === 'Differential'
          ? players.reduce((sum, player) => sum + Math.max(0, 12 - player.ownership), 0) * 0.003
          : 0;
    const lowUpsideMidfielders = starters.filter(
      (player) => player.position === 'MID' && fantasyReturnRouteScore(player) < 0.85,
    ).length;
    const midfieldRoutePenalty = Math.max(0, lowUpsideMidfielders - 1) *
      (mode === 'Safe' ? 0.55 : 1.1);
    best = Math.max(
      best,
      starterScore + captainExtra + viceFallback + benchCover + modePreference -
        formationUncertaintyPenalty(starters, formation, mode) - midfieldRoutePenalty - benchSpendPenalty,
    );
  }
  return best;
}

export function optimizeSquadGlobally(
  players: ModelPlayer[],
  maximumSpend: number,
  scorePlayer: (player: ModelPlayer) => number,
  mode: DraftTeam['mode'],
  beamWidth = 4800,
): ModelPlayer[] {
  const pools = {
    GKP: candidatePool(players, 'GKP', scorePlayer, 12, 6),
    DEF: candidatePool(players, 'DEF', scorePlayer, 24, 8),
    MID: candidatePool(players, 'MID', scorePlayer, 24, 8),
    FWD: candidatePool(players, 'FWD', scorePlayer, 18, 7),
  } satisfies Record<Position, ModelPlayer[]>;

  if (Object.values(pools).some((pool) => !pool.length)) return [];

  const viablePriceFloors = (Object.keys(pools) as Position[]).reduce(
    (result, position) => {
      const viable = pools[position].filter(isViableReserve);
      result[position] = Math.min(...(viable.length ? viable : pools[position]).map((player) => player.price));
      return result;
    },
    { GKP: 0, DEF: 0, MID: 0, FWD: 0 } as Record<Position, number>,
  );
  const budgetPriceFloors = (Object.keys(pools) as Position[]).reduce(
    (result, position) => {
      const budgetOptions = pools[position].filter(isBudgetReserve);
      result[position] = Math.min(...(budgetOptions.length ? budgetOptions : pools[position]).map((player) => player.price));
      return result;
    },
    { GKP: 0, DEF: 0, MID: 0, FWD: 0 } as Record<Position, number>,
  );

  let states: State[] = [
    {
      players: [],
      ids: new Set(),
      clubCounts: new Map(),
      cost: 0,
      score: 0,
    },
  ];

  for (let slotIndex = 0; slotIndex < SLOTS.length; slotIndex += 1) {
    const position = SLOTS[slotIndex];
    const minimumAfter = remainingMinimum(SLOTS.slice(slotIndex + 1), pools);
    const expanded: State[] = [];

    for (const state of states) {
      for (const player of pools[position]) {
        if (state.ids.has(player.id)) continue;
        const clubCount = state.clubCounts.get(player.teamId) || 0;
        if (clubCount >= 3) continue;

        const cost = money(state.cost + player.price);
        if (cost + minimumAfter > maximumSpend + 0.001) continue;

        const ids = new Set(state.ids);
        ids.add(player.id);
        const clubCounts = new Map(state.clubCounts);
        clubCounts.set(player.teamId, clubCount + 1);

        expanded.push({
          players: [...state.players, player],
          ids,
          clubCounts,
          cost,
          score: state.score + scorePlayer(player),
        });
      }
    }

    /*
     * Preserve alternatives across price points instead of keeping only the
     * most expensive partial squad. This prevents early premium picks from
     * blocking a stronger completed 15-player structure.
     */
    const bestByBucket = new Map<string, State[]>();
    for (const state of expanded) {
      const clubSignature = [...state.clubCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([club, count]) => `${club}:${count}`)
        .join(',');
      // Use the exact £0.1m price point and retain more than one player
      // combination per structural bucket. The old £0.5m/single-state key
      // could discard the only partial squad able to complete a better XI.
      const key = `${state.players.length}:${Math.round(state.cost * 10)}:${clubSignature}`;
      const signature = state.players.map((player) => player.id).sort((a, b) => a - b).join(',');
      const bucket = bestByBucket.get(key) || [];
      if (!bucket.some((item) => item.players.map((player) => player.id).sort((a, b) => a - b).join(',') === signature)) {
        bucket.push(state);
      }
      bucket.sort((a, b) => b.score - a.score);
      bestByBucket.set(key, bucket.slice(0, beamWidth <= 1200 ? 1 : 2));
    }

    const bucketStates = [...bestByBucket.values()].flat();
    const scoreQuota = Math.ceil(beamWidth * 0.55);
    const valueQuota = beamWidth - scoreQuota;
    const byRawScore = [...bucketStates]
      .sort((a, b) => b.score - a.score)
      .slice(0, scoreQuota);
    /*
     * Keep a second beam for budget-efficient structures. Without this, the
     * partial search spends on all 15 slots, prunes cheap reserve routes, then
     * reaches the final XI/bench evaluator with no legal low-cost bench left.
     * The cost weight grows after the first XI-sized core can exist, so money
     * is deliberately preserved for the starters rather than substitutes.
     */
    const selectedCount = slotIndex + 1;
    const costWeight = selectedCount >= 11 ? 1.8 : selectedCount >= 8 ? 1.1 : 0.55;
    const byBudgetEfficiency = [...bucketStates]
      .sort((a, b) =>
        (b.score - b.cost * costWeight) - (a.score - a.cost * costWeight))
      .slice(0, valueQuota);
    const retained = new Map<string, State>();
    for (const state of [...byRawScore, ...byBudgetEfficiency]) {
      const signature = state.players.map((player) => player.id).sort((a, b) => a - b).join(',');
      retained.set(signature, state);
    }
    states = [...retained.values()].slice(0, beamWidth);

    if (!states.length) return [];
  }

  // Score every completed state exactly once. Array.sort previously called the
  // expensive eight-formation evaluator repeatedly from its comparator,
  // multiplying cold draft time by tens of thousands of evaluations.
  let bestState: State | null = null;
  let bestCompletedScore = Number.NEGATIVE_INFINITY;
  for (const state of states) {
    if (state.players.length !== 15 || state.cost > maximumSpend) continue;
    const finalScore = completedSquadScore(
      state.players,
      scorePlayer,
      mode,
      viablePriceFloors,
      budgetPriceFloors,
    );
    if (finalScore > bestCompletedScore) {
      bestCompletedScore = finalScore;
      bestState = state;
    }
  }
  return bestState?.players || [];
}

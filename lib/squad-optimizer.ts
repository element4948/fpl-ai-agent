import { isReliableStarter } from '@/lib/starter';
import type { DraftTeam, ModelPlayer } from '@/types/fpl';

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

type State = {
  players: ModelPlayer[];
  ids: Set<number>;
  clubCounts: Map<number, number>;
  cost: number;
  score: number;
};

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
) {
  let best = Number.NEGATIVE_INFINITY;
  for (const formation of FORMATIONS) {
    const starters = (Object.keys(formation) as Position[]).flatMap((position) =>
      players
        .filter((player) => player.position === position && isReliableStarter(player))
        .sort((a, b) => scorePlayer(b) - scorePlayer(a))
        .slice(0, formation[position]),
    );
    if (starters.length !== 11) continue;
    const ids = new Set(starters.map((player) => player.id));
    const bench = players.filter((player) => !ids.has(player.id));
    const starterScore = starters.reduce((sum, player) => sum + scorePlayer(player), 0);
    const captainCandidates = starters
      .filter((player) => player.position !== 'GKP')
      .sort((a, b) => b.expectedPoints - a.expectedPoints);
    const captain = captainCandidates[0];
    const viceCaptain = captainCandidates[1];
    const captainExtra = captain?.expectedPoints || 0;
    const viceFallback = viceCaptain
      ? viceCaptain.expectedPoints * (1 - (captain?.appearanceProbability || 0)) * 0.65
      : 0;

    const expectedOutfieldAbsences = starters
      .filter((player) => player.position !== 'GKP')
      .reduce((sum, player) => sum + (1 - player.appearanceProbability), 0);
    const outfieldBench = bench
      .filter((player) => player.position !== 'GKP')
      .sort((a, b) => b.expectedPoints - a.expectedPoints);
    const modeCoverMultiplier = mode === 'Safe' ? 1.15 : mode === 'Differential' ? 0.8 : 1;
    const benchCover = outfieldBench.reduce((sum, player, index) => {
      const activationProbability = Math.max(
        0,
        Math.min(1, expectedOutfieldAbsences - index * 0.65),
      );
      return sum + player.expectedPoints * activationProbability * modeCoverMultiplier;
    }, 0);
    const startingGoalkeeper = starters.find((player) => player.position === 'GKP');
    const backupGoalkeeper = bench.find((player) => player.position === 'GKP');
    const goalkeeperCover = startingGoalkeeper && backupGoalkeeper
      ? backupGoalkeeper.expectedPoints * (1 - startingGoalkeeper.appearanceProbability)
      : 0;
    best = Math.max(
      best,
      starterScore + captainExtra + viceFallback + benchCover + goalkeeperCover -
        formationUncertaintyPenalty(starters, formation, mode),
    );
  }
  return best;
}

export function optimizeSquadGlobally(
  players: ModelPlayer[],
  maximumSpend: number,
  scorePlayer: (player: ModelPlayer) => number,
  mode: DraftTeam['mode'],
): ModelPlayer[] {
  const pools = {
    GKP: candidatePool(players, 'GKP', scorePlayer, 12, 6),
    DEF: candidatePool(players, 'DEF', scorePlayer, 24, 8),
    MID: candidatePool(players, 'MID', scorePlayer, 24, 8),
    FWD: candidatePool(players, 'FWD', scorePlayer, 18, 7),
  } satisfies Record<Position, ModelPlayer[]>;

  if (Object.values(pools).some((pool) => !pool.length)) return [];

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
    const bestByBucket = new Map<string, State>();
    for (const state of expanded) {
      const clubSignature = [...state.clubCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([club, count]) => `${club}:${count}`)
        .join(',');
      const key = `${state.players.length}:${Math.round(state.cost * 2)}:${clubSignature}`;
      const current = bestByBucket.get(key);
      if (!current || state.score > current.score) bestByBucket.set(key, state);
    }

    states = [...bestByBucket.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3200);

    if (!states.length) return [];
  }

  return (
    states
      .filter((state) => state.players.length === 15 && state.cost <= maximumSpend)
      .sort(
        (a, b) =>
          completedSquadScore(b.players, scorePlayer, mode) -
          completedSquadScore(a.players, scorePlayer, mode),
      )[0]?.players || []
  );
}

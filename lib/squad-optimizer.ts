import type { ModelPlayer } from '@/types/fpl';

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

export function optimizeSquadGlobally(
  players: ModelPlayer[],
  maximumSpend: number,
  scorePlayer: (player: ModelPlayer) => number,
): ModelPlayer[] {
  const pools = {
    GKP: players
      .filter((player) => player.position === 'GKP')
      .sort((a, b) => a.price - b.price)
      .slice(0, 24),
    DEF: players
      .filter((player) => player.position === 'DEF')
      .sort((a, b) => scorePlayer(b) - scorePlayer(a))
      .slice(0, 40),
    MID: players
      .filter((player) => player.position === 'MID')
      .sort((a, b) => scorePlayer(b) - scorePlayer(a))
      .slice(0, 40),
    FWD: players
      .filter((player) => player.position === 'FWD')
      .sort((a, b) => scorePlayer(b) - scorePlayer(a))
      .slice(0, 32),
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
      const selectedSignature = state.players
        .map((player) => player.id)
        .sort((a, b) => a - b)
        .join(',');
      const key = `${state.players.length}:${Math.round(state.cost * 2)}:${clubSignature}:${selectedSignature}`;
      const current = bestByBucket.get(key);
      if (!current || state.score > current.score) bestByBucket.set(key, state);
    }

    states = [...bestByBucket.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5000);

    if (!states.length) return [];
  }

  return (
    states
      .filter((state) => state.players.length === 15 && state.cost <= maximumSpend)
      .sort((a, b) => b.score - a.score)[0]?.players || []
  );
}

import type { ModelPlayer } from '@/types/fpl';

/**
 * Build a fully-typed ModelPlayer with sensible defaults so individual tests
 * only need to override the handful of fields they care about.
 */
export function makePlayer(overrides: Partial<ModelPlayer> = {}): ModelPlayer {
  const base: ModelPlayer = {
    id: 1,
    name: 'Test Player',
    team: 'AAA',
    teamId: 1,
    position: 'MID',
    positionId: 3,
    price: 5,
    sellingPrice: undefined,
    totalPoints: 50,
    form: 4,
    minutes: 900,
    starts: 10,
    ownership: 10,
    expectedGoals: 2,
    expectedAssists: 2,
    expectedGoalInvolvements: 4,
    expectedGoalsConceded: 10,
    goalsScored: 3,
    assists: 2,
    cleanSheets: 3,
    goalsConceded: 10,
    defensiveContribution: 100,
    defensiveContributionPer90: 10,
    clearancesBlocksInterceptions: 20,
    recoveries: 40,
    tackles: 20,
    saves: 0,
    penaltiesSaved: 0,
    bonus: 5,
    teamDefensiveStrength: 3,
    teamOverallStrength: 3,
    setPieceRoles: { corners: null, directFreeKicks: null, penalties: null },
    influence: 300,
    creativity: 300,
    threat: 300,
    ictIndex: 90,
    expectedPoints: 4,
    rawExpectedPoints: 4,
    appearanceProbability: 0.9,
    defensiveContributionPoints: 1,
    bonusPotential: 0.5,
    projection: {
      next1: 4,
      next3: 12,
      next5: 20,
      next8: 32,
      games: 8,
      gameweeks: 8,
      byEvent: [
        { event: 1, points: 4 },
        { event: 2, points: 4 },
        { event: 3, points: 4 },
        { event: 4, points: 4 },
        { event: 5, points: 4 },
      ],
    },
    valueScore: 0.8,
    confidence: 70,
    risk: 20,
    starterConfidence: 80,
    predictedMinutes: 85,
    starterLabel: 'nailed',
    dataQuality: 'good',
    signals: [],
    news: '',
    status: 'a',
    fixtureImpact: 0,
  };
  return { ...base, ...overrides };
}

const POS: Array<{ position: ModelPlayer['position']; positionId: number; count: number }> = [
  { position: 'GKP', positionId: 1, count: 2 },
  { position: 'DEF', positionId: 2, count: 5 },
  { position: 'MID', positionId: 3, count: 5 },
  { position: 'FWD', positionId: 4, count: 3 },
];

/**
 * Build a legal 15-player squad: 2 GKP / 5 DEF / 5 MID / 3 FWD, <=3 per club,
 * total cost under £100m. Pass overrides per index via `patch`.
 */
export function makeLegalSquad(patch: (p: ModelPlayer, i: number) => ModelPlayer = (p) => p): ModelPlayer[] {
  const squad: ModelPlayer[] = [];
  let id = 1;
  let clubSeed = 0;
  for (const group of POS) {
    for (let n = 0; n < group.count; n++) {
      // Rotate club ids so no club exceeds 3 players.
      const teamId = (clubSeed % 8) + 1;
      clubSeed++;
      squad.push(
        makePlayer({
          id,
          name: `P${id}`,
          position: group.position,
          positionId: group.positionId,
          team: `T${teamId}`,
          teamId,
          price: 5,
        }),
      );
      id++;
    }
  }
  return squad.map((p, i) => patch(p, i));
}

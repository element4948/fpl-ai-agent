import { isReliableStarter } from './starter';
import type { DraftFlexibility, DraftTeam, ModelPlayer } from '@/types/fpl';

type DraftMode = DraftTeam['mode'];

export function targetBankForMode(mode: DraftMode) {
  if (mode === 'Alternative') return 1;
  if (mode === 'Differential') return 0;
  return 0.5;
}

export function targetBenchSpendForMode(mode: DraftMode) {
  if (mode === 'Safe') return 20.5;
  if (mode === 'Alternative') return 19;
  if (mode === 'Differential') return 18.5;
  return 18;
}

export function maximumDraftSpend(mode: DraftMode) {
  return Number((100 - targetBankForMode(mode)).toFixed(1));
}

export function calculateDraftFlexibility(
  squad: ModelPlayer[],
  bench: ModelPlayer[],
  allPlayers: ModelPlayer[],
  mode: DraftMode,
): DraftFlexibility {
  const totalCost = squad.reduce((sum, player) => sum + player.price, 0);
  const bank = Number(Math.max(0, 100 - totalCost).toFixed(1));
  const targetBank = targetBankForMode(mode);
  const benchCost = Number(bench.reduce((sum, player) => sum + player.price, 0).toFixed(1));
  const startingCost = Number(Math.max(0, totalCost - benchCost).toFixed(1));
  const benchBudgetTarget = targetBenchSpendForMode(mode);
  const selectedIds = new Set(squad.map((player) => player.id));
  const pricePointCount = new Set(
    squad
      .filter((player) => player.position !== 'GKP')
      .map((player) => `${player.position}:${Math.floor(player.price * 2) / 2}`),
  ).size;
  const reliableBenchPlayers = bench.filter((player) => isReliableStarter(player, 55)).length;
  const fixtureReadyPlayers = squad.filter(
    (player) => (player.fixture?.averageDifficulty ?? 5) <= 3.3,
  ).length;
  const upgradePaths = squad.filter((player) =>
    allPlayers.some(
      (candidate) =>
        !selectedIds.has(candidate.id) &&
        candidate.position === player.position &&
        candidate.price <= player.price + bank + 0.5 &&
        candidate.expectedPoints >= player.expectedPoints + 0.6 &&
        isReliableStarter(candidate, 55),
    ),
  ).length;

  const bankScore =
    targetBank === 0 ? 25 : Math.min(25, (bank / targetBank) * 25);
  const pricePointScore = Math.min(25, (pricePointCount / 10) * 25);
  const benchScore = Math.min(25, (reliableBenchPlayers / 3) * 25);
  const upgradeScore = Math.min(15, (upgradePaths / 5) * 15);
  const fixtureScore = Math.min(10, (fixtureReadyPlayers / 11) * 10);
  const benchOverspendPenalty = Math.max(0, benchCost - benchBudgetTarget) * 8;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(bankScore + pricePointScore + benchScore + upgradeScore + fixtureScore - benchOverspendPenalty),
    ),
  );
  const warnings: string[] = [];

  if (bank < targetBank) {
    warnings.push(
      `GW1 buffer £${targetBank.toFixed(1)}m зорилтоос £${(targetBank - bank).toFixed(1)}m дутуу.`,
    );
  }
  if (pricePointCount < 7) {
    warnings.push('Price-point coverage бага тул нэг transfer-ээр шилжих сонголт хязгаарлагдана.');
  }
  if (reliableBenchPlayers < 2) {
    warnings.push('Bench cover сул; injury/rotation үед forced transfer үүсэх эрсдэлтэй.');
  }
  if (upgradePaths < 3) {
    warnings.push('£0.5m доторх шууд upgrade path цөөн байна.');
  }
  if (benchCost > benchBudgetTarget) {
    warnings.push(
      `Bench-д £${benchCost.toFixed(1)}m зарцуулсан нь ${mode} target £${benchBudgetTarget.toFixed(1)}m-оос өндөр байна.`,
    );
  }

  return {
    score,
    status: score >= 70 ? 'flexible' : score >= 50 ? 'balanced' : 'rigid',
    bank,
    targetBank,
    benchCost,
    startingCost,
    benchBudgetTarget,
    pricePointCount,
    reliableBenchPlayers,
    upgradePaths,
    fixtureReadyPlayers,
    warnings,
  };
}

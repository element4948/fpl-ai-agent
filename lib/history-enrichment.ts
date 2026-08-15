import { getPlayerSummary } from '@/lib/fpl';
import { analyzePlayerHistory } from '@/lib/player-history';
import type { ModelPlayer, PlayerHistoryAnalysis } from '@/types/fpl';

const MAX_HISTORY_CANDIDATES = 40;
const BASELINE_PER_POSITION = 8;

function candidateScore(player: ModelPlayer) {
  return player.expectedPoints +
    player.projection.next5 / Math.max(1, player.projection.gameweeks) +
    player.valueScore * 0.35;
}

export type RecentHistoryScan = {
  analyses: Map<number, PlayerHistoryAnalysis>;
  checkedIds: Set<number>;
  checkedAt: string;
  requestedPlayers: number;
  successfulPlayers: number;
  ok: boolean;
};

function candidatesFor(players: ModelPlayer[], preferredIds: number[]) {
  const preferred = new Set(preferredIds);
  const preferredBalanced = ['GKP', 'DEF', 'MID', 'FWD'].flatMap((position) =>
    players
      .filter((player) => preferred.has(player.id) && player.position === position)
      .sort((a, b) => candidateScore(b) - candidateScore(a))
      .slice(0, 10),
  );
  const baseline = ['GKP', 'DEF', 'MID', 'FWD'].flatMap((position) =>
    players
      .filter((player) => player.position === position)
      .sort((a, b) => candidateScore(b) - candidateScore(a))
      .slice(0, BASELINE_PER_POSITION),
  );
  return [...preferredBalanced, ...baseline]
    .filter((player, index, list) => list.findIndex((item) => item.id === player.id) === index)
    .slice(0, MAX_HISTORY_CANDIDATES);
}

export async function getRecentHistoryEvidence(
  players: ModelPlayer[],
  preferredIds: number[] = [],
): Promise<RecentHistoryScan> {
  const candidates = candidatesFor(players, preferredIds);
  const responses = await Promise.all(candidates.map(async (player) => ({
    player,
    summary: await getPlayerSummary(player.id),
  })));
  const analyses = new Map<number, PlayerHistoryAnalysis>();
  const checkedIds = new Set<number>();
  for (const { player, summary } of responses) {
    if (!summary) continue;
    checkedIds.add(player.id);
    const analysis = analyzePlayerHistory(summary.history, 5);
    if (analysis.sampleSize) analyses.set(player.id, analysis);
  }
  const successRatio = candidates.length ? checkedIds.size / candidates.length : 1;
  return {
    analyses,
    checkedIds,
    checkedAt: new Date().toISOString(),
    requestedPlayers: candidates.length,
    successfulPlayers: checkedIds.size,
    ok: successRatio >= 0.5,
  };
}

function historyWeight(history: PlayerHistoryAnalysis) {
  if (history.sampleSize >= 5) return 0.55;
  if (history.sampleSize >= 3) return 0.4;
  if (history.sampleSize >= 2) return 0.25;
  return 0;
}

export function applyRecentHistoryEvidence(
  players: ModelPlayer[],
  scan: RecentHistoryScan,
) {
  return players.map((player) => {
    const recentHistory = scan.analyses.get(player.id);
    const historyCheckedAt = scan.checkedIds.has(player.id) ? scan.checkedAt : undefined;
    if (!recentHistory || recentHistory.sampleSize < 2) {
      return historyCheckedAt ? { ...player, historyCheckedAt } : player;
    }

    const weight = historyWeight(recentHistory);
    const trendConfidence = recentHistory.trend === 'improving' ? 4 : recentHistory.trend === 'declining' ? -7 : 0;
    const trendMinutes = recentHistory.trend === 'improving' ? 3 : recentHistory.trend === 'declining' ? -7 : 0;
    const recentConfidence = Math.max(0, Math.min(100,
      recentHistory.startRate * 0.65 +
      recentHistory.sixtyPlusRate * 0.25 +
      (recentHistory.averageMinutes / 90) * 10 +
      trendConfidence,
    ));
    const recentMinutes = Math.max(0, Math.min(90,
      recentHistory.averageMinutes * 0.78 +
      (recentHistory.sixtyPlusRate / 100) * 90 * 0.22 +
      trendMinutes,
    ));
    const starterConfidence = Math.round(
      player.starterConfidence * (1 - weight) + recentConfidence * weight,
    );
    const predictedMinutes = Math.round(
      player.predictedMinutes * (1 - weight) + recentMinutes * weight,
    );
    const previousAvailabilityCore = Math.max(
      0.03,
      player.starterConfidence / 100 * 0.72 + player.predictedMinutes / 90 * 0.28,
    );
    const statusFactor = Math.max(0.03, Math.min(1, player.appearanceProbability / previousAvailabilityCore));
    const appearanceProbability = Number(Math.max(0.03, Math.min(1,
      statusFactor * (starterConfidence / 100 * 0.72 + predictedMinutes / 90 * 0.28),
    )).toFixed(3));
    const projectionFactor = appearanceProbability / Math.max(0.03, player.appearanceProbability);
    const expectedPoints = Number((player.expectedPoints * projectionFactor).toFixed(2));
    const recentRisk = Math.min(70,
      (recentHistory.averageMinutes < 30 ? 55 : recentHistory.averageMinutes < 55 ? 35 : 0) +
      (recentHistory.trend === 'declining' ? 10 : 0),
    );
    const hasOfficialWarning = player.signals.some((signal) => signal.severity === 'high');
    const historySupportedBaseRisk = recentHistory.dataQuality === 'good' && player.status === 'a' && !hasOfficialWarning
      ? Math.min(player.risk, recentHistory.averageMinutes >= 70 ? 18 : 28)
      : player.risk;
    const risk = Math.max(historySupportedBaseRisk, recentRisk);
    const riskLevel = risk >= 60 ? 'high' as const : risk >= 30 ? 'medium' as const : 'low' as const;
    const starterLabel = starterConfidence >= 82 && predictedMinutes >= 72
      ? 'nailed' as const
      : starterConfidence >= 65 && predictedMinutes >= 60
        ? 'likely' as const
        : starterConfidence >= 42
          ? 'rotation' as const
          : 'bench' as const;

    return {
      ...player,
      recentHistory,
      historyCheckedAt,
      starterConfidence,
      predictedMinutes,
      starterLabel: player.starterLabel === 'unavailable' ? player.starterLabel : starterLabel,
      dataQuality: recentHistory.dataQuality === 'good'
        ? 'good' as const
        : player.dataQuality === 'unknown' ? 'limited' as const : player.dataQuality,
      appearanceProbability,
      expectedPoints,
      valueScore: Number((expectedPoints / Math.max(player.price, 1)).toFixed(2)),
      risk,
      riskBreakdown: player.riskBreakdown ? {
        ...player.riskBreakdown,
        minutes: recentRisk,
        total: risk,
        level: riskLevel,
      } : player.riskBreakdown,
      projection: {
        ...player.projection,
        next1: Number((player.projection.next1 * projectionFactor).toFixed(2)),
        next3: Number((player.projection.next3 * projectionFactor).toFixed(2)),
        next5: Number((player.projection.next5 * projectionFactor).toFixed(2)),
        next8: Number((player.projection.next8 * projectionFactor).toFixed(2)),
        byEvent: player.projection.byEvent.map((item) => ({
          ...item,
          points: Number((item.points * projectionFactor).toFixed(2)),
        })),
      },
      evidence: player.evidence ? {
        ...player.evidence,
        coverageScore: Math.min(100, player.evidence.coverageScore + (recentHistory.dataQuality === 'good' ? 10 : 5)),
        trustLevel: recentHistory.dataQuality === 'good' && player.evidence.coverageScore + 10 >= 78
          ? 'high' as const
          : player.evidence.coverageScore + 5 >= 52
            ? 'medium' as const
            : player.evidence.trustLevel,
        availableMetrics: [...new Set([
          ...player.evidence.availableMetrics,
          `recent ${recentHistory.sampleSize} match starts/minutes`,
          'recent 60+ minute rate',
          'recent minutes trend',
        ])],
      } : player.evidence,
    };
  });
}

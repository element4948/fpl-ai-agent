import type { Goal, ModelPlayer, RiskProfile } from '@/types/fpl';
import { chipPlanner } from './chips';
import { buildWeeklyActionPlan } from './action-plan';
import { calculateConfidence } from './confidence';
import { explainPlayer } from './explain';
import { calculateRisk } from './risk';
import { rankCaptainCandidates } from './scoring';
import { suggestSafeTransfers } from './transfers';
import { buildSeasonRoadmap } from './season-roadmap';
import { buildDraft } from './rules';

export type DecisionInput = {
  allPlayers: ModelPlayer[];
  squad?: ModelPlayer[];
  bank?: number;
  freeTransfers?: number;
  riskProfile?: RiskProfile;
  goal?: Goal;
  isPreSeason?: boolean;
  leagueGap?: number;
};

function enrichPlayer(player: ModelPlayer, riskProfile: RiskProfile): ModelPlayer {
  const riskBreakdown = calculateRisk(player);
  const explanation = explainPlayer(player, riskBreakdown);
  return {
    ...player,
    risk: riskBreakdown.total,
    confidence: calculateConfidence(player, riskProfile),
    riskBreakdown,
    reasons: explanation.positives,
    warnings: explanation.warnings,
  };
}

export function playerDecisionScore(p: ModelPlayer, riskProfile: RiskProfile = 'balanced', goal: Goal = 'both') {
  const riskWeight = riskProfile === 'safe' ? 0.04 : riskProfile === 'aggressive' ? 0.012 : 0.025;
  const ownershipWeight = goal === 'league' && riskProfile !== 'safe' ? -0.018 : goal === 'overall' ? 0.018 : 0;
  const valueWeight = riskProfile === 'safe' ? 1.15 : riskProfile === 'aggressive' ? 0.75 : 0.95;
  const gameweeks = Math.max(1, p.projection.gameweeks);
  const horizon =
    (p.projection.next3 / Math.min(3, gameweeks)) * 0.55 +
    (p.projection.next5 / Math.min(5, gameweeks)) * 0.45;
  const upside =
    p.expectedPoints * 1.4 +
    horizon * 1.35 +
    p.valueScore * valueWeight;
  const penalty = p.risk * riskWeight + p.price * 0.035 + p.ownership * ownershipWeight;
  return Number((upside - penalty).toFixed(2));
}

export function buildDecision(input: DecisionInput) {
  const riskProfile = input.riskProfile || 'balanced';
  const goal = input.goal || 'both';
  const enrichedAll = input.allPlayers.map(p => enrichPlayer(p, riskProfile));
  const enrichedMap = new Map(enrichedAll.map(p => [p.id, p]));
  const enrichedSquad = input.squad?.map(p => enrichedMap.get(p.id) || enrichPlayer(p, riskProfile));
  const pool = enrichedSquad?.length ? enrichedSquad : enrichedAll;

  const candidates = [...pool]
    .filter(p => p.position !== 'GKP')
    .map(p => ({ ...p, decisionScore: playerDecisionScore(p, riskProfile, goal) }))
    .sort((a, b) => b.decisionScore - a.decisionScore);

  const captainShortlist = rankCaptainCandidates(pool, 8);
  const captainBase = captainShortlist[0] || candidates[0] || null;
  const captain = captainBase ? enrichedMap.get(captainBase.id) || captainBase : null;
  const viceCaptainBase = captainShortlist.find(p => p.id !== captain?.id) || candidates.find(p => p.id !== captain?.id) || null;
  const viceCaptain = viceCaptainBase ? enrichedMap.get(viceCaptainBase.id) || viceCaptainBase : null;
  const transfers = enrichedSquad?.length
    ? suggestSafeTransfers(enrichedSquad, enrichedAll, input.bank || 0, input.freeTransfers ?? 1)
    : [];
  const transfer = transfers[0] || null;
  const strategy = chooseStrategy(riskProfile, goal, input.leagueGap || 0, !!input.isPreSeason);
  const action = input.isPreSeason ? 'buildDraft' : transfer ? 'makeTransfer' : 'holdTransfer';
  const actionPlan = buildWeeklyActionPlan({
    isPreSeason: !!input.isPreSeason,
    captain,
    viceCaptain,
    transfer,
    freeTransfers: input.freeTransfers ?? 1,
  });
  const roadmapSquad = enrichedSquad?.length
    ? enrichedSquad
    : buildDraft(
        enrichedAll.filter((player) => isDecisionRoadmapCandidate(player)),
        'Best',
      ).players;
  const roadmap = buildSeasonRoadmap(roadmapSquad, enrichedAll);
  const chips = chipPlanner({
    hasEntry: !!enrichedSquad?.length,
    isPreSeason: !!input.isPreSeason,
    gap: input.leagueGap || 0,
    roadmap,
  });

  return {
    strategy,
    action,
    riskProfile,
    goal,
    captain,
    viceCaptain,
    actionPlan,
    captainShortlist: captainShortlist.map(p => enrichedMap.get(p.id) || p),
    transfer,
    transferSuggestions: transfers,
    chips,
    roadmap,
    topDecisionPlayers: candidates.slice(0, 12),
    summary: buildSummary(action, !!transfer, !!input.isPreSeason),
  };
}

function isDecisionRoadmapCandidate(player: ModelPlayer) {
  return (
    player.starterConfidence >= 68 &&
    player.predictedMinutes >= 60 &&
    player.risk <= 45
  );
}

function chooseStrategy(riskProfile: RiskProfile, goal: Goal, gap: number, preSeason: boolean) {
  if (preSeason) return 'preSeasonBuild';
  if (riskProfile === 'aggressive' || gap > 80) return 'aggressiveChase';
  if (goal === 'league' && gap > 35) return 'balancedChase';
  if (riskProfile === 'safe') return 'protectRank';
  return 'balancedControl';
}

function buildSummary(action: string, hasTransfer: boolean, preSeason: boolean) {
  if (preSeason) return 'Pre-season: build the first squad from value, minutes, confidence and risk. Do not plan chips yet.';
  if (action === 'makeTransfer' && hasTransfer) return 'This week: one no-hit transfer is available from the model. Review the reason and confirm before deadline.';
  return 'This week: no safe no-hit transfer beats the current squad. Prioritize captain choice and hold transfer if possible.';
}

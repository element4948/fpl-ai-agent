import type { Goal, ModelPlayer, RiskProfile } from '@/types/fpl';
import { chipPlanner } from './chips';
import { buildWeeklyActionPlan } from './action-plan';
import { calculateConfidence } from './confidence';
import { explainPlayer } from './explain';
import { calculateRisk } from './risk';
import { rankCaptainCandidates } from './scoring';
import { suggestSafeTransfers } from './transfers';

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
  const riskWeight = riskProfile === 'safe' ? 0.13 : riskProfile === 'aggressive' ? 0.05 : 0.085;
  const ownershipWeight = goal === 'league' && riskProfile !== 'safe' ? -0.018 : goal === 'overall' ? 0.018 : 0;
  const valueWeight = riskProfile === 'safe' ? 1.15 : riskProfile === 'aggressive' ? 0.75 : 0.95;
  const fixtureWeight = inputFixtureWeight(riskProfile);
  const upside =
    p.expectedPoints * 2.35 +
    p.form * 0.7 +
    p.confidence * 0.06 +
    p.valueScore * valueWeight +
    p.starterConfidence * 0.08 +
    p.predictedMinutes * 0.05 +
    (p.fixtureScore || 3) * fixtureWeight;
  const penalty = p.risk * riskWeight + p.price * 0.035 + p.ownership * ownershipWeight;
  return Number((upside - penalty).toFixed(2));
}

function inputFixtureWeight(riskProfile: RiskProfile) {
  return riskProfile === 'safe' ? 0.8 : riskProfile === 'aggressive' ? 1.05 : 0.92;
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
  const chips = chipPlanner({ hasEntry: !!enrichedSquad?.length, isPreSeason: !!input.isPreSeason, gap: input.leagueGap || 0 });

  const strategy = chooseStrategy(riskProfile, goal, input.leagueGap || 0, !!input.isPreSeason);
  const action = input.isPreSeason ? 'buildDraft' : transfer ? 'makeTransfer' : 'holdTransfer';
  const actionPlan = buildWeeklyActionPlan({
    isPreSeason: !!input.isPreSeason,
    captain,
    viceCaptain,
    transfer,
    freeTransfers: input.freeTransfers ?? 1,
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
    topDecisionPlayers: candidates.slice(0, 12),
    summary: buildSummary(action, !!transfer, !!input.isPreSeason),
  };
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

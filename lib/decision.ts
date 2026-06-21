import type { Goal, ModelPlayer, RiskProfile } from '@/types/fpl';
import { chipPlanner } from './chips';
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

export function playerDecisionScore(p: ModelPlayer, riskProfile: RiskProfile = 'balanced', goal: Goal = 'both') {
  const riskWeight = riskProfile === 'safe' ? 0.11 : riskProfile === 'aggressive' ? 0.045 : 0.075;
  const ownershipWeight = goal === 'league' && riskProfile !== 'safe' ? -0.018 : goal === 'overall' ? 0.018 : 0;
  const valueWeight = riskProfile === 'safe' ? 1.15 : riskProfile === 'aggressive' ? 0.75 : 0.95;
  const upside = p.expectedPoints * 2.25 + p.form * 0.65 + p.confidence * 0.055 + p.valueScore * valueWeight + p.minutes / 1150;
  const penalty = p.risk * riskWeight + p.price * 0.035 + p.ownership * ownershipWeight;
  return Number((upside - penalty).toFixed(2));
}

export function buildDecision(input: DecisionInput) {
  const riskProfile = input.riskProfile || 'balanced';
  const goal = input.goal || 'both';
  const pool = input.squad?.length ? input.squad : input.allPlayers;
  const candidates = [...pool]
    .filter(p => p.position !== 'GKP')
    .map(p => ({ ...p, decisionScore: playerDecisionScore(p, riskProfile, goal) }))
    .sort((a: any, b: any) => b.decisionScore - a.decisionScore);

  const captainShortlist = rankCaptainCandidates(pool, 8);
  const captain = captainShortlist[0] || candidates[0] || null;
  const transfers = input.squad?.length
    ? suggestSafeTransfers(input.squad, input.allPlayers, input.bank || 0, input.freeTransfers ?? 1)
    : [];
  const transfer = transfers[0] || null;
  const chips = chipPlanner({ hasEntry: !!input.squad?.length, isPreSeason: !!input.isPreSeason, gap: input.leagueGap || 0 });

  const strategy = chooseStrategy(riskProfile, goal, input.leagueGap || 0, !!input.isPreSeason);
  const action = input.isPreSeason
    ? 'buildDraft'
    : transfer
      ? 'makeTransfer'
      : 'holdTransfer';

  return {
    strategy,
    action,
    riskProfile,
    goal,
    captain,
    captainShortlist,
    transfer,
    transferSuggestions: transfers,
    chips,
    topDecisionPlayers: candidates.slice(0, 12),
    summary: buildSummary(action, strategy, !!transfer, !!input.isPreSeason),
  };
}

function chooseStrategy(riskProfile: RiskProfile, goal: Goal, gap: number, preSeason: boolean) {
  if (preSeason) return 'preSeasonBuild';
  if (riskProfile === 'aggressive' || gap > 80) return 'aggressiveChase';
  if (goal === 'league' && gap > 35) return 'balancedChase';
  if (riskProfile === 'safe') return 'protectRank';
  return 'balancedControl';
}

function buildSummary(action: string, strategy: string, hasTransfer: boolean, preSeason: boolean) {
  if (preSeason) return 'Pre-season: build the first squad from value, minutes, confidence and risk. Do not plan chips yet.';
  if (action === 'makeTransfer' && hasTransfer) return 'This week: one no-hit transfer is available from the model. Review the reason and confirm before deadline.';
  return 'This week: no safe no-hit transfer beats the current squad. Prioritize captain choice and hold transfer if possible.';
}

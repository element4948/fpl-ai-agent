export type RiskProfile = 'safe' | 'balanced' | 'aggressive';
export type Goal = 'overall' | 'league' | 'both';

export type UserSettings = {
  entryId?: string;
  leagueId?: string;
  riskProfile: RiskProfile;
  goal: Goal;
  lang: 'mn' | 'en';
  plannedSquadIds?: number[];
  freeTransfers?: number;
};

export type FplPlayer = {
  id: number;
  web_name: string;
  first_name?: string;
  second_name?: string;
  team: number;
  element_type: number;
  now_cost: number;
  cost_change_event?: number;
  total_points: number;
  event_points?: number;
  selected_by_percent: string;
  minutes: number;
  starts?: number;
  form: string;
  points_per_game: string;
  ep_next?: string;
  ep_this?: string;
  chance_of_playing_next_round?: number | null;
  chance_of_playing_this_round?: number | null;
  news?: string;
  news_added?: string;
  status?: string;
  transfers_in_event?: number;
  transfers_out_event?: number;
  goals_scored?: number;
  assists?: number;
  clean_sheets?: number;
  goals_conceded?: number;
  bonus?: number;
  ict_index?: string;
  expected_goals?: string;
  expected_assists?: string;
  expected_goal_involvements?: string;
  expected_goals_conceded?: string;
  influence?: string;
  creativity?: string;
  threat?: string;
  saves?: number;
  penalties_saved?: number;
  defensive_contribution?: number;
  defensive_contribution_per_90?: string;
  clearances_blocks_interceptions?: number;
  recoveries?: number;
  tackles?: number;
  corners_and_indirect_freekicks_order?: number | null;
  direct_freekicks_order?: number | null;
  penalties_order?: number | null;
};

export type FplTeam = {
  id: number;
  name: string;
  short_name: string;
  strength?: number;
  strength_overall_home?: number;
  strength_overall_away?: number;
  strength_defence_home?: number;
  strength_defence_away?: number;
};

export type FplPosition = {
  id: number;
  singular_name_short: string;
  singular_name: string;
};

export type FplEvent = {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
};

export type FplFixture = {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  finished: boolean;
  started: boolean;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
};

export type FplPlayerHistoryItem = {
  element: number;
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  kickoff_time: string;
  round: number;
  minutes: number;
  starts?: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  expected_goals?: string;
  expected_assists?: string;
  expected_goal_involvements?: string;
  expected_goals_conceded?: string;
};

export type FplPlayerSummary = {
  fixtures: FplFixture[];
  history: FplPlayerHistoryItem[];
  history_past: Array<{
    season_name: string;
    minutes: number;
    starts?: number;
    total_points: number;
  }>;
};

export type PlayerHistoryAnalysis = {
  sampleSize: number;
  starts: number;
  startRate: number;
  averageMinutes: number;
  sixtyPlusRate: number;
  averagePoints: number;
  recentMinutes: number[];
  recentPoints: number[];
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
  dataQuality: 'good' | 'limited' | 'unknown';
};

export type PlayerSignal = {
  type: 'injury' | 'availability' | 'news' | 'transfer';
  severity: 'low' | 'medium' | 'high';
  message: string;
  source: 'Official FPL';
};

export type PlayerEvidence = {
  coverageScore: number;
  trustLevel: 'high' | 'medium' | 'low';
  availableMetrics: string[];
  missingMetrics: string[];
  sources: Array<{
    id: 'official-fpl' | 'official-fpl-history' | 'official-fpl-fixtures' | 'api-football';
    label: string;
    status: 'available' | 'limited' | 'missing';
  }>;
};

export type PlayerRoleAssessment = {
  role: 'first-choice' | 'competition' | 'backup' | 'unknown';
  confidence: number;
  note: string;
  sourceLabel: string;
  sourceUrl: string;
  checkedAt: string;
  expiresAt?: string;
  corroboratingSources?: Array<{
    label: string;
    url: string;
    tier: 'official' | 'reliable-reporter' | 'secondary';
  }>;
};

export type ExternalNewsSignal = {
  headline: string;
  url: string;
  publishedAt: string;
  source: string;
  tier: 'official' | 'reliable' | 'secondary';
  category:
    | 'injury'
    | 'transfer'
    | 'rotation'
    | 'availability'
    | 'international'
    | 'friendly'
    | 'fatigue';
  severity: 'low' | 'medium' | 'high';
  verification: 'confirmed' | 'corroborated' | 'single-source' | 'unverified';
  corroboratingSourceCount: number;
};

export type ForecastPlayer = {
  id: number;
  name: string;
  predicted: number;
};

export type ForecastSnapshot = {
  eventId: number;
  deadline: string;
  createdAt: string;
  players: ForecastPlayer[];
};

export type CalibrationActual = {
  id: number;
  name: string;
  points: number;
};

export type CalibrationResult = {
  eventId: number;
  sampleSize: number;
  mae: number;
  bias: number;
  withinTwo: number;
  evaluatedAt: string;
};

export type ModelReadiness = {
  rules: number;
  squadOptimization: number;
  officialData: number;
  positionModels: number;
  starterMinutes: number;
  injuryAvailability: number;
  transferNews: number;
  friendlyInternational: number;
  multiSourceVerification: number;
  calibration: number;
  multiGameweekPlanning: number;
};

export type RoadmapWeek = {
  eventId: number;
  projectedPoints: number;
  benchProjectedPoints: number;
  formation: Formation;
  captain: { id: number; name: string; projectedPoints: number } | null;
  captainAlternatives: Array<{
    id: number;
    name: string;
    projectedPoints: number;
    gap: number;
  }>;
  transferWatch: Array<{ id: number; name: string; team: string; projectedPoints: number }>;
  doublePlayers: number;
  blankPlayers: number;
  action: 'hold' | 'monitor-transfer' | 'consider-chip';
  note: string;
};

export type SeasonRoadmap = {
  generatedAt: string;
  horizon: number;
  weeks: RoadmapWeek[];
  limitations: string[];
};

export type DraftTrust = {
  score: number;
  status: 'verified' | 'provisional' | 'insufficient';
  sourceCount: number;
  goodDataPlayers: number;
  limitedDataPlayers: number;
  unknownDataPlayers: number;
  newsCheckedPlayers: number;
  blockers: string[];
  warnings: string[];
};

export type DraftFlexibility = {
  score: number;
  status: 'flexible' | 'balanced' | 'rigid';
  bank: number;
  targetBank: number;
  benchCost: number;
  startingCost: number;
  benchBudgetTarget: number;
  pricePointCount: number;
  reliableBenchPlayers: number;
  emergencyBenchPlayers: number;
  upgradePaths: number;
  fixtureReadyPlayers: number;
  warnings: string[];
};

export type FixtureSummary = {
  nextOpponent: string;
  nextOpponentId: number | null;
  nextDifficulty: number;
  nextIsHome: boolean | null;
  averageDifficulty: number;
  fixtureScore: number;
  trend: 'improving' | 'stable' | 'hardening' | 'unknown';
  rating: 'excellent' | 'good' | 'average' | 'hard' | 'very-hard';
  homeCount: number;
  fixtures: Array<{
    opponent: number;
    opponentName: string;
    difficulty: number;
    isHome: boolean;
    event: number | null;
  }>;
};

export type StarterLabel = 'nailed' | 'likely' | 'rotation' | 'bench' | 'unavailable' | 'unknown';

export type ModelPlayer = {
  id: number;
  name: string;
  team: string;
  teamId: number;
  position: string;
  positionId: number;
  price: number;
  // Estimated FPL selling price for owned players (purchase price + half of any
  // rise). The public API does not expose per-player selling price, so this is
  // approximated from entry_history.value; falls back to `price` when unknown.
  sellingPrice?: number;
  totalPoints: number;
  form: number;
  minutes: number;
  starts: number;
  ownership: number;
  expectedGoals: number;
  expectedAssists: number;
  expectedGoalInvolvements: number;
  expectedGoalsConceded: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  defensiveContribution: number;
  defensiveContributionPer90: number;
  clearancesBlocksInterceptions: number;
  recoveries: number;
  tackles: number;
  saves: number;
  penaltiesSaved: number;
  bonus: number;
  teamDefensiveStrength: number;
  teamOverallStrength: number;
  setPieceRoles: {
    corners: number | null;
    directFreeKicks: number | null;
    penalties: number | null;
  };
  influence: number;
  creativity: number;
  threat: number;
  ictIndex: number;
  expectedPoints: number;
  rawExpectedPoints: number;
  appearanceProbability: number;
  defensiveContributionPoints: number;
  bonusPotential: number;
  projection: {
    next1: number;
    next3: number;
    next5: number;
    next8: number;
    games: number;
    gameweeks: number;
    byEvent: Array<{ event: number; points: number }>;
  };
  valueScore: number;
  confidence: number;
  risk: number;
  starterConfidence: number;
  predictedMinutes: number;
  starterLabel: StarterLabel;
  dataQuality: 'good' | 'limited' | 'unknown';
  signals: PlayerSignal[];
  evidence?: PlayerEvidence;
  roleAssessment?: PlayerRoleAssessment;
  externalNews?: ExternalNewsSignal[];
  newsCheckedAt?: string;
  apiFootball?: {
    matches: number;
    starts: number;
    minutes: number;
    rating: number;
    shots: number;
    keyPasses: number;
    tackles: number;
    saves: number;
    checkedAt: string;
    season: number;
    currentSeason: boolean;
    currentTeamMatched: boolean;
  };
  news?: string;
  status?: string;
  riskBreakdown?: {
    injury: number;
    availability: number;
    minutes: number;
    rotation: number;
    news: number;
    total: number;
    level: 'low' | 'medium' | 'high';
  };
  reasons?: string[];
  warnings?: string[];
  fixture?: FixtureSummary;
  fixtureScore?: number;
  fixtureImpact: number;
};

export type Formation =
  | '3-4-3'
  | '3-5-2'
  | '4-3-3'
  | '4-4-2'
  | '4-5-1'
  | '5-2-3'
  | '5-3-2'
  | '5-4-1';

export type DraftTeam = {
  mode: 'Best' | 'Alternative' | 'Differential' | 'Safe';
  players: ModelPlayer[];
  startingXI: ModelPlayer[];
  bench: ModelPlayer[];
  formation: Formation;
  formationAlternatives: Array<{ formation: Formation; projectedScore: number; gap: number }>;
  validation: SquadValidation;
  trust: DraftTrust;
  flexibility: DraftFlexibility;
  selectionAudit: Record<number, {
    rank: number;
    totalCandidates: number;
    eligibleRank: number;
    eligibleCandidates: number;
    higherRankedRejected: number;
    passedMetrics: number;
    totalMetrics: number;
  }>;
  explanation: string[];
};

export type SquadValidation = {
  valid: boolean;
  totalCost: number;
  errors: string[];
  positionCounts: Record<string, number>;
  clubCounts: Record<string, number>;
};

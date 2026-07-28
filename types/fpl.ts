export type RiskProfile = 'safe' | 'balanced' | 'aggressive';
export type Goal = 'overall' | 'league' | 'both';

export type UserSettings = {
    entryId?: string;
    leagueId?: string;
    riskProfile: RiskProfile;
    goal: Goal;
    lang: 'mn' | 'en';
};

export type FplPlayer = {
    id: number;
    web_name: string;
    first_name?: string;
    second_name?: string;
    team: number;
    element_type: number;
    now_cost: number;
    total_points: number;
    selected_by_percent: string;
    minutes: number;
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
};

export type FplTeam = {
    id: number;
    name: string;
    short_name: string;
    strength?: number;
    strength_overall_home?: number;
    strength_overall_away?: number;
};
export type FplPosition = { id: number; singular_name_short: string; singular_name: string };
export type FplEvent = { id: number; name: string; deadline_time: string; finished: boolean; is_current: boolean; is_next: boolean };

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

export type FixtureSummary = {
    nextOpponent: string;
    nextOpponentId: number | null;
    nextDifficulty: number;
    nextIsHome: boolean | null;
    averageDifficulty: number;
    fixtureScore: number;
    fixtures: Array<{ opponent: number; opponentName: string; difficulty: number; isHome: boolean; event: number | null }>;
};

export type ModelPlayer = {
    id: number;
    name: string;
    team: string;
    teamId: number;
    position: string;
    positionId: number;
    price: number;
    totalPoints: number;
    form: number;
    minutes: number;
    ownership: number;
    expectedPoints: number;
    valueScore: number;
    confidence: number;
    risk: number;
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
};

export type Formation = '3-4-3' | '3-5-2' | '4-3-3' | '4-4-2' | '4-5-1' | '5-2-3' | '5-3-2' | '5-4-1';

export type DraftTeam = {
    mode: 'Best' | 'Alternative' | 'Differential' | 'Safe';
    players: ModelPlayer[];

    startingXI: ModelPlayer[];
    bench: ModelPlayer[];
    formation: Formation;

    validation: SquadValidation;
    explanation: string[];
};

export type SquadValidation = {
    valid: boolean;
    totalCost: number;
    errors: string[];
    positionCounts: Record<string, number>;
    clubCounts: Record<string, number>;
};

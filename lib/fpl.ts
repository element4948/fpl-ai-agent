import { buildFixtureMap } from './fixtures';
import { buildOfficialSignals } from './signals';
import { projectStarter } from './starter';
import { applyVerifiedRoleSignal } from './role-signals';
import { buildPlayerEvidence } from './evidence';

import type { FplEvent, FplFixture, FplPlayer, FplPlayerSummary, FplPosition, FplTeam, ModelPlayer } from '@/types/fpl';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

async function safeFetch<T>(url: string): Promise<T | null> {
    try {
        const response = await fetch(url, {
            headers: {
                // FPL's API returns 403 for datacenter IPs / requests without a
                // browser-like User-Agent (common on serverless hosts). Send one
                // so production deployments can reach the API.
                'User-Agent':
                    'Mozilla/5.0 (compatible; fpl-ai-agent/1.0; +https://github.com/element4948/fpl-ai-agent)',
                Accept: 'application/json',
            },
            next: {
                revalidate: 900,
            },
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as T;
    } catch {
        return null;
    }
}

export async function getBootstrap() {
    return safeFetch<{
        elements: FplPlayer[];
        teams: FplTeam[];
        element_types: FplPosition[];
        events: FplEvent[];
    }>(`${FPL_BASE}/bootstrap-static/`);
}

export async function getFixtures() {
    return safeFetch<FplFixture[]>(`${FPL_BASE}/fixtures/`);
}

export async function getPlayerSummary(playerId: number) {
    return safeFetch<FplPlayerSummary>(`${FPL_BASE}/element-summary/${playerId}/`);
}

export type FplEntryResponse = {
    id: number;
    player_first_name: string;
    player_last_name: string;
    name: string;
    summary_overall_points: number;
    summary_overall_rank: number | null;
    summary_event_points: number;
    summary_event_rank: number | null;
    current_event: number;
    started_event: number;
};

export async function getEntry(entryId: string): Promise<FplEntryResponse | null> {
    return safeFetch<FplEntryResponse>(`${FPL_BASE}/entry/${entryId}/`);
}

export type FplEntryPick = {
    element: number;
    position: number;
    multiplier: number;
    is_captain: boolean;
    is_vice_captain: boolean;
};

export type FplEntryPicksResponse = {
    active_chip: string | null;
    automatic_subs: unknown[];
    entry_history: {
        event: number;
        points: number;
        total_points: number;
        rank: number;
        rank_sort: number;
        overall_rank: number;
        percentile_rank: number;
        bank: number;
        value: number;
        event_transfers: number;
        event_transfers_cost: number;
        points_on_bench: number;
    };
    picks: FplEntryPick[];
};

export async function getEntryPicks(entryId: string, eventId: number): Promise<FplEntryPicksResponse | null> {
    return safeFetch<FplEntryPicksResponse>(`${FPL_BASE}/entry/${entryId}/event/${eventId}/picks/`);
}

export async function getLeague(leagueId: string, page = 1): Promise<FplLeagueResponse | null> {
    return safeFetch<FplLeagueResponse>(`${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}`);
}

export function nextEvent(events?: FplEvent[]) {
    if (!events?.length) {
        return null;
    }

    return events.find((event) => event.is_next) || events.find((event) => !event.finished) || null;
}

export function currentEvent(events?: FplEvent[]) {
    if (!events?.length) {
        return null;
    }

    return events.find((event) => event.is_current) || events.filter((event) => event.finished).at(-1) || events[0];
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Official FPL `strength_overall_*` / `strength_defence_*` fields are on a
 * ~1000-1400 scale, while `team.strength` is 1-5. The projection formulas were
 * written for a 1-5 input, so a raw 1000-scale value made every defender/keeper
 * term explode (and pinned the clamped mid/forward terms at their maximum).
 * Normalise both scales into a 1-5 range before use.
 */
export function normalizeTeamStrength(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    // Large scale (e.g. 1000-1400) -> map ~1000..1400 onto 1..5.
    if (value > 50) return clamp(1 + (value - 1000) / 100, 1, 5);
    // Already on the 1-5 scale.
    if (value >= 1 && value <= 5) return value;
    return fallback;
}

function getFixtureProjection(fixtureScore: number, nextDifficulty: number, averageDifficulty: number, isHome: boolean | null): number {
    const nextFixtureScore = 6 - nextDifficulty;
    const fixtureRunScore = 6 - averageDifficulty;
    const homeBonus = isHome ? 0.25 : 0;

    return fixtureScore * 0.55 + nextFixtureScore * 0.4 + fixtureRunScore * 0.3 + homeBonus;
}

export function toModelPlayers(
    players: FplPlayer[] = [],
    teams: FplTeam[] = [],
    positions: FplPosition[] = [],
    fixtures: FplFixture[] = [],
    eventId?: number | null,
    completedGameweeks = 0,
): ModelPlayer[] {
    const teamMap = new Map(teams.map((team) => [team.id, team]));

    const positionMap = new Map(positions.map((position) => [position.id, position]));

    const fixtureMap = buildFixtureMap(fixtures, teams, eventId, 8);

    return players.map((player) => {
        const form = Number(player.form || 0);
        // points_per_game is historical performance, not an official fixture-adjusted
        // forecast. Treating it as ep_next suppressed the fixture model in pre-season.
        const expectedApiPoints = Number(player.ep_next || player.ep_this || 0);

        const pointsPerGame = Number(player.points_per_game || 0);

        const ownership = Number(player.selected_by_percent || 0);
        const expectedGoals = Number(player.expected_goals || 0);
        const expectedAssists = Number(player.expected_assists || 0);
        const expectedGoalInvolvements = Number(
            player.expected_goal_involvements || expectedGoals + expectedAssists,
        );
        const expectedGoalsConceded = Number(player.expected_goals_conceded || 0);
        const goalsScored = Number(player.goals_scored || 0);
        const assists = Number(player.assists || 0);
        const cleanSheets = Number(player.clean_sheets || 0);
        const goalsConceded = Number(player.goals_conceded || 0);
        const defensiveContribution = Number(player.defensive_contribution || 0);
        const defensiveContributionPer90 = Number(
            player.defensive_contribution_per_90 || 0,
        );
        const clearancesBlocksInterceptions = Number(
            player.clearances_blocks_interceptions || 0,
        );
        const recoveries = Number(player.recoveries || 0);
        const tackles = Number(player.tackles || 0);
        const saves = Number(player.saves || 0);
        const penaltiesSaved = Number(player.penalties_saved || 0);
        const bonus = Number(player.bonus || 0);
        const influence = Number(player.influence || 0);
        const creativity = Number(player.creativity || 0);
        const threat = Number(player.threat || 0);
        const ictIndex = Number(player.ict_index || 0);

        const minutes = player.minutes || 0;
        const starts = player.starts || 0;
        const starterResult = applyVerifiedRoleSignal(
            player,
            projectStarter(player, completedGameweeks),
        );
        const starter = starterResult.projection;
        const signals = buildOfficialSignals(player);

        const minutesScore = Math.min(1, minutes / 2500);

        const injuryRisk = player.chance_of_playing_next_round == null ? 0 : (100 - player.chance_of_playing_next_round) / 100;

        const statusRisk = player.status && player.status !== 'a' ? 0.35 : 0;

        const newsRisk = player.news ? 0.15 : 0;

        const lowMinutesRisk = minutes > 0 && minutesScore < 0.25 ? 0.15 : 0;
        const dataQualityRisk =
            starter.dataQuality === 'unknown'
                ? 0.45
                : starter.dataQuality === 'limited'
                  ? 0.18
                  : 0;
        const starterUncertaintyRisk = Math.max(
            0,
            (68 - starter.confidence) / 100,
        );

        const risk = Math.round(
            Math.min(
                100,
                (injuryRisk + statusRisk + newsRisk + lowMinutesRisk + dataQualityRisk + starterUncertaintyRisk) * 100,
            ),
        );

        const fixture = fixtureMap.get(player.team);

        const fixtureScore = fixture?.fixtureScore ?? 3;

        const nextDifficulty = fixture?.nextDifficulty ?? 3;

        const averageDifficulty = fixture?.averageDifficulty ?? 3;

        const fixtureProjection = getFixtureProjection(fixtureScore, nextDifficulty, averageDifficulty, fixture?.nextIsHome ?? null);

        const team = teamMap.get(player.team);

        const teamStrength = Number(team?.strength || 3);
        const teamDefensiveStrength =
            (normalizeTeamStrength(Number(team?.strength_defence_home), teamStrength) +
                normalizeTeamStrength(Number(team?.strength_defence_away), teamStrength)) /
            2;
        const teamOverallStrength =
            (normalizeTeamStrength(Number(team?.strength_overall_home), teamStrength) +
                normalizeTeamStrength(Number(team?.strength_overall_away), teamStrength)) /
            2;

        const hasSeasonData = minutes > 0 || player.total_points > 0 || form > 0;
        const xgiPer90 = minutes >= 90 ? (expectedGoalInvolvements / minutes) * 90 : 0;
        const underlyingContribution =
            Math.min(2.2, xgiPer90 * 1.8) +
            Math.min(0.8, ictIndex > 0 && minutes > 0 ? (ictIndex / minutes) * 5 : 0);
        const cleanSheetRate = starts > 0 ? cleanSheets / starts : 0;
        const setPieceUpside =
            (player.corners_and_indirect_freekicks_order === 1 ? 0.35 : 0) +
            (player.direct_freekicks_order === 1 ? 0.35 : 0) +
            (player.penalties_order === 1 ? 0.55 : 0);
        const defensiveThreshold = player.element_type === 2 ? 10 : 12;
        const defensiveThresholdRatio = defensiveContributionPer90 / defensiveThreshold;
        const defensiveThresholdProbability = defensiveContributionPer90 <= 0
            ? 0
            : 1 / (1 + Math.exp(-5 * (defensiveThresholdRatio - 1)));
        const defensiveContributionPoints = Number(
            (defensiveThresholdProbability * 2).toFixed(2),
        );
        const historicalBonusPerStart = starts > 0 ? bonus / starts : 0;
        const bonusPotential = Number(
            Math.min(1.5, historicalBonusPerStart * 0.65).toFixed(2),
        );
        const positionUpside =
            player.element_type === 1
                ? Math.min(1, cleanSheetRate * 1.8) +
                  Math.min(0.7, minutes >= 90 ? (saves / minutes) * 90 * 0.14 : 0) +
                  Math.min(0.5, penaltiesSaved * 0.2)
                : player.element_type === 2
                  ? Math.min(1.4, xgiPer90 * 2.2) +
                    Math.min(0.8, cleanSheetRate * 1.6) +
                    Math.max(0, (teamDefensiveStrength - 3) * 0.12) +
                    setPieceUpside
                  : player.element_type === 3
                    ? Math.min(2, xgiPer90 * 2.4) +
                      Math.min(0.7, minutes >= 90 ? (creativity / minutes) * 90 * 0.01 : 0) +
                      Math.min(0.7, minutes >= 90 ? (threat / minutes) * 90 * 0.009 : 0) +
                      setPieceUpside
                    : Math.min(2.3, xgiPer90 * 2.7) +
                      Math.min(0.9, minutes >= 90 ? (threat / minutes) * 90 * 0.011 : 0) +
                      setPieceUpside;

        const preseasonBase =
            1.35 +
            fixtureProjection * 0.72 +
            teamStrength * 0.2 +
            underlyingContribution * 0.65 +
            positionUpside * 0.5 +
            defensiveContributionPoints * 0.55 +
            bonusPotential * 0.45;

        const independentLiveBase =
            pointsPerGame * 0.34 +
            form * 0.18 +
            fixtureProjection * 0.58 +
            underlyingContribution * 0.72 +
            positionUpside * 0.42 +
            defensiveContributionPoints * 0.5 +
            bonusPotential * 0.45;
        const liveBase = expectedApiPoints > 0
            ? expectedApiPoints * 0.68 + independentLiveBase * 0.32
            : independentLiveBase;

        const confidenceBase = hasSeasonData
            ? 36 + minutesScore * 28 + Math.min(18, form * 2.5) + fixtureScore * 2
            : 46 + fixtureProjection * 6 + Math.min(12, ownership * 0.25);

        const confidence = Math.round(clamp(confidenceBase - risk * 0.32, 5, 98));

        const rawExpectedPoints = completedGameweeks > 0 && hasSeasonData
            ? liveBase
            : preseasonBase;
        const statusAvailability =
            player.chance_of_playing_next_round == null
                ? player.status === 'a' || !player.status ? 1 : 0.45
                : clamp(player.chance_of_playing_next_round / 100, 0, 1);
        const startProbability = clamp(starter.confidence / 100, 0.05, 1);
        const minutesShare = clamp(starter.predictedMinutes / 90, 0.05, 1);
        const appearanceProbability = Number(
            clamp(
                statusAvailability * (startProbability * 0.72 + minutesShare * 0.28),
                0.03,
                1,
            ).toFixed(3),
        );
        const preseasonRegression = completedGameweeks === 0 ? 0.86 : 1;
        const expectedPoints = Number(
            Math.max(
                0.1,
                rawExpectedPoints * appearanceProbability * preseasonRegression,
            ).toFixed(2),
        );
        const neutralFixtureProjection = getFixtureProjection(3, 3, 3, false);
        const fixtureModelWeight = completedGameweeks === 0
            ? 0.72
            : expectedApiPoints > 0
              ? 0.58 * 0.32
              : 0.58;
        const fixtureImpact = Number(
            ((fixtureProjection - neutralFixtureProjection) * fixtureModelWeight * appearanceProbability * preseasonRegression).toFixed(2),
        );
        const projectedFixtures = fixture?.fixtures.slice(0, 8) || [];
        const projectionValues = projectedFixtures.map((item, index) => {
            const difficultyAdjustment =
                (nextDifficulty - item.difficulty) *
                (player.element_type <= 2 ? 0.5 : 0.58);
            const venueAdjustment =
                item.isHome === fixture?.nextIsHome
                    ? 0
                    : item.isHome
                      ? 0.18
                      : -0.18;
            return {
                event: item.event ?? (eventId || 0) + index,
                points: Math.max(
                    0.5,
                    Number((expectedPoints + difficultyAdjustment + venueAdjustment).toFixed(2)),
                ),
            };
        });
        if (!projectionValues.length) {
            projectionValues.push({
                event: eventId || 0,
                points: expectedPoints,
            });
        }
        const gameweekTotals = [...projectionValues.reduce((map, item) => {
            map.set(item.event, (map.get(item.event) || 0) + item.points);
            return map;
        }, new Map<number, number>()).entries()]
            .sort(([eventA], [eventB]) => eventA - eventB)
            .map(([, points]) => points);
        const projectionTotal = (limit: number) =>
            Number(
                gameweekTotals
                    .slice(0, limit)
                    .reduce((sum, value) => sum + value, 0)
                    .toFixed(2),
            );

        const price = Number((player.now_cost / 10).toFixed(1));

        const modelPlayer: ModelPlayer = {
            id: player.id,
            name: player.web_name,
            team: team?.short_name || String(player.team),
            teamId: player.team,
            position: positionMap.get(player.element_type)?.singular_name_short || String(player.element_type),
            positionId: player.element_type,
            price,
            totalPoints: player.total_points,
            form,
            minutes,
            starts,
            ownership,
            expectedGoals,
            expectedAssists,
            expectedGoalInvolvements,
            expectedGoalsConceded,
            goalsScored,
            assists,
            cleanSheets,
            goalsConceded,
            defensiveContribution,
            defensiveContributionPer90,
            clearancesBlocksInterceptions,
            recoveries,
            tackles,
            saves,
            penaltiesSaved,
            bonus,
            teamDefensiveStrength,
            teamOverallStrength,
            setPieceRoles: {
                corners: player.corners_and_indirect_freekicks_order ?? null,
                directFreeKicks: player.direct_freekicks_order ?? null,
                penalties: player.penalties_order ?? null,
            },
            influence,
            creativity,
            threat,
            ictIndex,
            expectedPoints,
            rawExpectedPoints: Number(rawExpectedPoints.toFixed(2)),
            appearanceProbability,
            defensiveContributionPoints,
            bonusPotential,
            projection: {
                next1: projectionTotal(1),
                next3: projectionTotal(3),
                next5: projectionTotal(5),
                next8: projectionTotal(8),
                games: projectionValues.length,
                gameweeks: gameweekTotals.length,
                byEvent: projectionValues,
            },
            valueScore: Number((expectedPoints / Math.max(price, 1)).toFixed(2)),
            confidence,
            risk,
            starterConfidence: starter.confidence,
            predictedMinutes: starter.predictedMinutes,
            starterLabel: starter.label,
            dataQuality: starter.dataQuality,
            signals,
            news: player.news || '',
            status: player.status || 'a',
            fixture,
            fixtureScore,
            fixtureImpact,
        };
        modelPlayer.roleAssessment = starterResult.assessment;
        modelPlayer.evidence = buildPlayerEvidence(modelPlayer);
        return modelPlayer;
    });
}

export type FplLeagueStanding = {
    id: number;
    event_total: number;
    player_name: string;
    rank: number;
    last_rank: number;
    rank_sort: number;
    total: number;
    entry: number;
    entry_name: string;
};

export type FplLeagueResponse = {
    league: {
        id: number;
        name: string;
        created: string;
        closed: boolean;
        max_entries: number | null;
        league_type: string;
        scoring: string;
        admin_entry: number | null;
        start_event: number;
        code_privacy: string;
        has_cup: boolean;
        cup_league: number | null;
        rank: number | null;
    };
    standings: {
        has_next: boolean;
        page: number;
        results: FplLeagueStanding[];
    };
};

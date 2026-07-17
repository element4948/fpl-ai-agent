import { buildFixtureMap } from './fixtures';

import type { FplEvent, FplFixture, FplPlayer, FplPosition, FplTeam, ModelPlayer } from '@/types/fpl';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

async function safeFetch<T>(url: string): Promise<T | null> {
    try {
        const response = await fetch(url, {
            next: {
                revalidate: 900,
            },
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
): ModelPlayer[] {
    const teamMap = new Map(teams.map((team) => [team.id, team]));

    const positionMap = new Map(positions.map((position) => [position.id, position]));

    const fixtureMap = buildFixtureMap(fixtures, teams, eventId, 5);

    return players.map((player) => {
        const form = Number(player.form || 0);
        const expectedApiPoints = Number(player.ep_next || player.ep_this || player.points_per_game || 0);

        const pointsPerGame = Number(player.points_per_game || 0);

        const ownership = Number(player.selected_by_percent || 0);

        const minutes = player.minutes || 0;

        const minutesScore = Math.min(1, minutes / 2500);

        const injuryRisk = player.chance_of_playing_next_round == null ? 0 : (100 - player.chance_of_playing_next_round) / 100;

        const statusRisk = player.status && player.status !== 'a' ? 0.35 : 0;

        const newsRisk = player.news ? 0.15 : 0;

        const lowMinutesRisk = minutes > 0 && minutesScore < 0.25 ? 0.15 : 0;

        const risk = Math.round(Math.min(100, (injuryRisk + statusRisk + newsRisk + lowMinutesRisk) * 100));

        const fixture = fixtureMap.get(player.team);

        const fixtureScore = fixture?.fixtureScore ?? 3;

        const nextDifficulty = fixture?.nextDifficulty ?? 3;

        const averageDifficulty = fixture?.averageDifficulty ?? 3;

        const fixtureProjection = getFixtureProjection(fixtureScore, nextDifficulty, averageDifficulty, fixture?.nextIsHome ?? null);

        const team = teamMap.get(player.team);

        const teamStrength = Number(team?.strength || 3);

        const hasSeasonData = minutes > 0 || player.total_points > 0 || form > 0;

        const preseasonBase = fixtureProjection * 0.9 + teamStrength * 0.25 + Math.min(ownership, 35) * 0.018;

        const liveBase = expectedApiPoints * 0.34 + pointsPerGame * 0.22 + form * 0.15 + fixtureProjection * 0.72;

        const confidenceBase = hasSeasonData
            ? 36 + minutesScore * 28 + Math.min(18, form * 2.5) + fixtureScore * 2
            : 46 + fixtureProjection * 6 + Math.min(12, ownership * 0.25);

        const confidence = Math.round(clamp(confidenceBase - risk * 0.32, 5, 98));

        const expectedPoints = Number(((hasSeasonData ? liveBase : preseasonBase) + confidence / 125).toFixed(2));

        const price = Number((player.now_cost / 10).toFixed(1));

        return {
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
            ownership,
            expectedPoints,
            valueScore: Number((expectedPoints / Math.max(price, 1)).toFixed(2)),
            confidence,
            risk,
            news: player.news || '',
            status: player.status || 'a',
            fixture,
            fixtureScore,
        };
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

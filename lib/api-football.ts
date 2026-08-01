import type { ModelPlayer } from '@/types/fpl';

const API_BASE = 'https://v3.football.api-sports.io';
const PREMIER_LEAGUE_ID = 39;

export type ApiFootballPlayerEvidence = {
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

export type ApiFootballScan = {
  enabled: boolean;
  matchedPlayers: number;
  fixturesChecked: number;
  evidence: Map<number, ApiFootballPlayerEvidence>;
  error?: string;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function surname(value: string) {
  return normalize(value).split(' ').at(-1) || '';
}

function seasonFor(date = new Date()) {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

async function apiFetch<T>(path: string): Promise<T | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'x-apisports-key': key },
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

type FixtureResponse = {
  response?: Array<{ fixture?: { id?: number; status?: { short?: string } } }>;
};

type PlayersResponse = {
  response?: Array<{
    team?: { name?: string };
    players?: Array<{
      player?: { name?: string };
      statistics?: Array<{
        games?: { minutes?: number | null; rating?: string | null; substitute?: boolean };
        shots?: { total?: number | null };
        passes?: { key?: number | null };
        tackles?: { total?: number | null };
        goals?: { saves?: number | null };
      }>;
    }>;
  }>;
};

export async function getApiFootballEvidence(players: ModelPlayer[]): Promise<ApiFootballScan> {
  if (!process.env.API_FOOTBALL_KEY) {
    return { enabled: false, matchedPlayers: 0, fixturesChecked: 0, evidence: new Map() };
  }

  const now = new Date();
  const from = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const currentSeason = seasonFor(now);
  let evidenceSeason = currentSeason;
  let fixtures = await apiFetch<FixtureResponse>(
    `/fixtures?league=${PREMIER_LEAGUE_ID}&season=${currentSeason}&from=${from}&to=${to}`,
  );
  if (!fixtures) {
    return { enabled: true, matchedPlayers: 0, fixturesChecked: 0, evidence: new Map(), error: 'API-Football unavailable or plan does not include this season.' };
  }

  let fixtureIds = (fixtures.response || [])
    .filter((item) => ['FT', 'AET', 'PEN', 'LIVE', '1H', '2H', 'HT'].includes(item.fixture?.status?.short || ''))
    .map((item) => item.fixture?.id)
    .filter((id): id is number => Number.isFinite(id))
    .slice(-10);

  // Pre-season үед шинэ улирал тоглолтгүй байдаг тул өмнөх PL улирлын
  // сүүлийн тоглолтуудыг starter/minutes-ийн суурь нотолгоо болгоно.
  if (!fixtureIds.length) {
    evidenceSeason = currentSeason - 1;
    fixtures = await apiFetch<FixtureResponse>(
      `/fixtures?league=${PREMIER_LEAGUE_ID}&season=${evidenceSeason}&last=20`,
    );
    fixtureIds = (fixtures?.response || [])
      .map((item) => item.fixture?.id)
      .filter((id): id is number => Number.isFinite(id));
  }

  const teamAliases: Record<string, string[]> = {
    ARS: ['arsenal'], AVL: ['aston villa'], BOU: ['bournemouth'], BRE: ['brentford'],
    BHA: ['brighton', 'brighton hove albion'], BUR: ['burnley'], CHE: ['chelsea'],
    CRY: ['crystal palace'], EVE: ['everton'], FUL: ['fulham'], LEE: ['leeds'],
    LIV: ['liverpool'], MCI: ['manchester city', 'man city'], MUN: ['manchester united', 'man united'],
    NEW: ['newcastle', 'newcastle united'], NFO: ['nottingham forest'], SUN: ['sunderland'],
    TOT: ['tottenham', 'tottenham hotspur'], WHU: ['west ham', 'west ham united'], WOL: ['wolves', 'wolverhampton'],
  };
  const uniqueSurname = new Map<string, ModelPlayer[]>();
  for (const player of players) {
    const key = surname(player.name);
    if (!key) continue;
    uniqueSurname.set(key, [...(uniqueSurname.get(key) || []), player]);
  }

  const raw = await Promise.all(fixtureIds.map((id) => apiFetch<PlayersResponse>(`/fixtures/players?fixture=${id}`)));
  const aggregates = new Map<number, ApiFootballPlayerEvidence>();
  const checkedAt = new Date().toISOString();

  for (const response of raw) {
    for (const team of response?.response || []) {
      for (const item of team.players || []) {
        const candidates = uniqueSurname.get(surname(item.player?.name || '')) || [];
        const apiTeam = normalize(team.team?.name || '');
        const matched = candidates.find((candidate) =>
          (teamAliases[candidate.team] || [candidate.team]).some((alias) => apiTeam.includes(normalize(alias))),
        );
        if (!matched) continue;
        const stat = item.statistics?.[0];
        if (!stat) continue;
        const current = aggregates.get(matched.id) || {
          matches: 0, starts: 0, minutes: 0, rating: 0,
          shots: 0, keyPasses: 0, tackles: 0, saves: 0, checkedAt,
          season: evidenceSeason,
          currentSeason: evidenceSeason === currentSeason,
          currentTeamMatched: true,
        };
        const rating = Number(stat.games?.rating || 0);
        current.matches += 1;
        current.starts += stat.games?.substitute === false ? 1 : 0;
        current.minutes += Number(stat.games?.minutes || 0);
        current.rating += Number.isFinite(rating) ? rating : 0;
        current.shots += Number(stat.shots?.total || 0);
        current.keyPasses += Number(stat.passes?.key || 0);
        current.tackles += Number(stat.tackles?.total || 0);
        current.saves += Number(stat.goals?.saves || 0);
        aggregates.set(matched.id, current);
      }
    }
  }

  for (const value of aggregates.values()) {
    value.minutes = value.matches ? Math.round(value.minutes / value.matches) : 0;
    value.rating = value.matches ? Number((value.rating / value.matches).toFixed(2)) : 0;
  }
  return {
    enabled: true,
    matchedPlayers: aggregates.size,
    fixturesChecked: fixtureIds.length,
    evidence: aggregates,
    error: fixtureIds.length ? undefined : 'No completed Premier League fixtures were available for verification.',
  };
}

export function applyApiFootballEvidence(players: ModelPlayer[], scan: ApiFootballScan) {
  return players.map((player) => {
    const api = scan.evidence.get(player.id);
    if (!api) return player;
    const startRate = api.matches ? api.starts / api.matches : 0;
    const canConfirmCurrentRole = api.currentSeason && api.currentTeamMatched && api.matches >= 2;
    const starterConfidence = canConfirmCurrentRole
      ? Math.round(Math.min(98, Math.max(player.starterConfidence, startRate * 92)))
      : player.starterConfidence;
    const predictedMinutes = canConfirmCurrentRole
      ? Math.round(Math.min(90, Math.max(player.predictedMinutes, api.minutes)))
      : player.predictedMinutes;
    const existingSources = player.evidence?.sources || [];
    return {
      ...player,
      apiFootball: api,
      starterConfidence,
      predictedMinutes,
      evidence: player.evidence ? {
        ...player.evidence,
        coverageScore: Math.min(100, player.evidence.coverageScore + (canConfirmCurrentRole ? 12 : 4)),
        trustLevel: player.evidence.coverageScore + (canConfirmCurrentRole ? 12 : 4) >= 78 ? 'high' as const : player.evidence.trustLevel,
        availableMetrics: [...new Set([
          ...player.evidence.availableMetrics,
          canConfirmCurrentRole ? 'API-Football current-team lineup' : 'API-Football previous-season statistics',
          'live match statistics',
        ])],
        sources: [...existingSources, {
          id: 'api-football' as const,
          label: 'API-Football lineups/player statistics',
          status: canConfirmCurrentRole ? 'available' as const : 'limited' as const,
        }],
      } : player.evidence,
    };
  });
}

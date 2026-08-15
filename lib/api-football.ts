import type { ModelPlayer } from '@/types/fpl';
import { matchPlayerIdentity, type IdentityMatch } from '@/lib/player-identity';

const API_BASE = 'https://v3.football.api-sports.io';
const PREMIER_LEAGUE_ID = 39;
const CLUB_FRIENDLIES_ID = 667;
const MAX_PLAYER_FIXTURES = 24;
const MAX_FRIENDLY_FIXTURES = 8;
const MAX_ODDS_FIXTURES = 10;
const MAX_INTERNATIONAL_FIXTURES = 60;
const INTERNATIONAL_FIXTURE_BATCH_SIZE = 20;
const INTERNATIONAL_WINDOW_DAYS = 21;
const INTERNATIONAL_LEAGUE_IDS = new Set([1, 4, 5, 6, 7, 9, 10, 22, 29, 30, 31, 32, 33, 34]);

const TEAM_ALIASES: Record<string, string[]> = {
  ARS: ['arsenal'], AVL: ['aston villa'], BOU: ['bournemouth'], BRE: ['brentford'],
  BHA: ['brighton', 'brighton hove albion'], BUR: ['burnley'], CHE: ['chelsea'],
  CRY: ['crystal palace'], EVE: ['everton'], FUL: ['fulham'], LEE: ['leeds'],
  LIV: ['liverpool'], MCI: ['manchester city', 'man city'], MUN: ['manchester united', 'man united'],
  NEW: ['newcastle', 'newcastle united'], NFO: ['nottingham forest'], SUN: ['sunderland'],
  TOT: ['tottenham', 'tottenham hotspur'], WHU: ['west ham', 'west ham united'], WOL: ['wolves', 'wolverhampton'],
};

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
  friendlyMatches: number;
  friendlyStarts: number;
  friendlyMinutes: number;
  competitiveMatches: number;
  competitiveStarts: number;
  competitiveMinutes: number;
  internationalMatches: number;
  internationalStarts: number;
  internationalMinutes: number;
  lastInternationalAt?: string;
  internationalFatigueRisk: number;
  apiPlayerId?: number;
  identityConfidence?: number;
  identityVerified?: boolean;
  identityMethod?: 'exact-full-name' | 'exact-display-name' | 'team-name-score';
  oddsWinProbability?: number;
};

export type ApiFootballScan = {
  enabled: boolean;
  matchedPlayers: number;
  fixturesChecked: number;
  friendlyFixturesChecked: number;
  oddsFixturesChecked: number;
  oddsTeamsMatched: number;
  identityMatched: number;
  identityAmbiguous: number;
  identityUnmatched: number;
  internationalFixturesChecked: number;
  internationalPlayersMatched: number;
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

function teamCode(value: string, players: ModelPlayer[] = []) {
  const normalized = normalize(value);
  const staticCode = Object.entries(TEAM_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => normalized.includes(normalize(alias))))?.[0];
  if (staticCode) return staticCode;
  return players.find((player) => {
    const teamName = normalize(player.teamName || '');
    return teamName && (normalized === teamName || normalized.includes(teamName) || teamName.includes(normalized));
  })?.team || null;
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
  response?: Array<{
    fixture?: { id?: number; date?: string; status?: { short?: string } };
    league?: { id?: number; name?: string; type?: string };
    teams?: { home?: { name?: string }; away?: { name?: string } };
    players?: PlayerStatTeam[];
  }>;
};

type OddsResponse = {
  response?: Array<{
    bookmakers?: Array<{
      bets?: Array<{
        name?: string;
        values?: Array<{ value?: string; odd?: string }>;
      }>;
    }>;
  }>;
};

type PlayerStatTeam = {
    team?: { name?: string };
    players?: Array<{
      player?: { id?: number; name?: string };
      statistics?: Array<{
        games?: { minutes?: number | null; rating?: string | null; substitute?: boolean };
        shots?: { total?: number | null };
        passes?: { key?: number | null };
        tackles?: { total?: number | null };
        goals?: { saves?: number | null };
      }>;
    }>;
};

type PlayersResponse = {
  response?: PlayerStatTeam[];
};

function isInternationalFixture(item: NonNullable<FixtureResponse['response']>[number]) {
  const name = item.league?.name || '';
  if (/club/i.test(name)) return false;
  return INTERNATIONAL_LEAGUE_IDS.has(Number(item.league?.id)) ||
    /world cup|euro|nations league|africa cup|asian cup|copa america|gold cup|friendlies|qualification/i.test(name);
}

export function calculateInternationalFatigueRisk(
  minutes: number,
  lastMatchAt?: string,
  now = new Date(),
) {
  if (!minutes || !lastMatchAt) return 0;
  const elapsed = now.getTime() - new Date(lastMatchAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  const days = elapsed / (24 * 60 * 60 * 1000);
  if (days <= 4 && minutes >= 150) return 45;
  if (days <= 7 && minutes >= 120) return 30;
  if (days <= 10 && minutes >= 180) return 22;
  if (minutes >= 240) return 15;
  return 0;
}

export async function getApiFootballEvidence(players: ModelPlayer[]): Promise<ApiFootballScan> {
  if (!process.env.API_FOOTBALL_KEY) {
    return {
      enabled: false, matchedPlayers: 0, fixturesChecked: 0,
      friendlyFixturesChecked: 0, oddsFixturesChecked: 0, oddsTeamsMatched: 0,
      identityMatched: 0, identityAmbiguous: 0, identityUnmatched: 0,
      internationalFixturesChecked: 0, internationalPlayersMatched: 0,
      evidence: new Map(),
    };
  }

  const now = new Date();
  const from = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const currentSeason = seasonFor(now);
  let evidenceSeason = currentSeason;
  let fixtures = await apiFetch<FixtureResponse>(
    `/fixtures?league=${PREMIER_LEAGUE_ID}&season=${currentSeason}&from=${from}&to=${to}`,
  );
  if (!fixtures) {
    return {
      enabled: true, matchedPlayers: 0, fixturesChecked: 0,
      friendlyFixturesChecked: 0, oddsFixturesChecked: 0, oddsTeamsMatched: 0,
      identityMatched: 0, identityAmbiguous: 0, identityUnmatched: 0,
      internationalFixturesChecked: 0, internationalPlayersMatched: 0,
      evidence: new Map(), error: 'API-Football unavailable or plan does not include this season.',
    };
  }

  let fixtureIds = (fixtures.response || [])
    .filter((item) => ['FT', 'AET', 'PEN', 'LIVE', '1H', '2H', 'HT'].includes(item.fixture?.status?.short || ''))
    .map((item) => item.fixture?.id)
    .filter((id): id is number => Number.isFinite(id))
    .slice(-20);

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

  // Club Friendlies (API-Football league 667) provides structured pre-season
  // lineups/minutes without scraping SofaScore/OneFootball. Only fixtures
  // involving a current PL team are retained and calls are strictly bounded.
  const friendlyResponse = await apiFetch<FixtureResponse>(
    `/fixtures?league=${CLUB_FRIENDLIES_ID}&season=${currentSeason}&from=${from}&to=${to}`,
  );
  const friendlyIds = (friendlyResponse?.response || [])
    .filter((item) => teamCode(item.teams?.home?.name || '', players) || teamCode(item.teams?.away?.name || '', players))
    .map((item) => item.fixture?.id)
    .filter((id): id is number => Number.isFinite(id))
    .slice(-MAX_FRIENDLY_FIXTURES);
  const friendlyIdSet = new Set(friendlyIds);
  fixtureIds = [...new Set([...fixtureIds, ...friendlyIds])].slice(-MAX_PLAYER_FIXTURES);
  const playersByTeam = new Map<string, ModelPlayer[]>();
  const playerById = new Map(players.map((player) => [player.id, player]));
  for (const player of players) {
    playersByTeam.set(player.team, [...(playersByTeam.get(player.team) || []), player]);
  }

  const raw = await Promise.all(fixtureIds.map(async (id) => ({
    id,
    response: await apiFetch<PlayersResponse>(`/fixtures/players?fixture=${id}`),
  })));
  const aggregates = new Map<number, ApiFootballPlayerEvidence>();
  const identityByApiId = new Map<number, Extract<IdentityMatch, { status: 'matched' }>>();
  const apiIdByFplId = new Map<number, number>();
  const ambiguousApiIds = new Set<number>();
  const unmatchedApiIds = new Set<number>();
  const checkedAt = new Date().toISOString();

  for (const fixture of raw) {
    for (const team of fixture.response?.response || []) {
      for (const item of team.players || []) {
        const apiPlayerId = item.player?.id;
        const apiPlayerName = item.player?.name || '';
        const matchedTeam = teamCode(team.team?.name || '', players);
        if (!Number.isFinite(apiPlayerId) || !apiPlayerName || !matchedTeam) continue;

        let identity = identityByApiId.get(apiPlayerId as number);
        if (!identity) {
          const result = matchPlayerIdentity(apiPlayerName, playersByTeam.get(matchedTeam) || []);
          if (result.status !== 'matched') {
            if (result.status === 'ambiguous') ambiguousApiIds.add(apiPlayerId as number);
            else unmatchedApiIds.add(apiPlayerId as number);
            continue;
          }
          const existingApiId = apiIdByFplId.get(result.candidate.id);
          if (existingApiId != null && existingApiId !== apiPlayerId) {
            ambiguousApiIds.add(apiPlayerId as number);
            continue;
          }
          identity = result;
          identityByApiId.set(apiPlayerId as number, result);
          apiIdByFplId.set(result.candidate.id, apiPlayerId as number);
          ambiguousApiIds.delete(apiPlayerId as number);
          unmatchedApiIds.delete(apiPlayerId as number);
        }
        const matched = playerById.get(identity.candidate.id);
        if (!matched) continue;
        const stat = item.statistics?.[0];
        if (!stat) continue;
        const current = aggregates.get(matched.id) || {
          matches: 0, starts: 0, minutes: 0, rating: 0,
          shots: 0, keyPasses: 0, tackles: 0, saves: 0, checkedAt,
          season: evidenceSeason,
          currentSeason: evidenceSeason === currentSeason,
          currentTeamMatched: true,
          friendlyMatches: 0,
          friendlyStarts: 0,
          friendlyMinutes: 0,
          competitiveMatches: 0,
          competitiveStarts: 0,
          competitiveMinutes: 0,
          internationalMatches: 0,
          internationalStarts: 0,
          internationalMinutes: 0,
          internationalFatigueRisk: 0,
          apiPlayerId: apiPlayerId as number,
          identityConfidence: identity.confidence,
          identityVerified: true,
          identityMethod: identity.method,
        };
        const rating = Number(stat.games?.rating || 0);
        const minutes = Number(stat.games?.minutes || 0);
        const started = stat.games?.substitute === false;
        const friendly = friendlyIdSet.has(fixture.id);
        current.matches += 1;
        current.starts += started ? 1 : 0;
        current.minutes += minutes;
        current.rating += Number.isFinite(rating) ? rating : 0;
        current.shots += Number(stat.shots?.total || 0);
        current.keyPasses += Number(stat.passes?.key || 0);
        current.tackles += Number(stat.tackles?.total || 0);
        current.saves += Number(stat.goals?.saves || 0);
        if (friendly) {
          current.friendlyMatches += 1;
          current.friendlyStarts += started ? 1 : 0;
          current.friendlyMinutes += minutes;
        } else {
          current.competitiveMatches += 1;
          current.competitiveStarts += started ? 1 : 0;
          current.competitiveMinutes += minutes;
        }
        aggregates.set(matched.id, current);
      }
    }
  }

  for (const value of aggregates.values()) {
    value.minutes = value.matches ? Math.round(value.minutes / value.matches) : 0;
    value.friendlyMinutes = value.friendlyMatches
      ? Math.round(value.friendlyMinutes / value.friendlyMatches)
      : 0;
    value.competitiveMinutes = value.competitiveMatches
      ? Math.round(value.competitiveMinutes / value.competitiveMatches)
      : 0;
    value.rating = value.matches ? Number((value.rating / value.matches).toFixed(2)) : 0;
  }

  // Quota-friendly: one date-range request and one fixture batch. National-
  // team evidence is attached only through an API player ID already verified
  // against the player's current Premier League team.
  const internationalFrom = new Date(
    now.getTime() - INTERNATIONAL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString().slice(0, 10);
  const internationalList = await apiFetch<FixtureResponse>(
    `/fixtures?from=${internationalFrom}&to=${to}`,
  );
  const internationalFixtureIds = (internationalList?.response || [])
    .filter(isInternationalFixture)
    .filter((item) => ['FT', 'AET', 'PEN', 'LIVE', '1H', '2H', 'HT'].includes(item.fixture?.status?.short || ''))
    .sort((a, b) => new Date(a.fixture?.date || 0).getTime() - new Date(b.fixture?.date || 0).getTime())
    .map((item) => item.fixture?.id)
    .filter((id): id is number => Number.isFinite(id))
    .slice(-MAX_INTERNATIONAL_FIXTURES);
  const internationalIdBatches = Array.from(
    { length: Math.ceil(internationalFixtureIds.length / INTERNATIONAL_FIXTURE_BATCH_SIZE) },
    (_, index) => internationalFixtureIds.slice(
      index * INTERNATIONAL_FIXTURE_BATCH_SIZE,
      (index + 1) * INTERNATIONAL_FIXTURE_BATCH_SIZE,
    ),
  );
  const internationalBatches = await Promise.all(
    internationalIdBatches.map((ids) => apiFetch<FixtureResponse>(`/fixtures?ids=${ids.join('-')}`)),
  );
  const internationalMatchedIds = new Set<number>();
  for (const fixture of internationalBatches.flatMap((batch) => batch?.response || [])) {
    const playedAt = fixture.fixture?.date;
    for (const team of fixture.players || []) {
      for (const item of team.players || []) {
        const apiPlayerId = item.player?.id;
        if (!Number.isFinite(apiPlayerId)) continue;
        const identity = identityByApiId.get(apiPlayerId as number);
        if (!identity) continue;
        const current = aggregates.get(identity.candidate.id);
        const stat = item.statistics?.[0];
        if (!current || !stat) continue;
        const minutes = Number(stat.games?.minutes || 0);
        if (minutes <= 0) continue;
        current.internationalMatches += 1;
        current.internationalStarts += stat.games?.substitute === false ? 1 : 0;
        current.internationalMinutes += minutes;
        if (playedAt && (!current.lastInternationalAt || playedAt > current.lastInternationalAt)) {
          current.lastInternationalAt = playedAt;
        }
        internationalMatchedIds.add(identity.candidate.id);
      }
    }
  }
  for (const value of aggregates.values()) {
    value.internationalFatigueRisk = calculateInternationalFatigueRisk(
      value.internationalMinutes,
      value.lastInternationalAt,
      now,
    );
  }


  // Odds are supporting market evidence, not a replacement for FPL FDR. We
  // record normalized Match Winner probability but do not double-count it in
  // expected points until the model is calibrated against finished GWs.
  const upcoming = await apiFetch<FixtureResponse>(
    `/fixtures?league=${PREMIER_LEAGUE_ID}&season=${currentSeason}&next=${MAX_ODDS_FIXTURES}`,
  );
  const oddsFixtures = (upcoming?.response || []).slice(0, MAX_ODDS_FIXTURES);
  const oddsResults = await Promise.all(oddsFixtures.map(async (item) => ({
    item,
    odds: item.fixture?.id
      ? await apiFetch<OddsResponse>(`/odds?fixture=${item.fixture.id}`)
      : null,
  })));
  const teamOdds = new Map<string, number>();
  let oddsFixturesChecked = 0;
  for (const { item, odds } of oddsResults) {
    const market = odds?.response?.[0]?.bookmakers
      ?.flatMap((bookmaker) => bookmaker.bets || [])
      .find((bet) => /match winner/i.test(bet.name || ''));
    if (!market?.values?.length) continue;
    const homeOdd = Number(market.values.find((value) => /home/i.test(value.value || ''))?.odd || 0);
    const drawOdd = Number(market.values.find((value) => /draw/i.test(value.value || ''))?.odd || 0);
    const awayOdd = Number(market.values.find((value) => /away/i.test(value.value || ''))?.odd || 0);
    if (![homeOdd, drawOdd, awayOdd].every((odd) => odd > 1)) continue;
    const total = 1 / homeOdd + 1 / drawOdd + 1 / awayOdd;
    const home = teamCode(item.teams?.home?.name || '', players);
    const away = teamCode(item.teams?.away?.name || '', players);
    if (home) teamOdds.set(home, Number(((1 / homeOdd) / total).toFixed(3)));
    if (away) teamOdds.set(away, Number(((1 / awayOdd) / total).toFixed(3)));
    oddsFixturesChecked += 1;
  }
  for (const player of players) {
    const oddsWinProbability = teamOdds.get(player.team);
    if (oddsWinProbability == null) continue;
    const current = aggregates.get(player.id) || {
      matches: 0, starts: 0, minutes: 0, rating: 0,
      shots: 0, keyPasses: 0, tackles: 0, saves: 0, checkedAt,
      season: evidenceSeason, currentSeason: evidenceSeason === currentSeason,
      currentTeamMatched: true,
      friendlyMatches: 0, friendlyStarts: 0, friendlyMinutes: 0,
      competitiveMatches: 0, competitiveStarts: 0, competitiveMinutes: 0,
      internationalMatches: 0, internationalStarts: 0, internationalMinutes: 0,
      internationalFatigueRisk: 0,
    };
    current.oddsWinProbability = oddsWinProbability;
    aggregates.set(player.id, current);
  }
  return {
    enabled: true,
    matchedPlayers: aggregates.size,
    fixturesChecked: fixtureIds.length,
    friendlyFixturesChecked: friendlyIds.length,
    oddsFixturesChecked,
    oddsTeamsMatched: teamOdds.size,
    identityMatched: identityByApiId.size,
    identityAmbiguous: ambiguousApiIds.size,
    identityUnmatched: unmatchedApiIds.size,
    internationalFixturesChecked: internationalFixtureIds.length,
    internationalPlayersMatched: internationalMatchedIds.size,
    evidence: aggregates,
    error: fixtureIds.length ? undefined : 'No completed Premier League fixtures were available for verification.',
  };
}

export function applyApiFootballEvidence(players: ModelPlayer[], scan: ApiFootballScan) {
  return players.map((player) => {
    const api = scan.evidence.get(player.id);
    if (!api) return player;
    const canConfirmCurrentRole = Boolean(api.identityVerified) && api.currentSeason && api.currentTeamMatched && api.competitiveMatches >= 2;
    const canSupportPreseasonRole = Boolean(api.identityVerified) && api.currentTeamMatched && api.friendlyMatches >= 2;
    // Official recent match history and API-Football often describe the same
    // matches. When the primary history sample is good, keep API-Football as
    // corroboration instead of applying the same role evidence twice.
    const evidenceWeight = canConfirmCurrentRole
      ? player.recentHistory?.dataQuality === 'good' ? 0.2 : 0.65
      : canSupportPreseasonRole ? 0.3 : 0;
    const startRate = canConfirmCurrentRole
      ? api.competitiveStarts / Math.max(1, api.competitiveMatches)
      : api.friendlyStarts / Math.max(1, api.friendlyMatches);
    const evidenceMinutes = canConfirmCurrentRole ? api.competitiveMinutes : api.friendlyMinutes;
    const starterConfidence = evidenceWeight
      ? Math.round(Math.min(98, Math.max(2, player.starterConfidence * (1 - evidenceWeight) + startRate * 100 * evidenceWeight)))
      : player.starterConfidence;
    const predictedMinutes = evidenceWeight
      ? Math.round(Math.min(90, Math.max(0, player.predictedMinutes * (1 - evidenceWeight) + evidenceMinutes * evidenceWeight)))
      : player.predictedMinutes;
    const previousAvailabilityCore = Math.max(
      0.03,
      player.starterConfidence / 100 * 0.72 + player.predictedMinutes / 90 * 0.28,
    );
    const statusFactor = Math.max(
      0.03,
      Math.min(1, player.appearanceProbability / previousAvailabilityCore),
    );
    const appearanceProbability = evidenceWeight
      ? Number(
          Math.max(
            0.03,
            Math.min(1, statusFactor * (starterConfidence / 100 * 0.72 + predictedMinutes / 90 * 0.28)),
          ).toFixed(3),
        )
      : player.appearanceProbability;
    const projectionFactor = evidenceWeight
      ? appearanceProbability / Math.max(0.03, player.appearanceProbability)
      : 1;
    const fatigueFactor = api.internationalFatigueRisk >= 45
      ? 0.94
      : api.internationalFatigueRisk >= 30
        ? 0.97
        : api.internationalFatigueRisk >= 20
          ? 0.985
          : 1;
    const finalProjectionFactor = projectionFactor * fatigueFactor;
    const expectedPoints = Number((player.expectedPoints * finalProjectionFactor).toFixed(2));
    const risk = Math.max(player.risk, api.internationalFatigueRisk);
    const riskLevel = risk >= 60 ? 'high' as const : risk >= 30 ? 'medium' as const : 'low' as const;
    const existingSources = player.evidence?.sources || [];
    return {
      ...player,
      apiFootball: api,
      starterConfidence,
      predictedMinutes: Math.round(predictedMinutes * fatigueFactor),
      appearanceProbability: Number((appearanceProbability * fatigueFactor).toFixed(3)),
      risk,
      riskBreakdown: player.riskBreakdown ? {
        ...player.riskBreakdown,
        total: Math.max(player.riskBreakdown.total, api.internationalFatigueRisk),
        level: riskLevel,
      } : player.riskBreakdown,
      expectedPoints,
      fixtureImpact: Number((player.fixtureImpact * finalProjectionFactor).toFixed(2)),
      valueScore: Number((expectedPoints / Math.max(player.price, 1)).toFixed(2)),
      projection: {
        ...player.projection,
        next1: Number((player.projection.next1 * finalProjectionFactor).toFixed(2)),
        next3: Number((player.projection.next3 * finalProjectionFactor).toFixed(2)),
        next5: Number((player.projection.next5 * finalProjectionFactor).toFixed(2)),
        next8: Number((player.projection.next8 * finalProjectionFactor).toFixed(2)),
        byEvent: player.projection.byEvent.map((item) => ({
          ...item,
          points: Number((item.points * finalProjectionFactor).toFixed(2)),
        })),
      },
      evidence: player.evidence ? {
        ...player.evidence,
        coverageScore: Math.min(100, player.evidence.coverageScore + (canConfirmCurrentRole ? 12 : canSupportPreseasonRole ? 7 : api.internationalMatches ? 4 : api.oddsWinProbability ? 3 : 0)),
        trustLevel: player.evidence.coverageScore + (canConfirmCurrentRole ? 12 : canSupportPreseasonRole ? 7 : 0) >= 78 ? 'high' as const : player.evidence.trustLevel,
        availableMetrics: [...new Set([
          ...player.evidence.availableMetrics,
          ...(api.matches && api.identityVerified ? [canConfirmCurrentRole ? 'API-Football current-team lineup' : 'API-Football lineup/statistics'] : []),
          ...(api.identityVerified ? [`API player identity ${api.identityConfidence || 0}%`] : []),
          ...(api.friendlyMatches ? ['structured club-friendly minutes'] : []),
          ...(api.internationalMatches ? [`structured international minutes (${api.internationalMinutes})`] : []),
          ...(api.internationalFatigueRisk ? [`international fatigue risk ${api.internationalFatigueRisk}%`] : []),
          ...(api.oddsWinProbability != null ? ['normalized market win probability'] : []),
        ])],
        sources: [...existingSources, {
          id: 'api-football' as const,
          label: 'API-Football lineups/player statistics/international minutes/odds',
          status: canConfirmCurrentRole || canSupportPreseasonRole || api.internationalMatches ? 'available' as const : 'limited' as const,
        }],
      } : player.evidence,
    };
  });
}

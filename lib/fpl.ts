import { buildFixtureMap } from './fixtures';
import { FplEvent, FplFixture, FplPlayer, FplPosition, FplTeam, ModelPlayer } from '@/types/fpl';

const FPL_BASE = 'https://fantasy.premierleague.com/api';

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getBootstrap() {
  return safeFetch<{ elements: FplPlayer[]; teams: FplTeam[]; element_types: FplPosition[]; events: FplEvent[] }>(`${FPL_BASE}/bootstrap-static/`);
}

export async function getFixtures() {
  return safeFetch<FplFixture[]>(`${FPL_BASE}/fixtures/`);
}

export async function getEntry(entryId: string) {
  return safeFetch<any>(`${FPL_BASE}/entry/${entryId}/`);
}

export async function getEntryPicks(entryId: string, eventId: number) {
  return safeFetch<any>(`${FPL_BASE}/entry/${entryId}/event/${eventId}/picks/`);
}

export async function getLeague(leagueId: string, page = 1) {
  return safeFetch<any>(`${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}`);
}

export function nextEvent(events?: FplEvent[]) {
  if (!events?.length) return null;
  return events.find(e => e.is_next) || events.find(e => !e.finished) || null;
}

export function currentEvent(events?: FplEvent[]) {
  if (!events?.length) return null;
  return events.find(e => e.is_current) || events.filter(e => e.finished).at(-1) || events[0];
}

export function toModelPlayers(
  players: FplPlayer[] = [],
  teams: FplTeam[] = [],
  positions: FplPosition[] = [],
  fixtures: FplFixture[] = [],
  eventId?: number | null,
): ModelPlayer[] {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const posMap = new Map(positions.map(p => [p.id, p]));
  const fixtureMap = buildFixtureMap(fixtures, teams, eventId, 5);

  return players.map(p => {
    const form = Number(p.form || 0);
    const ep = Number(p.ep_next || p.ep_this || p.points_per_game || 0);
    const ppg = Number(p.points_per_game || 0);
    const ownership = Number(p.selected_by_percent || 0);
    const minutesScore = Math.min(1, (p.minutes || 0) / 2500);
    const injuryRisk = p.chance_of_playing_next_round == null ? 0 : (100 - p.chance_of_playing_next_round) / 100;
    const statusRisk = p.status && p.status !== 'a' ? 0.35 : 0;
    const newsRisk = p.news ? 0.15 : 0;
    const risk = Math.round(Math.min(100, (injuryRisk + statusRisk + newsRisk + (p.minutes > 0 && minutesScore < 0.25 ? 0.15 : 0)) * 100));
    const fixture = fixtureMap.get(p.team);
    const fixtureScore = fixture?.fixtureScore ?? 3;
    const team = teamMap.get(p.team);
    const teamStrength = Number(team?.strength || 3);
    const preseasonBase = fixtureScore * 0.65 + teamStrength * 0.18 + Math.min(ownership, 35) * 0.018;
    const liveBase = ep * 0.38 + ppg * 0.25 + form * 0.17 + fixtureScore * 0.42;
    const hasSeasonData = p.minutes > 0 || p.total_points > 0 || form > 0;
    const confidence = Math.max(5, Math.min(98, Math.round(
      (hasSeasonData ? 34 + minutesScore * 30 + Math.min(18, form * 2.5) : 48 + fixtureScore * 6 + Math.min(12, ownership * 0.25)) - risk * 0.32
    )));
    const expectedPoints = Number(((hasSeasonData ? liveBase : preseasonBase) + confidence / 120).toFixed(2));
    const price = p.now_cost / 10;

    return {
      id: p.id,
      name: p.web_name,
      team: team?.short_name || String(p.team),
      teamId: p.team,
      position: posMap.get(p.element_type)?.singular_name_short || String(p.element_type),
      positionId: p.element_type,
      price,
      totalPoints: p.total_points,
      form,
      minutes: p.minutes || 0,
      ownership,
      expectedPoints,
      valueScore: Number((expectedPoints / Math.max(price, 1)).toFixed(2)),
      confidence,
      risk,
      news: p.news || '',
      status: p.status || 'a',
      fixture,
      fixtureScore,
    };
  });
}

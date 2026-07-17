import type { FplFixture, FplTeam, FixtureSummary } from '@/types/fpl';

export function buildFixtureMap(
  fixtures: FplFixture[] = [],
  teams: FplTeam[] = [],
  eventId?: number | null,
  horizon = 5,
): Map<number, FixtureSummary> {
  const teamNames = new Map(teams.map(team => [team.id, team.short_name || team.name]));
  const upcoming = fixtures
    .filter(f => !f.finished && !f.started)
    .filter(f => eventId == null || f.event == null || f.event >= eventId)
    .sort((a, b) => {
      const aEvent = a.event ?? 999;
      const bEvent = b.event ?? 999;
      if (aEvent !== bEvent) return aEvent - bEvent;
      return new Date(a.kickoff_time || 0).getTime() - new Date(b.kickoff_time || 0).getTime();
    });

  const byTeam = new Map<number, Array<{ opponent: number; opponentName: string; difficulty: number; isHome: boolean; event: number | null }>>();

  for (const fixture of upcoming) {
    const home = {
      opponent: fixture.team_a,
      opponentName: teamNames.get(fixture.team_a) || String(fixture.team_a),
      difficulty: fixture.team_h_difficulty || 3,
      isHome: true,
      event: fixture.event,
    };
    const away = {
      opponent: fixture.team_h,
      opponentName: teamNames.get(fixture.team_h) || String(fixture.team_h),
      difficulty: fixture.team_a_difficulty || 3,
      isHome: false,
      event: fixture.event,
    };
    byTeam.set(fixture.team_h, [...(byTeam.get(fixture.team_h) || []), home]);
    byTeam.set(fixture.team_a, [...(byTeam.get(fixture.team_a) || []), away]);
  }

  const result = new Map<number, FixtureSummary>();
  for (const team of teams) {
    const list = (byTeam.get(team.id) || []).slice(0, horizon);
    const next = list[0];
    const averageDifficulty = list.length
      ? list.reduce((sum, item) => sum + item.difficulty, 0) / list.length
      : 3;
    const fixtureScore = list.length
      ? list.reduce((sum, item, index) => {
          const recencyWeight = Math.max(1, horizon - index);
          const homeBonus = item.isHome ? 0.2 : 0;
          return sum + ((6 - item.difficulty) + homeBonus) * recencyWeight;
        }, 0) / list.reduce((sum, _item, index) => sum + Math.max(1, horizon - index), 0)
      : 3;

    result.set(team.id, {
      nextOpponent: next?.opponentName || 'TBD',
      nextOpponentId: next?.opponent || null,
      nextDifficulty: next?.difficulty || 3,
      nextIsHome: next?.isHome ?? null,
      averageDifficulty: Number(averageDifficulty.toFixed(2)),
      fixtureScore: Number(fixtureScore.toFixed(2)),
      fixtures: list,
    });
  }
  return result;
}

export function fixtureLabel(summary?: FixtureSummary) {
  if (!summary || summary.nextOpponent === 'TBD') return 'Fixture тодорхойгүй';
  return `${summary.nextOpponent} (${summary.nextIsHome ? 'H — талбайдаа' : 'A — айлд'}, FDR ${summary.nextDifficulty})`;
}

import { NextResponse } from 'next/server';
import { getLeague } from '@/lib/fpl';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const entryId = String(body.entryId || '').trim();
  const leagueId = String(body.leagueId || '').trim();
  if (!entryId || !leagueId) {
    return NextResponse.json({ mode: 'pre-season', message: 'Entry ID and League ID are optional. Add them later to unlock live league analysis.', managersAbove: [], strategy: 'Pre-season scouting' });
  }
  const league = await getLeague(leagueId);
  const results = league?.standings?.results || [];
  const me = results.find((r: any) => String(r.entry) === entryId);
  if (!league || !me) return NextResponse.json({ error: 'League or manager not found. Check IDs.' });
  const managersAbove = results.filter((r: any) => r.rank < me.rank).map((r: any) => ({
    entry: r.entry, rank: r.rank, playerName: r.player_name, teamName: r.entry_name, total: r.total, gap: r.total - me.total,
  }));
  const gap = managersAbove[0]?.gap || 0;
  const strategy = gap > 80 ? 'Aggressive differential chase' : gap > 35 ? 'Balanced aggressive' : gap > 0 ? 'Controlled chase' : 'Protect lead';
  return NextResponse.json({ league: league.league, me, managersAbove, pointsBehindLeader: gap, strategy });
}

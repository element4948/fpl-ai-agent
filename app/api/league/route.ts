import { NextResponse } from 'next/server';
import { getLeague } from '@/lib/fpl';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const entryId = String(body.entryId || '').trim();
  const leagueId = String(body.leagueId || '').trim();
  if (!leagueId) {
    return NextResponse.json({ mode: 'pre-season', message: 'League ID optional. Add it to unlock mini-league analysis.', managersAbove: [], strategy: 'Pre-season scouting' });
  }
  if (!entryId) {
    return NextResponse.json({ error: 'League analysis needs your Entry ID too (Settings → Entry ID).' });
  }
  const league = await getLeague(leagueId);
  if (!league) return NextResponse.json({ error: 'League not found. Check the League ID.' });
  const results = league?.standings?.results || [];
  const me = results.find((r: any) => String(r.entry) === entryId);
  if (!me) {
    // Empty standings = the season has not produced a table yet (pre-season).
    if (!results.length) {
      return NextResponse.json({ mode: 'pre-season', message: 'Мini-league байр эрэмбэ улирал эхэлсний дараа гарна (одоо standings хоосон).', managersAbove: [], strategy: 'Pre-season' });
    }
    return NextResponse.json({ error: 'Your Entry ID is not in this league. Check both the Entry ID and League ID.' });
  }
  const managersAbove = results.filter((r: any) => r.rank < me.rank).map((r: any) => ({
    entry: r.entry, rank: r.rank, playerName: r.player_name, teamName: r.entry_name, total: r.total, gap: r.total - me.total,
  }));
  const gap = managersAbove[0]?.gap || 0;
  const strategy = gap > 80 ? 'Aggressive differential chase' : gap > 35 ? 'Balanced aggressive' : gap > 0 ? 'Controlled chase' : 'Protect lead';
  return NextResponse.json({ league: league.league, me, managersAbove, pointsBehindLeader: gap, strategy });
}

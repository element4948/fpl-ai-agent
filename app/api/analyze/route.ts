import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntry, getEntryPicks, toModelPlayers } from '@/lib/fpl';
import { validateSquad } from '@/lib/rules';
import { rankCaptainCandidates } from '@/lib/scoring';
import { suggestSafeTransfers } from '@/lib/transfers';
import { chipPlanner } from '@/lib/chips';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const entryId = String(body.entryId || '').trim();
  const boot = await getBootstrap();
  if (!boot) return NextResponse.json({ error: 'FPL API unavailable' });
  const allPlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types);
  const event = currentEvent(boot.events);
  if (!entryId || !event?.id) {
    return NextResponse.json({
      mode: 'pre-season',
      message: 'No Entry ID yet. Showing pre-season model output.',
      captainShortlist: rankCaptainCandidates(allPlayers, 8),
      transferSuggestions: [],
      chips: chipPlanner({ hasEntry: false, isPreSeason: true }),
    });
  }
  const [entry, picks] = await Promise.all([getEntry(entryId), getEntryPicks(entryId, event.id)]);
  if (!entry || !picks?.picks) return NextResponse.json({ error: 'Entry data not found. Check Entry ID or wait until season opens.' });
  const map = new Map(allPlayers.map(p => [p.id, p]));
  const squad = picks.picks.map((pick: any) => ({ ...map.get(pick.element), pick })).filter(Boolean);
  const bank = Number((picks.entry_history?.bank || 0) / 10);
  const freeTransfers = body.freeTransfers ?? 1;
  const validation = validateSquad(squad);
  const captains = rankCaptainCandidates(squad, 6);
  const transfers = suggestSafeTransfers(squad, allPlayers, bank, freeTransfers);
  return NextResponse.json({
    mode: 'live',
    entry,
    event,
    summary: {
      playerName: entry.player_first_name ? `${entry.player_first_name} ${entry.player_last_name}` : entry.name,
      teamName: entry.name,
      overallPoints: entry.summary_overall_points,
      overallRank: entry.summary_overall_rank,
      gwPoints: entry.summary_event_points,
      gwRank: entry.summary_event_rank,
      bank,
      value: Number((picks.entry_history?.value || 0) / 10),
      freeTransfers,
    },
    squad,
    validation,
    captainShortlist: captains,
    transferSuggestions: transfers,
    chips: chipPlanner({ hasEntry: true, isPreSeason: false }),
  });
}

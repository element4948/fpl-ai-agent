import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntry, getEntryPicks, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDecision } from '@/lib/decision';
import type { Goal, RiskProfile } from '@/types/fpl';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const entryId = String(body.entryId || '').trim();
  const riskProfile = (body.riskProfile || 'balanced') as RiskProfile;
  const goal = (body.goal || 'both') as Goal;
  const freeTransfers = Number(body.freeTransfers || 1);
  const boot = await getBootstrap();
  if (!boot) return NextResponse.json({ error: 'FPL API unavailable' }, { status: 200 });

  const allPlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types);
  const next = nextEvent(boot.events);
  const oldGw38 = next?.name?.includes('38') && next?.deadline_time && new Date(next.deadline_time).getTime() < Date.now();
  const isPreSeason = !next || !next.deadline_time || !!oldGw38;

  if (!entryId || isPreSeason) {
    return NextResponse.json(buildDecision({ allPlayers, riskProfile, goal, isPreSeason: true }));
  }

  const event = currentEvent(boot.events);
  if (!event?.id) return NextResponse.json(buildDecision({ allPlayers, riskProfile, goal, isPreSeason: true }));

  const [entry, picks] = await Promise.all([getEntry(entryId), getEntryPicks(entryId, event.id)]);
  if (!entry || !picks?.picks) {
    return NextResponse.json({
      ...buildDecision({ allPlayers, riskProfile, goal, isPreSeason: true }),
      warning: 'Entry data not found. Pre-season model shown instead.',
    });
  }

  const map = new Map(allPlayers.map(p => [p.id, p]));
  const squad = picks.picks.map((pick: any) => map.get(pick.element)).filter(Boolean);
  const bank = Number((picks.entry_history?.bank || 0) / 10);

  return NextResponse.json({
    ...buildDecision({ allPlayers, squad, bank, freeTransfers, riskProfile, goal, isPreSeason: false }),
    entry,
    bank,
  });
}

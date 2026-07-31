import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntry, getEntryPicks, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { buildDecision } from '@/lib/decision';
import type { Goal, RiskProfile } from '@/types/fpl';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const entryId = String(body.entryId || '').trim();
  const riskProfile = (body.riskProfile || 'balanced') as RiskProfile;
  const goal = (body.goal || 'both') as Goal;
  const freeTransfers = Number(body.freeTransfers || 1);
  const plannedSquadIds = Array.isArray(body.plannedSquadIds)
    ? body.plannedSquadIds.map(Number).filter(Number.isFinite)
    : [];
  const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
  if (!boot) return NextResponse.json({ error: 'FPL API unavailable' }, { status: 200 });

  const next = nextEvent(boot.events);
  const completedGameweeks = boot.events.filter(event => event.finished).length;
  const basePlayers = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completedGameweeks);
  const allPlayers = applyExternalNewsSignals(
    basePlayers,
    await getExternalNewsSignals(basePlayers),
  );
  const oldGw38 = next?.name?.includes('38') && next?.deadline_time && new Date(next.deadline_time).getTime() < Date.now();
  const isPreSeason = completedGameweeks === 0 || !next || !next.deadline_time || !!oldGw38;

  if (!entryId || isPreSeason) {
    const plannedSquad = plannedSquadIds.length === 15
      ? allPlayers.filter((player) => plannedSquadIds.includes(player.id))
      : [];
    return NextResponse.json({
      ...buildDecision({
        allPlayers,
        squad: plannedSquad.length === 15 ? plannedSquad : undefined,
        riskProfile,
        goal,
        isPreSeason: true,
      }),
      squadSource: plannedSquad.length === 15 ? 'planned-draft' : 'model-draft',
      entryAvailability: entryId
        ? 'Official FPL public API does not expose the private pre-deadline squad. A saved planned draft is used until picks become public.'
        : 'No Entry ID connected.',
    });
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

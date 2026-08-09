import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntryPicks, getFixtures, getLeague, nextEvent, toModelPlayers } from '@/lib/fpl';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildSquadAlerts, buildSquadReports } from '@/lib/squad-alerts';
import { buildDigestMessage, type LeagueLine, type PriceChange } from '@/lib/digest';
import { rankCaptainCandidates } from '@/lib/scoring';
import { buildTransferPlans } from '@/lib/transfers';
import { sendTelegramMessage, telegramConfigured } from '@/lib/telegram';
import type { ModelPlayer } from '@/types/fpl';

// Daily digest for the configured squad, delivered to Telegram (Vercel cron).
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FPL_ENTRY_ID, FPL_LEAGUE_ID (opt),
//      CRON_SECRET (opt).
export const maxDuration = 60;

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!telegramConfigured()) {
        return NextResponse.json({ ok: false, skipped: 'telegram-not-configured' });
    }

    const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
    if (!boot) return NextResponse.json({ error: 'FPL API unavailable' });

    const next = nextEvent(boot.events);
    const completed = boot.events.filter((event) => event.finished).length;
    const players = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completed);

    const entryId = process.env.FPL_ENTRY_ID;
    const event = currentEvent(boot.events);
    const picks = entryId && event?.id ? await getEntryPicks(entryId, event.id) : null;
    const squadIds = picks?.picks?.map((pick) => pick.element) || [];
    if (!squadIds.length) {
        return NextResponse.json({ ok: false, skipped: 'no-squad', hint: 'Set FPL_ENTRY_ID (public picks required).' });
    }

    // Estimate selling price from team value so transfer plans are affordable.
    const marketSum = squadIds.reduce((sum, id) => sum + (players.find((p) => p.id === id)?.price || 0), 0);
    const teamValue = Number((picks?.entry_history?.value || 0) / 10);
    const sellRatio = marketSum > 0 && teamValue > 0 ? Math.min(1, teamValue / marketSum) : 1;
    const bank = Number((picks?.entry_history?.bank || 0) / 10);

    const squad: ModelPlayer[] = players
        .filter((player) => squadIds.includes(player.id))
        .map((player) => ({ ...player, sellingPrice: Number((player.price * sellRatio).toFixed(1)) }));

    // Enrich only the squad with news (accurate but cheap).
    const enriched = applyExternalNewsSignals(squad, await getExternalNewsSignals(squad, squadIds));

    const alerts = buildSquadAlerts(enriched);
    const reports = buildSquadReports(enriched);

    // Captain / vice from the squad (fall back to top expected points).
    const captainRanked = rankCaptainCandidates(enriched, 3);
    const captainFallback = [...enriched]
        .filter((p) => p.position !== 'GKP')
        .sort((a, b) => b.expectedPoints - a.expectedPoints);
    const capList = captainRanked.length ? captainRanked : captainFallback;
    const captain = capList[0] ? { name: capList[0].name, team: capList[0].team, points: capList[0].expectedPoints } : null;
    const vice = capList[1] ? { name: capList[1].name, team: capList[1].team, points: capList[1].expectedPoints } : null;

    // Recommended transfer plan (hold / 1 / 2 / hit).
    const plans = buildTransferPlans(enriched, players, bank, 1);
    const recommended = plans.find((plan) => plan.recommended) || plans[0] || null;
    const transfer = recommended
        ? {
              label: recommended.label,
              moves: (recommended.moves || []).map((move: { out: string; in: string }) => `${move.out} → ${move.in}`),
              netGain: recommended.netGain,
          }
        : null;

    // Price changes this event for squad players.
    const priceChanges: PriceChange[] = boot.elements
        .filter((element) => squadIds.includes(element.id) && Number(element.cost_change_event || 0) !== 0)
        .map((element) => ({ name: element.web_name, delta: Number(element.cost_change_event || 0) / 10 }));

    // Mini-league standings/gap.
    let league: LeagueLine | null = null;
    const leagueId = process.env.FPL_LEAGUE_ID;
    if (leagueId && entryId) {
        const standings = await getLeague(leagueId);
        const results = standings?.standings?.results || [];
        const meIndex = results.findIndex((row) => row.entry === Number(entryId));
        if (meIndex >= 0) {
            const me = results[meIndex];
            league = {
                name: standings?.league?.name || 'League',
                rank: me.rank,
                entries: results.length,
                gapToLeader: (results[0]?.total || me.total) - me.total,
                gapAbove: meIndex > 0 ? (results[meIndex - 1]?.total || me.total) - me.total : 0,
            };
        }
    }

    const message = buildDigestMessage({
        eventName: next?.name,
        deadlineIso: next?.deadline_time,
        nowMs: Date.now(),
        alerts,
        captain,
        vice,
        transfer,
        priceChanges,
        league,
        reports,
    });

    const result = await sendTelegramMessage(message);
    return NextResponse.json({
        ok: result.ok,
        sections: { alerts: alerts.length, reports: reports.length, priceChanges: priceChanges.length, league: Boolean(league), transfer: Boolean(transfer) },
        ...(result.error ? { error: result.error } : {}),
    });
}

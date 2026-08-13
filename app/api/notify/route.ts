import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntryPicks, getFixtures, getLeague, nextEvent, toModelPlayers } from '@/lib/fpl';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildSquadAlerts, buildSquadReports } from '@/lib/squad-alerts';
import { buildDigestMessage, type LeagueLine, type PriceChange } from '@/lib/digest';
import { rankCaptainCandidates } from '@/lib/scoring';
import { buildTransferPlans } from '@/lib/transfers';
import { predictPriceMoves, isLikelyMove } from '@/lib/price-predictor';
import { sendTelegramMessage, telegramConfigured, telegramStatus } from '@/lib/telegram';
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
        // `have` shows which half is missing (token vs chat) without leaking values.
        return NextResponse.json({ ok: false, skipped: 'telegram-not-configured', have: telegramStatus() });
    }

    const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
    if (!boot) return NextResponse.json({ error: 'FPL API unavailable' });

    const next = nextEvent(boot.events);
    const completed = boot.events.filter((event) => event.finished).length;
    const players = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completed);

    const entryId = process.env.FPL_ENTRY_ID;
    const event = currentEvent(boot.events);
    const picks = entryId && event?.id ? await getEntryPicks(entryId, event.id) : null;
    const pickIds = picks?.picks?.map((pick) => pick.element) || [];
    const hasSquad = pickIds.length >= 11;

    // In-season we analyse the owner's real squad. Before the season (or before
    // the current GW's picks are public) we fall back to a "watchlist" of the
    // most relevant players so the digest still delivers transfer / injury /
    // team news, price changes, the deadline and captain ideas year-round.
    const relevance = (p: ModelPlayer) => p.expectedPoints + p.valueScore * 0.4 + p.ownership * 0.03;
    const focusIds = hasSquad
        ? pickIds
        : [...players].sort((a, b) => relevance(b) - relevance(a)).slice(0, 24).map((p) => p.id);

    const teamValue = Number((picks?.entry_history?.value || 0) / 10);
    const marketSum = focusIds.reduce((sum, id) => sum + (players.find((p) => p.id === id)?.price || 0), 0);
    const sellRatio = hasSquad && marketSum > 0 && teamValue > 0 ? Math.min(1, teamValue / marketSum) : 1;
    const bank = Number((picks?.entry_history?.bank || 0) / 10);

    const focus: ModelPlayer[] = players
        .filter((player) => focusIds.includes(player.id))
        .map((player) => ({ ...player, sellingPrice: Number((player.price * sellRatio).toFixed(1)) }));

    const enriched = applyExternalNewsSignals(focus, await getExternalNewsSignals(focus, focusIds));

    const alerts = buildSquadAlerts(enriched);
    const reports = buildSquadReports(enriched);

    // Captain / vice (fall back to top expected points).
    const captainRanked = rankCaptainCandidates(enriched, 3);
    const captainFallback = [...enriched]
        .filter((p) => p.position !== 'GKP')
        .sort((a, b) => b.expectedPoints - a.expectedPoints);
    const capList = captainRanked.length ? captainRanked : captainFallback;
    const captain = capList[0] ? { name: capList[0].name, team: capList[0].team, points: capList[0].expectedPoints } : null;
    const vice = capList[1] ? { name: capList[1].name, team: capList[1].team, points: capList[1].expectedPoints } : null;

    // Recommended transfer plan only makes sense for a real squad.
    let transfer: { label: string; moves: string[]; netGain: number } | null = null;
    if (hasSquad) {
        const plans = buildTransferPlans(enriched, players, bank, 1);
        const recommended = plans.find((plan) => plan.recommended) || plans[0] || null;
        transfer = recommended
            ? {
                  label: recommended.label,
                  moves: (recommended.moves || []).map((move: { out: string; in: string }) => `${move.out} → ${move.in}`),
                  netGain: recommended.netGain,
              }
            : null;
    }

    // Price changes this event across the focus set.
    const priceChanges: PriceChange[] = boot.elements
        .filter((element) => focusIds.includes(element.id) && Number(element.cost_change_event || 0) !== 0)
        .map((element) => ({ name: element.web_name, delta: Number(element.cost_change_event || 0) / 10 }));

    // Predicted price rises/falls from transfer momentum (estimate). Warn about
    // owned players likely to fall (sell first) and flag rising players to buy.
    const { risers, fallers } = predictPriceMoves(boot.elements, boot.total_players || 0);
    const focusSet = new Set(focusIds);
    const priceWatch = {
        falling: fallers.filter((m) => focusSet.has(m.id) && isLikelyMove(m.momentum)).map((m) => ({ name: m.name, net: m.net })),
        rising: risers.filter((m) => !focusSet.has(m.id) && isLikelyMove(m.momentum)).slice(0, 5).map((m) => ({ name: m.name, net: m.net })),
    };

    // Mini-league standings/gap (skip before anyone has points).
    let league: LeagueLine | null = null;
    const leagueId = process.env.FPL_LEAGUE_ID;
    if (leagueId && entryId) {
        const standings = await getLeague(leagueId);
        const results = standings?.standings?.results || [];
        const meIndex = results.findIndex((row) => row.entry === Number(entryId));
        if (meIndex >= 0 && (results[0]?.total || 0) > 0) {
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

    const note = hasSquad
        ? undefined
        : 'ℹ️ Таны багийн picks нээгдээгүй (pre-season) тул хамгийн чухал тоглогчид дээр мэдээ/шинжилгээ (watchlist).';

    const message = buildDigestMessage({
        eventName: next?.name,
        note,
        deadlineIso: next?.deadline_time,
        nowMs: Date.now(),
        alerts,
        captain,
        vice,
        transfer,
        priceChanges,
        priceWatch,
        league,
        reports,
    });

    const result = await sendTelegramMessage(message);
    return NextResponse.json({
        ok: result.ok,
        mode: hasSquad ? 'squad' : 'watchlist',
        sections: { alerts: alerts.length, reports: reports.length, priceChanges: priceChanges.length, league: Boolean(league), transfer: Boolean(transfer) },
        ...(result.error ? { error: result.error } : {}),
    });
}

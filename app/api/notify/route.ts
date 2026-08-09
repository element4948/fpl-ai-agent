import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntryPicks, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildSquadAlerts, formatAlertsMessage } from '@/lib/squad-alerts';
import { sendTelegramMessage, telegramConfigured } from '@/lib/telegram';

// Daily digest for the configured squad, delivered to Telegram. Triggered by a
// Vercel cron (see vercel.json). Env:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  — delivery target
//   FPL_ENTRY_ID                          — which squad to analyse
//   CRON_SECRET (optional)                — protects the endpoint from public calls
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

    // Resolve the owner's current squad from the public picks endpoint.
    const entryId = process.env.FPL_ENTRY_ID;
    let squadIds: number[] = [];
    if (entryId) {
        const event = currentEvent(boot.events);
        const picks = event?.id ? await getEntryPicks(entryId, event.id) : null;
        squadIds = picks?.picks?.map((pick) => pick.element) || [];
    }
    const squad = squadIds.length ? players.filter((player) => squadIds.includes(player.id)) : [];
    if (!squad.length) {
        return NextResponse.json({ ok: false, skipped: 'no-squad', hint: 'Set FPL_ENTRY_ID (picks must be public for the current GW).' });
    }

    // Enrich only the squad with news so alerts are accurate but cheap.
    const enriched = applyExternalNewsSignals(squad, await getExternalNewsSignals(squad, squadIds));
    const alerts = buildSquadAlerts(enriched);
    const result = await sendTelegramMessage(formatAlertsMessage(alerts, next?.name));

    return NextResponse.json({
        ok: result.ok,
        alerts: alerts.length,
        sent: result.ok,
        ...(result.error ? { error: result.error } : {}),
    });
}

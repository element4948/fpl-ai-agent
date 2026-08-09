import { NextResponse } from 'next/server';
import { currentEvent, getBootstrap, getEntryPicks, getFixtures, nextEvent, toModelPlayers } from '@/lib/fpl';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildSquadAlerts } from '@/lib/squad-alerts';
import { sendTelegramMessage, telegramConfigured, telegramStatus } from '@/lib/telegram';
import { alertKey, markAlertSent, wasAlertSent } from '@/lib/alert-store';
import type { ModelPlayer } from '@/types/fpl';

// Urgent tier: run frequently (e.g. every 30 min via GitHub Actions) and push
// ONLY new high-severity items (confirmed injuries / ruled out / suspensions /
// confirmed transfers) the moment they appear. KV dedup stops repeats.
export const maxDuration = 60;

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!telegramConfigured()) {
        return NextResponse.json({ ok: false, skipped: 'telegram-not-configured', have: telegramStatus() });
    }

    const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
    if (!boot) return NextResponse.json({ error: 'FPL API unavailable' });

    const next = nextEvent(boot.events);
    const completed = boot.events.filter((e) => e.finished).length;
    const players = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completed);

    // Focus = the owner's squad in-season, else a watchlist of top players.
    const entryId = process.env.FPL_ENTRY_ID;
    const event = currentEvent(boot.events);
    const picks = entryId && event?.id ? await getEntryPicks(entryId, event.id) : null;
    const pickIds = picks?.picks?.map((p) => p.element) || [];
    const relevance = (p: ModelPlayer) => p.expectedPoints + p.valueScore * 0.4 + p.ownership * 0.03;
    const focusIds = pickIds.length >= 11
        ? pickIds
        : [...players].sort((a, b) => relevance(b) - relevance(a)).slice(0, 24).map((p) => p.id);

    const focus = players.filter((p) => focusIds.includes(p.id));
    const enriched = applyExternalNewsSignals(focus, await getExternalNewsSignals(focus, focusIds));

    // Only high-severity items count as urgent.
    const urgent = buildSquadAlerts(enriched).filter((a) => a.severity === 'high');

    // Skip anything already sent (KV dedup). Collect genuinely new ones.
    const fresh: typeof urgent = [];
    for (const alert of urgent) {
        const key = alertKey(alert.playerId, alert.message);
        if (await wasAlertSent(key)) continue;
        fresh.push(alert);
    }

    if (!fresh.length) {
        return NextResponse.json({ ok: true, sent: 0 });
    }

    const lines = fresh.slice(0, 15).map((a) => `🔴 ${a.name} (${a.team}): ${a.message}`);
    const message = `🚨 Яаралтай FPL мэдэгдэл\n\n${lines.join('\n')}`;
    const result = await sendTelegramMessage(message);

    // Only mark as sent if delivery succeeded, so a failed send retries next run.
    if (result.ok) {
        for (const alert of fresh) await markAlertSent(alertKey(alert.playerId, alert.message));
    }

    return NextResponse.json({ ok: result.ok, sent: result.ok ? fresh.length : 0, ...(result.error ? { error: result.error } : {}) });
}

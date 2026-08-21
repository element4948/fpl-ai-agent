import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildDigestMessage } from '@/lib/digest';
import { sendTelegramMessage, telegramConfigured, telegramStatus } from '@/lib/telegram';
import { gatherDigest } from '@/lib/notify-core';
import { markAlertSent, setLastDigest, wasAlertSent } from '@/lib/alert-store';
import { sessionIsValid } from '@/lib/cloud-profile-server';

// On-demand "get the latest news" button target.
// Sends one fresh digest from the CURRENT state, headed with how many items are
// genuinely new since the last send. It deliberately does not re-send the old
// digest first; two near-identical messages made the action hard to interpret.
// A short KV cooldown stops rapid double-clicks from spamming Telegram.
export const maxDuration = 60;

async function handle() {
    // Sending a Telegram message is an external side effect. In production it
    // must only be triggered by the signed-in owner; development remains easy
    // to test without cloud-profile configuration.
    if (process.env.NODE_ENV === 'production') {
        const store = await cookies();
        if (!sessionIsValid(store.get('fpl-ai-session')?.value)) {
            return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
        }
    }
    if (!telegramConfigured()) {
        return NextResponse.json({ ok: false, skipped: 'telegram-not-configured', have: telegramStatus() });
    }

    // Light anti-spam: at most one manual refresh per 30s (only if KV is set).
    const COOLDOWN_KEY = 'fpl:refresh-cooldown';
    if (await wasAlertSent(COOLDOWN_KEY)) {
        return NextResponse.json({ ok: false, skipped: 'cooldown', retryInSeconds: 30 });
    }

    const data = await gatherDigest();
    if (!data.ok) return NextResponse.json({ ok: false, error: data.reason || 'FPL API unavailable' });

    // Work out what is NEW since the last send (unseen dedup keys).
    let newCount = 0;
    for (const key of data.itemKeys) {
        if (!(await wasAlertSent(key))) newCount += 1;
    }
    const freshHeadline =
        newCount > 0
            ? `🆕 Сүүлийн мэдэгдлээс хойш ${newCount} шинэ чухал зүйл илэрлээ.`
            : '🆕 Сүүлийн мэдэгдлээс хойш шинэ чухал зүйл алга — доор одоогийн байдал.';

    const message = buildDigestMessage({
        eventName: data.eventName,
        note: data.note,
        deadlineIso: data.deadlineIso,
        nowMs: Date.now(),
        hasSquad: data.hasSquad,
        alerts: data.alerts,
        targetAlerts: data.targetAlerts,
        captain: data.captain,
        vice: data.vice,
        transfer: data.transfer,
        entry: data.entry,
        differential: data.differential,
        chip: data.chip,
        coverage: data.coverage,
        priceChanges: data.priceChanges,
        priceWatch: data.priceWatch,
        league: data.league,
        reports: data.reports,
        globalNews: data.globalNews,
        freshHeadline,
    });

    const result = await sendTelegramMessage(message);

    if (result.ok) {
        await setLastDigest(message);
        for (const key of data.itemKeys) await markAlertSent(key);
        await markAlertSent(COOLDOWN_KEY, 30);
    }

    return NextResponse.json({
        ok: result.ok,
        resentPrevious: false,
        newSinceLast: newCount,
        mode: data.hasSquad ? 'squad' : 'watchlist',
        ...(result.error ? { error: result.error } : {}),
    });
}

export async function POST() {
    return handle();
}

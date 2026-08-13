import { NextResponse } from 'next/server';
import { buildDigestMessage } from '@/lib/digest';
import { sendTelegramMessage, telegramConfigured, telegramStatus } from '@/lib/telegram';
import { gatherDigest } from '@/lib/notify-core';
import { getLastDigest, markAlertSent, setLastDigest, wasAlertSent } from '@/lib/alert-store';

// On-demand "get the latest news" button target. It does two things the user
// asked for, in one click:
//   1. Re-sends the most recently sent digest (verbatim), if we have one stored.
//   2. Sends a fresh digest built from the CURRENT state, headed with how many
//      items are genuinely NEW since that last send.
// A short KV cooldown stops rapid double-clicks from spamming Telegram.
export const maxDuration = 60;

async function handle() {
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

    // (1) Re-send the previous digest verbatim, if one is stored.
    const previous = await getLastDigest();
    let resentPrevious = false;
    if (previous) {
        const resend = await sendTelegramMessage(`🔁 Өмнөх мэдэгдэл (давтан илгээв):\n\n${previous}`);
        resentPrevious = resend.ok;
    }

    // (2) Work out what is NEW since the last send (unseen dedup keys).
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
        alerts: data.alerts,
        captain: data.captain,
        vice: data.vice,
        transfer: data.transfer,
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
        resentPrevious,
        newSinceLast: newCount,
        mode: data.hasSquad ? 'squad' : 'watchlist',
        ...(result.error ? { error: result.error } : {}),
    });
}

export async function POST() {
    return handle();
}

// GET allowed too (e.g. quick manual test in a browser).
export async function GET() {
    return handle();
}

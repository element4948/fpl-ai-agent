import { NextResponse } from 'next/server';
import { buildDigestMessage } from '@/lib/digest';
import { sendTelegramMessage, telegramConfigured, telegramStatus } from '@/lib/telegram';
import { gatherDigest } from '@/lib/notify-core';
import { markAlertSent, setLastDigest } from '@/lib/alert-store';

// Daily digest for the configured squad + FPL-wide news, delivered to Telegram
// (Vercel cron). Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FPL_ENTRY_ID,
// FPL_LEAGUE_ID (opt), CRON_SECRET (opt), KV/Upstash (opt, for the refresh button).
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

    const data = await gatherDigest();
    if (!data.ok) return NextResponse.json({ error: data.reason || 'FPL API unavailable' });

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
    });

    const result = await sendTelegramMessage(message);

    // Remember what was sent so the on-demand button can (a) re-send it and
    // (b) work out what is genuinely new next time.
    if (result.ok) {
        await setLastDigest(message);
        for (const key of data.itemKeys) await markAlertSent(key);
    }

    return NextResponse.json({
        ok: result.ok,
        mode: data.hasSquad ? 'squad' : 'watchlist',
        sections: {
            alerts: data.alerts.length,
            targetAlerts: data.targetAlerts.length,
            reports: data.reports.length,
            priceChanges: data.priceChanges.length,
            league: Boolean(data.league),
            transfer: Boolean(data.transfer),
            differential: Boolean(data.differential),
            chip: Boolean(data.chip),
            globalInjuries: data.globalNews.injuries.length,
            bestFixtures: data.globalNews.bestFixtures.length,
        },
        ...(result.error ? { error: result.error } : {}),
    });
}

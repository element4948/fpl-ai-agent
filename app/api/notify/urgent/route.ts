import { NextResponse } from 'next/server';
import { alertKey, alertStoreConfigured, markAlertSent, wasAlertSent } from '@/lib/alert-store';
import { buildDeadlineAlert, deadlineWindow } from '@/lib/deadline-alert';
import { gatherDigest } from '@/lib/notify-core';
import { sendTelegramMessage, telegramConfigured, telegramStatus } from '@/lib/telegram';

// Frequent change monitor: sends newly discovered high-severity news and
// deduplicated 24h / 6h / 90m decision reminders. KV is required for deadline
// reminders so a missing store can never spam the owner on every cron run.
export const maxDuration = 60;

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!telegramConfigured()) {
        return NextResponse.json({ ok: false, skipped: 'telegram-not-configured', have: telegramStatus() });
    }

    const data = await gatherDigest();
    if (!data.ok) return NextResponse.json({ error: data.reason || 'FPL API unavailable' });

    const highAlerts = data.alerts.filter((alert) => alert.severity === 'high');
    const freshAlerts = [] as typeof highAlerts;
    const sentKeys: string[] = [];
    for (const alert of highAlerts) {
        const key = alertKey(alert.playerId, alert.message);
        if (await wasAlertSent(key)) continue;
        freshAlerts.push(alert);
        sentKeys.push(key);
    }

    const blocks: string[] = [];
    if (freshAlerts.length) {
        const lines = freshAlerts.slice(0, 15).map((alert) => `🔴 ${alert.name} (${alert.team}): ${alert.message}`);
        blocks.push(`🚨 Яаралтай FPL мэдэгдэл\n\n${lines.join('\n')}`);
    }

    const window = deadlineWindow(data.deadlineIso, Date.now());
    let deadlineIncluded = false;
    if (window && alertStoreConfigured()) {
        const reminder = buildDeadlineAlert({
            eventName: data.eventName,
            window,
            captain: data.captain,
            vice: data.vice,
            transfer: data.transfer,
            chip: data.chip,
            highRiskCount: highAlerts.length,
        });
        if (!(await wasAlertSent(reminder.key))) {
            blocks.push(reminder.message);
            sentKeys.push(reminder.key);
            deadlineIncluded = true;
        }
    }

    if (!blocks.length) {
        return NextResponse.json({
            ok: true,
            sent: 0,
            deadlineWindow: window,
            deadlineSkipped: Boolean(window && !alertStoreConfigured()),
        });
    }

    const result = await sendTelegramMessage(blocks.join('\n\n'));
    if (result.ok) {
        for (const key of sentKeys) await markAlertSent(key);
    }

    return NextResponse.json({
        ok: result.ok,
        sent: result.ok ? freshAlerts.length : 0,
        deadlineReminder: result.ok && deadlineIncluded,
        ...(result.error ? { error: result.error } : {}),
    });
}

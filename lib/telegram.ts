// Minimal Telegram sender. Credentials come from env (never hard-coded):
//   TELEGRAM_BOT_TOKEN  — from BotFather
//   TELEGRAM_CHAT_ID    — the chat/channel to deliver to
// No-ops cleanly when not configured so the rest of the app is unaffected.

export type TelegramResult = { ok: boolean; skipped?: boolean; error?: string };

export function telegramConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(text: string): Promise<TelegramResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return { ok: false, skipped: true };
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return { ok: false, error: `Telegram ${response.status}` };
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'send failed' };
    }
}

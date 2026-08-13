// Telegram sender. Credentials come from env (never hard-coded). To work with
// whatever names an earlier setup used, we accept common aliases:
//   token: TELEGRAM_BOT_TOKEN | TELEGRAM_TOKEN | TG_BOT_TOKEN | BOT_TOKEN
//   chat:  TELEGRAM_CHAT_ID | TELEGRAM_CHAT | TG_CHAT_ID | CHAT_ID
// No-ops cleanly when not configured so the rest of the app is unaffected.

const TOKEN_KEYS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_TOKEN', 'TG_BOT_TOKEN', 'BOT_TOKEN'];
const CHAT_KEYS = ['TELEGRAM_CHAT_ID', 'TELEGRAM_CHAT', 'TG_CHAT_ID', 'CHAT_ID'];

export type TelegramResult = { ok: boolean; skipped?: boolean; error?: string };

// Telegram accepts at most 4096 UTF-16 characters per text message. Keep
// headroom for the part indicator and split on readable boundaries so a long
// FPL digest is delivered in full instead of being rejected.
const TELEGRAM_MESSAGE_LIMIT = 3900;

export function splitTelegramMessage(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let remaining = text.trim();
    while (remaining.length > limit) {
        const window = remaining.slice(0, limit + 1);
        const paragraphBreak = window.lastIndexOf('\n\n');
        const lineBreak = window.lastIndexOf('\n');
        const minimumReadableChunk = Math.floor(limit * 0.55);
        const splitAt = paragraphBreak >= minimumReadableChunk
            ? paragraphBreak
            : lineBreak >= minimumReadableChunk
              ? lineBreak
              : limit;
        chunks.push(remaining.slice(0, splitAt).trimEnd());
        remaining = remaining.slice(splitAt).trimStart();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

function firstEnv(keys: string[]): string | undefined {
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) return value.trim();
    }
    return undefined;
}

/** Presence of credentials (booleans only — never leaks values). */
export function telegramStatus(): { token: boolean; chat: boolean } {
    return { token: Boolean(firstEnv(TOKEN_KEYS)), chat: Boolean(firstEnv(CHAT_KEYS)) };
}

export function telegramConfigured(): boolean {
    const status = telegramStatus();
    return status.token && status.chat;
}

export async function sendTelegramMessage(text: string): Promise<TelegramResult> {
    const token = firstEnv(TOKEN_KEYS);
    const chatId = firstEnv(CHAT_KEYS);
    if (!token || !chatId) return { ok: false, skipped: true };
    try {
        const chunks = splitTelegramMessage(text);
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks.length > 1
                ? `${index + 1}/${chunks.length}\n${chunks[index]}`
                : chunks[index];
            const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
                signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                return {
                    ok: false,
                    error: `Telegram ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
                };
            }
        }
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'send failed' };
    }
}

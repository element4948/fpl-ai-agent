// Tiny KV-backed "already sent" store so urgent alerts are not re-sent every
// run. Uses the same Upstash/Vercel KV REST env the app already supports. When
// KV is not configured it degrades to "nothing remembered" (urgent alerts may
// repeat) rather than failing.

function kvConfig(): { url: string; token: string } | null {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? { url, token } : null;
}

export function alertStoreConfigured(): boolean {
    return Boolean(kvConfig());
}

/** Stable short key for an alert (player + message), safe for KV keys. */
export function alertKey(playerId: number, message: string): string {
    let hash = 5381;
    for (let i = 0; i < message.length; i++) hash = ((hash << 5) + hash + message.charCodeAt(i)) >>> 0;
    return `fplalert:${playerId}:${hash}`;
}

export async function wasAlertSent(key: string): Promise<boolean> {
    const cfg = kvConfig();
    if (!cfg) return false;
    try {
        const response = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data?.result != null;
    } catch {
        return false;
    }
}

export async function markAlertSent(key: string, ttlSeconds = 172800): Promise<void> {
    const cfg = kvConfig();
    if (!cfg) return;
    try {
        await fetch(`${cfg.url}/setex/${encodeURIComponent(key)}/${ttlSeconds}/1`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.token}` },
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // Best-effort; a failed write just risks a duplicate next run.
    }
}

const LAST_DIGEST_KEY = 'fpl:last-digest';

/** The verbatim text of the most recently sent digest (for the re-send button). */
export async function getLastDigest(): Promise<string | null> {
    const cfg = kvConfig();
    if (!cfg) return null;
    try {
        const response = await fetch(`${cfg.url}/get/${encodeURIComponent(LAST_DIGEST_KEY)}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return typeof data?.result === 'string' ? data.result : null;
    } catch {
        return null;
    }
}

export async function setLastDigest(text: string, ttlSeconds = 1_209_600): Promise<void> {
    const cfg = kvConfig();
    if (!cfg) return;
    try {
        // Store via POST body so newlines / long text are not lost in the URL path.
        await fetch(`${cfg.url}/set/${encodeURIComponent(LAST_DIGEST_KEY)}?EX=${ttlSeconds}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.token}`, 'content-type': 'text/plain' },
            body: text,
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // Best-effort.
    }
}

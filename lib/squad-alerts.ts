import type { ModelPlayer } from '@/types/fpl';

// Build a concise, prioritised list of noteworthy items for the owner's squad:
// injuries / availability, confirmed transfer / rotation / injury news,
// rotation risk, and tough upcoming fixtures. Designed for a Telegram digest.

export type SquadAlert = {
    playerId: number;
    name: string;
    team: string;
    kind: 'injury' | 'availability' | 'transfer' | 'rotation' | 'news' | 'fixture';
    severity: 'high' | 'medium' | 'low';
    message: string;
};

const SEVERITY_RANK: Record<SquadAlert['severity'], number> = { high: 0, medium: 1, low: 2 };

export function buildSquadAlerts(squad: ModelPlayer[]): SquadAlert[] {
    const alerts: SquadAlert[] = [];

    for (const player of squad) {
        const base = { playerId: player.id, name: player.name, team: player.team };

        // Official FPL availability (status other than 'a' = available).
        if (player.status && player.status !== 'a') {
            const severity: SquadAlert['severity'] =
                player.status === 'i' || player.status === 'o' || player.status === 's' ? 'high' : 'medium';
            alerts.push({ ...base, kind: 'availability', severity, message: player.news || `Availability status: ${player.status}` });
        } else if (player.news) {
            alerts.push({ ...base, kind: 'news', severity: 'low', message: player.news });
        }

        // Verified external news (transfer / injury / rotation).
        for (const signal of player.externalNews || []) {
            if (signal.verification === 'confirmed' || signal.verification === 'corroborated') {
                const kind: SquadAlert['kind'] =
                    signal.category === 'injury'
                        ? 'injury'
                        : signal.category === 'transfer'
                          ? 'transfer'
                          : signal.category === 'rotation'
                            ? 'rotation'
                            : 'news';
                alerts.push({ ...base, kind, severity: signal.severity, message: signal.headline });
            }
        }

        // Rotation risk even when officially available.
        if ((player.status === 'a' || !player.status) && player.starterConfidence < 45) {
            alerts.push({
                ...base,
                kind: 'rotation',
                severity: 'medium',
                message: `Гарааны эргэлзээ (starter ${player.starterConfidence}%, ~${player.predictedMinutes}' таамаг)`,
            });
        }

        // Tough next fixture.
        if ((player.fixture?.nextDifficulty ?? 0) >= 4) {
            alerts.push({
                ...base,
                kind: 'fixture',
                severity: 'low',
                message: `Хүнд тоглолт: ${player.fixture?.nextOpponent ?? 'TBD'} (FDR ${player.fixture?.nextDifficulty})`,
            });
        }
    }

    // Dedup identical (player, message) and sort most-severe first.
    const seen = new Set<string>();
    return alerts
        .filter((alert) => {
            const key = `${alert.playerId}:${alert.message}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function formatAlertsMessage(alerts: SquadAlert[], eventName?: string): string {
    const header = `⚽ FPL багийн мэдэгдэл${eventName ? ` — ${eventName}` : ''}`;
    if (!alerts.length) return `${header}\n\nОдоогоор багт чинь чухал шинэ мэдээ алга. ✅`;
    const icon: Record<SquadAlert['severity'], string> = { high: '🔴', medium: '🟡', low: '⚪' };
    const lines = alerts.slice(0, 20).map((alert) => `${icon[alert.severity]} ${alert.name} (${alert.team}): ${alert.message}`);
    return `${header}\n\n${lines.join('\n')}`;
}

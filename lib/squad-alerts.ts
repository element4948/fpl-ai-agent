import type { ModelPlayer } from '@/types/fpl';
import { mnCategory, mnFplNews, mnStatus, withSource } from './mn';

// Build a concise, prioritised list of noteworthy items for the owner's squad:
// injuries / availability, confirmed transfer / rotation / injury news,
// rotation risk, and tough upcoming fixtures. Designed for a Telegram digest.
// The message BODY is in Mongolian; the concise ORIGINAL source snippet
// (English) is attached untranslated via `withSource`.

export type SquadAlert = {
    playerId: number;
    name: string;
    team: string;
    kind: 'injury' | 'availability' | 'transfer' | 'rotation' | 'news' | 'fixture';
    severity: 'high' | 'medium' | 'low';
    message: string;
};

const SEVERITY_RANK: Record<SquadAlert['severity'], number> = { high: 0, medium: 1, low: 2 };

// Keep the original-language source text but concise: drop the trailing
// " - Publisher" that Google News appends and cap the length. We deliberately
// do NOT translate — a short accurate source snippet beats a wrong translation.
function concise(headline: string): string {
    const noSource = headline.replace(/\s+[-–|]\s+[^-–|]+$/, '').trim();
    const text = noSource || headline.trim();
    return text.length > 90 ? `${text.slice(0, 88).trimEnd()}…` : text;
}

export function buildSquadAlerts(squad: ModelPlayer[]): SquadAlert[] {
    const alerts: SquadAlert[] = [];

    for (const player of squad) {
        const base = { playerId: player.id, name: player.name, team: player.team };

        // Official FPL availability (status other than 'a' = available). Body in
        // Mongolian (translated from FPL's own text); concise English source kept.
        if (player.status && player.status !== 'a') {
            const severity: SquadAlert['severity'] =
                player.status === 'i' || player.status === 'o' || player.status === 's' ? 'high' : 'medium';
            const mn = player.news ? mnFplNews(player.news) : mnStatus(player.status);
            alerts.push({ ...base, kind: 'availability', severity, message: withSource(mn || mnStatus(player.status), player.news) });
        } else if (player.news) {
            alerts.push({ ...base, kind: 'news', severity: 'low', message: withSource(mnFplNews(player.news) || 'Мэдээ', player.news) });
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
                // Mongolian category label as the body; concise English headline
                // + source name attached untranslated so the original is visible.
                alerts.push({
                    ...base,
                    kind,
                    severity: signal.severity,
                    message: withSource(mnCategory(signal.category), concise(signal.headline), signal.source),
                });
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

/**
 * Reliable-reporter news that is not yet officially confirmed (single source,
 * reliable tier — e.g. BBC, Sky, established transfer reporters). This is the
 * feasible proxy for "analyst / social" signal without paid feeds or scraping;
 * surfaced separately and clearly labelled as unconfirmed.
 */
export function buildSquadReports(squad: ModelPlayer[]): SquadAlert[] {
    const reports: SquadAlert[] = [];
    for (const player of squad) {
        for (const signal of player.externalNews || []) {
            if (signal.verification === 'single-source' && signal.tier === 'reliable') {
                reports.push({
                    playerId: player.id,
                    name: player.name,
                    team: player.team,
                    kind: signal.category === 'transfer' ? 'transfer' : signal.category === 'injury' ? 'injury' : 'news',
                    severity: 'low',
                    message: withSource(mnCategory(signal.category), concise(signal.headline), signal.source),
                });
            }
        }
    }
    const seen = new Set<string>();
    return reports.filter((report) => {
        const key = `${report.playerId}:${report.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function formatAlertsMessage(alerts: SquadAlert[], eventName?: string): string {
    const header = `⚽ FPL багийн мэдэгдэл${eventName ? ` — ${eventName}` : ''}`;
    if (!alerts.length) return `${header}\n\nОдоогоор багт чинь чухал шинэ мэдээ алга. ✅`;
    const icon: Record<SquadAlert['severity'], string> = { high: '🔴', medium: '🟡', low: '⚪' };
    const lines = alerts.slice(0, 20).map((alert) => `${icon[alert.severity]} ${alert.name} (${alert.team}): ${alert.message}`);
    return `${header}\n\n${lines.join('\n')}`;
}

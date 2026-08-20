import type { UserSettings } from '@/types/fpl';

// Client-side caches for the dashboard and weekly decision. Separated from the
// page component so persistence logic is testable and not entangled with UI.

const DASHBOARD_CACHE_KEY = 'fpl-ai-dashboard-cache-v8';
const DASHBOARD_CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
const DECISION_CACHE_KEY = 'fpl-ai-decision-cache-v1';
const DECISION_CACHE_MAX_AGE = 30 * 60 * 1000;

export function readDashboardCache(): any {
    if (typeof window === 'undefined') return null;
    try {
        const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || 'null');
        if (!cached?.savedAt || !cached?.data) return null;
        return Date.now() - cached.savedAt <= DASHBOARD_CACHE_MAX_AGE ? cached.data : null;
    } catch {
        return null;
    }
}

export function writeDashboardCache(data: any) {
    if (typeof window === 'undefined' || !data?.drafts?.length || data.verificationPending) return;
    try {
        localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {
        // Storage may be unavailable or full. Network loading remains usable.
    }
}

export function decisionSettingsKey(settings: UserSettings) {
    return JSON.stringify({
        entryId: settings.entryId || '',
        riskProfile: settings.riskProfile,
        goal: settings.goal,
        freeTransfers: settings.freeTransfers ?? 1,
        plannedSquadIds: settings.plannedSquadIds || [],
    });
}

export function readDecisionCache(settings: UserSettings): any {
    if (typeof window === 'undefined') return null;
    try {
        const cached = JSON.parse(localStorage.getItem(DECISION_CACHE_KEY) || 'null');
        if (!cached?.savedAt || cached?.settingsKey !== decisionSettingsKey(settings)) return null;
        return Date.now() - cached.savedAt <= DECISION_CACHE_MAX_AGE ? cached.data : null;
    } catch {
        return null;
    }
}

export function writeDecisionCache(settings: UserSettings, data: any) {
    if (typeof window === 'undefined' || !data) return;
    try {
        localStorage.setItem(
            DECISION_CACHE_KEY,
            JSON.stringify({
                savedAt: Date.now(),
                settingsKey: decisionSettingsKey(settings),
                data,
            }),
        );
    } catch {
        // A cache failure must not block live analysis.
    }
}

export function clearDecisionCache() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(DECISION_CACHE_KEY);
    } catch {
        // ignore
    }
}

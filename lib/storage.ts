import { UserSettings } from '@/types/fpl';
export const defaultSettings: UserSettings = { entryId: '', leagueId: '', riskProfile: 'balanced', goal: 'league', lang: 'mn', plannedSquadIds: [] };
export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') return defaultSettings;
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem('fpl-ai-settings') || '{}') }; } catch { return defaultSettings; }
}
export function saveSettings(settings: UserSettings) {
  if (typeof window !== 'undefined') localStorage.setItem('fpl-ai-settings', JSON.stringify(settings));
}

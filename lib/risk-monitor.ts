import type { ModelPlayer } from '@/types/fpl';

export type RiskMonitorReason =
  | 'official-warning'
  | 'availability'
  | 'low-starter-confidence'
  | 'unknown-data'
  | 'high-risk';

export type RiskMonitorItem = {
  player: ModelPlayer;
  severity: 'high' | 'medium' | 'low';
  score: number;
  reasons: RiskMonitorReason[];
  summary: string;
};

export function buildRiskMonitor(players: ModelPlayer[]): RiskMonitorItem[] {
  return players
    .map((player): RiskMonitorItem | null => {
      const reasons: RiskMonitorReason[] = [];
      const highSignal = player.signals.some((signal) => signal.severity === 'high');
      const mediumSignal = player.signals.some((signal) => signal.severity === 'medium');

      if (highSignal || mediumSignal) reasons.push('official-warning');
      if (player.status && player.status !== 'a') reasons.push('availability');
      if (player.starterConfidence < 55) reasons.push('low-starter-confidence');
      if (player.dataQuality === 'unknown') reasons.push('unknown-data');
      if (player.risk >= 50) reasons.push('high-risk');

      if (!reasons.length) return null;

      const score =
        (highSignal ? 100 : mediumSignal ? 55 : 0) +
        (player.status && player.status !== 'a' ? 80 : 0) +
        Math.max(0, 60 - player.starterConfidence) +
        (player.dataQuality === 'unknown' ? 35 : player.dataQuality === 'limited' ? 12 : 0) +
        player.risk;

      const severity =
        highSignal || player.status === 'i' || player.status === 'u' || player.risk >= 70
          ? 'high'
          : mediumSignal || player.starterConfidence < 45 || player.risk >= 50
            ? 'medium'
            : 'low';

      const summary =
        player.signals[0]?.message ||
        (player.dataQuality === 'unknown'
          ? 'Найдвартай минут, гарааны өгөгдөл хангалтгүй.'
          : `Starter confidence ${player.starterConfidence}%, risk ${player.risk}%.`);

      return { player, severity, score, reasons, summary };
    })
    .filter((item): item is RiskMonitorItem => item !== null)
    .sort((a, b) => b.score - a.score);
}

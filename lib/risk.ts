import type { ModelPlayer } from '@/types/fpl';

export type RiskBreakdown = {
  injury: number;
  availability: number;
  minutes: number;
  rotation: number;
  news: number;
  total: number;
  level: 'low' | 'medium' | 'high';
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function calculateRisk(player: ModelPlayer): RiskBreakdown {
  const status = player.status || 'a';
  const injury = status === 'i' ? 85 : status === 'd' ? 45 : status === 'u' ? 70 : 0;
  const rawAvailability =
    player.starterLabel === 'unavailable'
      ? 90
      : player.starterLabel === 'bench'
        ? 65
        : player.starterLabel === 'unknown'
          ? 45
          : player.starterConfidence < 60
            ? 35
            : 8;
  const availability = Math.max(
    rawAvailability,
    player.dataQuality === 'limited' ? 18 : 0,
  );
  const rawMinutes =
    player.dataQuality === 'unknown'
      ? 55
      : player.predictedMinutes < 30
        ? 70
        : player.predictedMinutes < 55
          ? 45
          : player.predictedMinutes < 70
            ? 22
            : 6;
  const minutes = Math.max(
    rawMinutes,
    player.dataQuality === 'limited' ? 25 : 0,
  );
  const rawRotation =
    player.starterLabel === 'unknown'
      ? 50
      : player.starterLabel === 'bench'
        ? 70
        : player.starterLabel === 'rotation'
          ? 45
          : player.starterLabel === 'likely'
            ? 18
            : 6;
  const rotation = Math.max(
    rawRotation,
    player.dataQuality === 'limited' ? 20 : 0,
  );
  const officialSignalSeverity = player.signals.some((signal) => signal.severity === 'high')
    ? 75
    : player.signals.some((signal) => signal.severity === 'medium')
      ? 45
      : player.signals.length
        ? 15
        : 0;
  const externalSignalSeverity = player.externalNews?.some(
    (signal) => signal.severity === 'high' && signal.tier !== 'secondary',
  )
    ? 75
    : player.externalNews?.some(
          (signal) => signal.severity === 'medium' && signal.tier !== 'secondary',
        )
      ? 45
      : 0;
  const news = Math.max(
    player.news?.trim() ? 45 : 0,
    officialSignalSeverity,
    externalSignalSeverity,
  );

  const total = clamp(Math.max(
    player.risk,
    injury * 0.25 +
      availability * 0.25 +
      minutes * 0.2 +
      rotation * 0.2 +
      news * 0.1,
  ));

  return {
    injury: clamp(injury),
    availability: clamp(availability),
    minutes: clamp(minutes),
    rotation: clamp(rotation),
    news: clamp(news),
    total,
    level: total >= 55 ? 'high' : total >= 28 ? 'medium' : 'low',
  };
}

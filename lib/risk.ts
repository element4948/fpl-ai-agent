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
  const availability =
    player.starterLabel === 'unavailable'
      ? 90
      : player.starterLabel === 'bench'
        ? 65
        : player.starterLabel === 'unknown'
          ? 45
          : player.starterConfidence < 60
            ? 35
            : 8;
  const minutes =
    player.dataQuality === 'unknown'
      ? 55
      : player.predictedMinutes < 30
        ? 70
        : player.predictedMinutes < 55
          ? 45
          : player.predictedMinutes < 70
            ? 22
            : 6;
  const rotation =
    player.starterLabel === 'unknown'
      ? 50
      : player.starterLabel === 'bench'
        ? 70
        : player.starterLabel === 'rotation'
          ? 45
          : player.starterLabel === 'likely'
            ? 18
            : 6;
  const news = player.news?.trim() ? 45 : 0;

  const total = clamp(
    injury * 0.25 +
    availability * 0.25 +
    minutes * 0.2 +
    rotation * 0.2 +
    news * 0.1,
  );

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

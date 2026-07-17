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
  const availability = player.risk >= 70 ? 55 : player.risk >= 45 ? 30 : player.risk >= 20 ? 12 : 0;
  const minutes = player.minutes < 90 ? 55 : player.minutes < 450 ? 35 : player.minutes < 900 ? 18 : 5;
  const rotation = player.minutes < 450 && player.form > 0 ? 38 : player.minutes < 900 ? 22 : 8;
  const news = player.news?.trim() ? 45 : 0;

  const total = clamp(
    injury * 0.3 +
    availability * 0.2 +
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

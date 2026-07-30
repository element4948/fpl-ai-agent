import type {
  FplPlayerHistoryItem,
  PlayerHistoryAnalysis,
} from '@/types/fpl';

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

export function analyzePlayerHistory(
  history: FplPlayerHistoryItem[] = [],
  window = 5,
): PlayerHistoryAnalysis {
  const recent = [...history]
    .sort((a, b) => a.round - b.round)
    .slice(-window);

  if (!recent.length) {
    return {
      sampleSize: 0,
      starts: 0,
      startRate: 0,
      averageMinutes: 0,
      sixtyPlusRate: 0,
      averagePoints: 0,
      recentMinutes: [],
      recentPoints: [],
      trend: 'unknown',
      dataQuality: 'unknown',
    };
  }

  const starts = recent.filter(
    (match) => (match.starts ?? (match.minutes >= 45 ? 1 : 0)) > 0,
  ).length;
  const totalMinutes = recent.reduce((sum, match) => sum + match.minutes, 0);
  const sixtyPlus = recent.filter((match) => match.minutes >= 60).length;
  const totalPoints = recent.reduce((sum, match) => sum + match.total_points, 0);
  const midpoint = Math.max(1, Math.floor(recent.length / 2));
  const early = recent.slice(0, midpoint);
  const late = recent.slice(midpoint);
  const earlyMinutes =
    early.reduce((sum, match) => sum + match.minutes, 0) / early.length;
  const lateMinutes = late.length
    ? late.reduce((sum, match) => sum + match.minutes, 0) / late.length
    : earlyMinutes;
  const change = lateMinutes - earlyMinutes;

  return {
    sampleSize: recent.length,
    starts,
    startRate: round((starts / recent.length) * 100, 0),
    averageMinutes: round(totalMinutes / recent.length),
    sixtyPlusRate: round((sixtyPlus / recent.length) * 100, 0),
    averagePoints: round(totalPoints / recent.length),
    recentMinutes: recent.map((match) => match.minutes),
    recentPoints: recent.map((match) => match.total_points),
    trend:
      recent.length < 3
        ? 'unknown'
        : change >= 15
          ? 'improving'
          : change <= -15
            ? 'declining'
            : 'stable',
    dataQuality:
      recent.length >= 5 ? 'good' : recent.length >= 2 ? 'limited' : 'unknown',
  };
}

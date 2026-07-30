import type { FplPlayer, StarterLabel } from '@/types/fpl';

export type StarterProjection = {
  confidence: number;
  predictedMinutes: number;
  label: StarterLabel;
  dataQuality: 'good' | 'limited' | 'unknown';
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function projectStarter(
  player: FplPlayer,
  completedGameweeks = 0,
): StarterProjection {
  const status = player.status || 'a';
  const starts = player.starts || 0;
  const minutes = player.minutes || 0;
  const ownership = Number(player.selected_by_percent || 0);
  const chance = player.chance_of_playing_next_round;
  const hasLiveMinutes = starts > 0 || minutes > 0;

  if (status === 'u' || status === 'i' || status === 's') {
    return {
      confidence: status === 's' ? 5 : 0,
      predictedMinutes: 0,
      label: 'unavailable',
      dataQuality: hasLiveMinutes ? 'good' : 'limited',
    };
  }

  if (chance != null && chance <= 25) {
    return {
      confidence: clamp(chance),
      predictedMinutes: clamp(chance * 0.35, 0, 20),
      label: 'unavailable',
      dataQuality: 'good',
    };
  }

  if (hasLiveMinutes) {
    const teamMatches = Math.max(1, completedGameweeks);
    const minutesPerStart = starts > 0 ? minutes / starts : minutes;
    const startRate = Math.min(1, starts / teamMatches);
    const minutesPerMatch = Math.min(90, minutes / teamMatches);
    const availability = chance == null ? 1 : chance / 100;
    const confidence = clamp(
      (15 + startRate * 58 + (minutesPerMatch / 90) * 24) * availability,
    );
    const predictedMinutes = clamp(
      (minutesPerMatch * 0.7 +
        Math.min(90, minutesPerStart) * 0.3) *
        availability,
      0,
      90,
    );

    return {
      confidence,
      predictedMinutes,
      label:
        confidence >= 82
          ? 'nailed'
          : confidence >= 65
            ? 'likely'
            : confidence >= 42
              ? 'rotation'
              : 'bench',
      dataQuality: teamMatches >= 3 && (starts >= 2 || minutes >= 120) ? 'good' : 'limited',
    };
  }

  /*
   * Pre-season public FPL data does not contain a depth chart. Ownership and
   * price are only weak market signals, so unknown players must never appear
   * as "0% risk" or a confirmed starter.
   */
  const price = player.now_cost / 10;
  const marketSignal =
    Math.min(28, ownership * 1.15) +
    Math.min(18, Math.max(0, price - 4) * 4);
  const confidence = clamp(22 + marketSignal, 15, 68);
  const predictedMinutes = clamp(12 + confidence * 0.72, 15, 62);

  return {
    confidence,
    predictedMinutes,
    label:
      confidence >= 62
        ? 'likely'
        : confidence >= 42
          ? 'rotation'
          : 'unknown',
    dataQuality: ownership >= 5 || price >= 5 ? 'limited' : 'unknown',
  };
}

export function isReliableStarter(
  player: {
    status?: string;
    starterConfidence: number;
    predictedMinutes: number;
    starterLabel: StarterLabel;
  },
  minimumConfidence = 60,
) {
  return (
    (player.status || 'a') === 'a' &&
    player.starterLabel !== 'unavailable' &&
    player.starterConfidence >= minimumConfidence &&
    player.predictedMinutes >= 55
  );
}

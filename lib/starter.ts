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

  if (hasLiveMinutes && completedGameweeks > 0) {
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

  if (hasLiveMinutes && completedGameweeks === 0) {
    const historicalStartRate = Math.min(1, starts / 38);
    const historicalMinutesRate = Math.min(1, minutes / (38 * 90));
    const marketSignal =
      Math.min(12, ownership * 0.45) +
      Math.min(8, Math.max(0, player.now_cost / 10 - 4) * 1.5);
    /*
     * Before GW1 the public API mostly contains the previous season totals.
     * Use them as a prior, but keep the result explicitly provisional. Unlike
     * the old 72/60 cap this preserves the difference between a 35-start
     * first-choice player and a 12-start rotation player.
     */
    const confidence = clamp(
      12 + historicalStartRate * 58 + historicalMinutesRate * 24 + marketSignal,
      12,
      88,
    );
    const predictedMinutes = clamp(
      8 + historicalStartRate * 58 + historicalMinutesRate * 22,
      10,
      84,
    );

    return {
      confidence,
      predictedMinutes,
      label:
        confidence >= 78
          ? 'nailed'
          : confidence >= 66
          ? 'likely'
          : confidence >= 42
            ? 'rotation'
            : 'bench',
      dataQuality: 'limited',
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
    dataQuality?: 'good' | 'limited' | 'unknown';
    roleAssessment?: { role: 'first-choice' | 'competition' | 'backup' | 'unknown' };
    externalNews?: Array<{ severity: 'low' | 'medium' | 'high'; verification: 'confirmed' | 'corroborated' | 'single-source' | 'unverified' }>;
  },
  minimumConfidence = 72,
) {
  const verifiedWarning = player.externalNews?.some(
    (signal) => signal.severity === 'high' && (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
  );
  return (
    (player.status || 'a') === 'a' &&
    player.starterLabel !== 'unavailable' &&
    player.starterLabel !== 'rotation' &&
    player.starterLabel !== 'bench' &&
    player.starterLabel !== 'unknown' &&
    player.dataQuality !== 'unknown' &&
    player.roleAssessment?.role !== 'backup' &&
    player.roleAssessment?.role !== 'competition' &&
    !verifiedWarning &&
    player.starterConfidence >= minimumConfidence &&
    player.predictedMinutes >= 65
  );
}

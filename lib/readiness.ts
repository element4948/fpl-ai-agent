import type { CalibrationResult, ModelPlayer, ModelReadiness } from '@/types/fpl';

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildModelReadiness(
  players: ModelPlayer[],
  calibration: CalibrationResult[] = [],
): ModelReadiness {
  const count = Math.max(players.length, 1);
  const goodData = players.filter((player) => player.dataQuality === 'good').length / count;
  const officialWarnings = players.filter((player) => player.signals.length > 0).length;
  const external = players.filter((player) => player.externalNews?.length).length;
  const trustedExternal = players.filter((player) =>
    player.externalNews?.some((signal) => signal.tier !== 'secondary'),
  ).length;
  const friendlyInternational = players.filter((player) =>
    player.externalNews?.some((signal) =>
      ['friendly', 'international', 'fatigue'].includes(signal.category),
    ),
  ).length;
  const calibratedEvents = calibration.length;

  return {
    rules: 95,
    squadOptimization: 85,
    officialData: 82,
    positionModels: 82,
    starterMinutes: clamp(55 + goodData * 35),
    injuryAvailability: clamp(62 + Math.min(18, officialWarnings * 2) + Math.min(10, trustedExternal)),
    transferNews: clamp(45 + Math.min(35, trustedExternal * 4)),
    friendlyInternational: clamp(25 + Math.min(55, friendlyInternational * 8)),
    multiSourceVerification: clamp(48 + Math.min(32, external * 2) + Math.min(15, trustedExternal * 2)),
    calibration: clamp(10 + calibratedEvents * 14),
    multiGameweekPlanning: 82,
  };
}

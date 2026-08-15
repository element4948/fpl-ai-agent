import type {
  CalibrationActual,
  CalibrationResult,
  ForecastSnapshot,
  ModelPlayer,
} from '@/types/fpl';

const FORECAST_KEY = 'fpl-ai-forecast-v1';
const RESULTS_KEY = 'fpl-ai-calibration-v1';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function saveForecast(
  eventId: number | undefined,
  deadline: string | undefined,
  players: ModelPlayer[],
) {
  if (!eventId || !deadline || !players.length) return;
  const existing = read<ForecastSnapshot[]>(FORECAST_KEY, []);
  if (existing.some((item) => item.eventId === eventId)) return;

  const snapshot: ForecastSnapshot = {
    eventId,
    deadline,
    createdAt: new Date().toISOString(),
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      predicted: player.projection?.next1 ?? player.expectedPoints,
    })),
  };
  write(FORECAST_KEY, [...existing, snapshot].slice(-10));
}

export function evaluateForecast(
  eventId: number | undefined,
  actuals: CalibrationActual[] | undefined,
): CalibrationResult[] {
  const existingResults = read<CalibrationResult[]>(RESULTS_KEY, []);
  if (!eventId || !actuals?.length) return existingResults;
  if (existingResults.some((item) => item.eventId === eventId)) {
    return existingResults;
  }

  const snapshots = read<ForecastSnapshot[]>(FORECAST_KEY, []);
  const snapshot = snapshots.find((item) => item.eventId === eventId);
  if (!snapshot) return existingResults;

  const actualMap = new Map(actuals.map((item) => [item.id, item.points]));
  const comparisons = snapshot.players
    .filter((player) => actualMap.has(player.id))
    .map((player) => ({
      position: player.position || 'UNKNOWN',
      predicted: player.predicted,
      actual: Number(actualMap.get(player.id)),
      error: player.predicted - Number(actualMap.get(player.id)),
    }));
  if (!comparisons.length) return existingResults;

  const result: CalibrationResult = {
    eventId,
    sampleSize: comparisons.length,
    sumPredicted: Number(comparisons.reduce((sum, item) => sum + item.predicted, 0).toFixed(2)),
    sumActual: Number(comparisons.reduce((sum, item) => sum + item.actual, 0).toFixed(2)),
    mae: Number(
      (
        comparisons.reduce((sum, item) => sum + Math.abs(item.error), 0) /
        comparisons.length
      ).toFixed(2),
    ),
    bias: Number(
      (
        comparisons.reduce((sum, item) => sum + item.error, 0) /
        comparisons.length
      ).toFixed(2),
    ),
    withinTwo: Math.round(
      (comparisons.filter((item) => Math.abs(item.error) <= 2).length /
        comparisons.length) *
        100,
    ),
    squaredErrorSum: Number(comparisons.reduce((sum, item) => sum + item.error * item.error, 0).toFixed(4)),
    perPosition: Object.fromEntries(
      [...new Set(comparisons.map((item) => item.position))].map((position) => {
        const rows = comparisons.filter((item) => item.position === position);
        return [position, {
          sampleSize: rows.length,
          sumPredicted: Number(rows.reduce((sum, item) => sum + item.predicted, 0).toFixed(2)),
          sumActual: Number(rows.reduce((sum, item) => sum + item.actual, 0).toFixed(2)),
          mae: Number((rows.reduce((sum, item) => sum + Math.abs(item.error), 0) / rows.length).toFixed(2)),
          bias: Number((rows.reduce((sum, item) => sum + item.error, 0) / rows.length).toFixed(2)),
          withinTwo: Math.round(rows.filter((item) => Math.abs(item.error) <= 2).length / rows.length * 100),
          squaredErrorSum: Number(rows.reduce((sum, item) => sum + item.error * item.error, 0).toFixed(4)),
        }];
      }),
    ),
    evaluatedAt: new Date().toISOString(),
  };
  const next = [...existingResults, result].slice(-10);
  write(RESULTS_KEY, next);
  return next;
}

export function loadCalibrationResults() {
  return read<CalibrationResult[]>(RESULTS_KEY, []);
}

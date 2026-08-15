import type {
  CalibrationActual,
  CalibrationPositionResult,
  CalibrationProfile,
  CalibrationResult,
  ForecastSnapshot,
  ModelPlayer,
} from '@/types/fpl';

const FORECAST_KEY_PREFIX = 'fpl-ai-agent:calibration:forecast:v2';
const RESULTS_KEY = 'fpl-ai-agent:calibration:results:v1';
const POSITIONS = ['GKP', 'DEF', 'MID', 'FWD'];
const MIN_EVENTS = 3;
const MIN_SAMPLES = 60;

function config() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
  };
}

export function calibrationStoreConfigured() {
  const value = config();
  return Boolean(value.url && value.token);
}

async function redis(command: unknown[]) {
  const value = config();
  if (!value.url || !value.token) return null;
  const response = await fetch(value.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${value.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Calibration storage failed (${response.status})`);
  return (await response.json()) as { result?: unknown };
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const response = await redis(['GET', key]);
  if (typeof response?.result !== 'string') return fallback;
  try { return JSON.parse(response.result) as T; } catch { return fallback; }
}

async function writeJson(key: string, value: unknown) {
  await redis(['SET', key, JSON.stringify(value)]);
}

function forecastKey(eventId: number) {
  return `${FORECAST_KEY_PREFIX}:${eventId}`;
}

function metrics(rows: Array<{ position: string; predicted: number; actual: number }>): CalibrationPositionResult {
  const errors = rows.map((row) => row.predicted - row.actual);
  return {
    sampleSize: rows.length,
    sumPredicted: Number(rows.reduce((sum, row) => sum + row.predicted, 0).toFixed(2)),
    sumActual: Number(rows.reduce((sum, row) => sum + row.actual, 0).toFixed(2)),
    mae: Number((errors.reduce((sum, error) => sum + Math.abs(error), 0) / rows.length).toFixed(2)),
    bias: Number((errors.reduce((sum, error) => sum + error, 0) / rows.length).toFixed(2)),
    withinTwo: Math.round(errors.filter((error) => Math.abs(error) <= 2).length / rows.length * 100),
    squaredErrorSum: Number(errors.reduce((sum, error) => sum + error * error, 0).toFixed(4)),
  };
}

export function evaluateSnapshot(snapshot: ForecastSnapshot, actuals: CalibrationActual[]): CalibrationResult | null {
  const actualMap = new Map(actuals.map((item) => [item.id, item.points]));
  const rows = snapshot.players
    .filter((player) => actualMap.has(player.id))
    .map((player) => ({ position: player.position, predicted: player.predicted, actual: actualMap.get(player.id) || 0 }));
  if (!rows.length) return null;
  const overall = metrics(rows);
  return {
    eventId: snapshot.eventId,
    ...overall,
    perPosition: Object.fromEntries(POSITIONS.flatMap((position) => {
      const positionRows = rows.filter((row) => row.position === position);
      return positionRows.length ? [[position, metrics(positionRows)]] : [];
    })),
    evaluatedAt: new Date().toISOString(),
  };
}

export function buildCalibrationProfile(results: CalibrationResult[]): CalibrationProfile {
  const recent = results.slice(-8);
  const positions = Object.fromEntries(POSITIONS.map((position) => {
    const rows = recent.map((result) => result.perPosition?.[position]).filter(Boolean);
    const sampleSize = rows.reduce((sum, row) => sum + row.sampleSize, 0);
    const predicted = rows.reduce((sum, row) => sum + row.sumPredicted, 0);
    const actual = rows.reduce((sum, row) => sum + row.sumActual, 0);
    const measuredEvents = rows.length;
    const mae = sampleSize
      ? rows.reduce((sum, row) => sum + row.mae * row.sampleSize, 0) / sampleSize
      : 0;
    const withinTwo = sampleSize
      ? rows.reduce((sum, row) => sum + row.withinTwo * row.sampleSize, 0) / sampleSize
      : 0;
    const active = recent.length >= MIN_EVENTS && sampleSize >= MIN_SAMPLES && predicted > 0;
    const rawMultiplier = predicted > 0 ? Math.max(0.75, Math.min(1.25, actual / predicted)) : 1;
    const shrinkage = Math.min(1, sampleSize / 180);
    const multiplier = active
      ? Number(Math.max(0.88, Math.min(1.12, 1 + (rawMultiplier - 1) * shrinkage)).toFixed(3))
      : 1;
    const hasExactVariance = sampleSize > 1 && rows.every((row) => Number.isFinite(row.squaredErrorSum));
    const sumError = predicted - actual;
    const squaredErrorSum = rows.reduce((sum, row) => sum + (row.squaredErrorSum || 0), 0);
    const variance = hasExactVariance
      ? Math.max(0, (squaredErrorSum - (sumError * sumError) / sampleSize) / (sampleSize - 1))
      : 0;
    const averagePredicted = sampleSize ? predicted / sampleSize : 0;
    const margin = hasExactVariance ? 1.96 * Math.sqrt(variance / sampleSize) : 0;
    const meanError = sampleSize ? sumError / sampleSize : 0;
    const estimatedRange = hasExactVariance && averagePredicted > 0
      ? {
          low: Number(Math.max(0.5, Math.min(1.5, 1 - (meanError + margin) / averagePredicted)).toFixed(3)),
          high: Number(Math.max(0.5, Math.min(1.5, 1 - (meanError - margin) / averagePredicted)).toFixed(3)),
        }
      : null;
    return [position, {
      active,
      sampleSize,
      rawMultiplier: Number(rawMultiplier.toFixed(3)),
      multiplier,
      measuredEvents,
      mae: Number(mae.toFixed(2)),
      withinTwo: Math.round(withinTwo),
      status: active ? 'ready' as const : 'collecting' as const,
      estimatedRange,
    }];
  }));
  return { active: Object.values(positions).some((item) => item.active), events: recent.length, updatedAt: new Date().toISOString(), positions };
}

export function applyCalibrationProfile(players: ModelPlayer[], profile: CalibrationProfile): ModelPlayer[] {
  const calibrated = players.map((player) => {
    const correction = profile.positions[player.position];
    if (!correction?.active || correction.multiplier === 1) return player;
    const scale = (value: number) => Number((value * correction.multiplier).toFixed(2));
    const calibratedExpectedPoints = scale(player.expectedPoints);
    return {
      ...player,
      expectedPoints: calibratedExpectedPoints,
      valueScore: Number((calibratedExpectedPoints / Math.max(player.price, 1)).toFixed(2)),
      projection: {
        ...player.projection,
        next1: scale(player.projection.next1),
        next3: scale(player.projection.next3),
        next5: scale(player.projection.next5),
        next8: scale(player.projection.next8),
        byEvent: player.projection.byEvent.map((item) => ({ ...item, points: scale(item.points) })),
      },
      calibration: {
        multiplier: correction.multiplier,
        sampleSize: correction.sampleSize,
        events: profile.events,
        beforeExpectedPoints: player.expectedPoints,
        expectedPointsDelta: Number((calibratedExpectedPoints - player.expectedPoints).toFixed(2)),
        beforeOverallRank: 0,
        afterOverallRank: 0,
        rankingPoolSize: 0,
        estimatedRange: correction.estimatedRange,
        beforeProjection: {
          next1: player.projection.next1,
          next3: player.projection.next3,
          next5: player.projection.next5,
          next8: player.projection.next8,
          byEvent: player.projection.byEvent.map((item) => ({ ...item })),
        },
      },
    };
  });
  const beforeRanks = new Map<number, number>();
  const afterRanks = new Map<number, number>();
  [...calibrated]
    .sort((a, b) => (b.calibration?.beforeExpectedPoints ?? b.expectedPoints) - (a.calibration?.beforeExpectedPoints ?? a.expectedPoints))
    .forEach((player, index) => beforeRanks.set(player.id, index + 1));
  [...calibrated]
    .sort((a, b) => b.expectedPoints - a.expectedPoints)
    .forEach((player, index) => afterRanks.set(player.id, index + 1));
  return calibrated.map((player) => player.calibration ? {
    ...player,
    calibration: {
      ...player.calibration,
      beforeOverallRank: beforeRanks.get(player.id) || 0,
      afterOverallRank: afterRanks.get(player.id) || 0,
      rankingPoolSize: calibrated.length,
    },
  } : player);
}

export async function refreshServerCalibration(eventId: number | undefined, actuals: CalibrationActual[]) {
  if (!calibrationStoreConfigured()) return { configured: false, results: [] as CalibrationResult[], profile: buildCalibrationProfile([]) };
  try {
    const [snapshot, storedResults] = await Promise.all([
      eventId ? readJson<ForecastSnapshot | null>(forecastKey(eventId), null) : Promise.resolve(null),
      readJson<CalibrationResult[]>(RESULTS_KEY, []),
    ]);
    let results = storedResults;
    if (eventId && actuals.length && !results.some((item) => item.eventId === eventId)) {
      const evaluated = snapshot ? evaluateSnapshot(snapshot, actuals) : null;
      if (evaluated) {
        results = [...results, evaluated].slice(-12);
        await writeJson(RESULTS_KEY, results);
      }
    }
    return { configured: true, results, profile: buildCalibrationProfile(results) };
  } catch {
    return { configured: true, unavailable: true, results: [] as CalibrationResult[], profile: buildCalibrationProfile([]) };
  }
}

export async function saveServerForecast(eventId: number | undefined, deadline: string | undefined, players: ModelPlayer[]) {
  if (!calibrationStoreConfigured() || !eventId || !deadline || !players.length) return;
  try {
    const snapshot: ForecastSnapshot = {
      eventId, deadline, createdAt: new Date().toISOString(),
      players: players.map((player) => ({ id: player.id, name: player.name, position: player.position, predicted: player.projection.next1 })),
    };
    // One immutable snapshot per Gameweek. SET NX avoids a preliminary GET and
    // prevents a later request from overwriting the pre-deadline forecast.
    await redis(['SET', forecastKey(eventId), JSON.stringify(snapshot), 'NX']);
  } catch {
    // Calibration persistence must never make the dashboard unavailable.
  }
}

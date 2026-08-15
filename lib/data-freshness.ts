import type {
  DataFreshnessStatus,
  ModelPlayer,
  PlayerDataFreshness,
} from '@/types/fpl';

const HOUR = 60 * 60 * 1000;

type FreshnessWindow = {
  freshHours: number;
  agingHours: number;
};

const WINDOWS = {
  official: { freshHours: 1, agingHours: 6 },
  fixtures: { freshHours: 6, agingHours: 24 },
  history: { freshHours: 36, agingHours: 96 },
  apiFootball: { freshHours: 12, agingHours: 36 },
  news: { freshHours: 6, agingHours: 24 },
  role: { freshHours: 72, agingHours: 168 },
} satisfies Record<string, FreshnessWindow>;

export function freshnessStatus(
  checkedAt: string | undefined,
  window: FreshnessWindow,
  now = new Date(),
): { status: DataFreshnessStatus; ageHours?: number } {
  if (!checkedAt) return { status: 'missing' };
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked)) return { status: 'missing' };
  const ageHours = Math.max(0, (now.getTime() - checked) / HOUR);
  if (ageHours <= window.freshHours) return { status: 'fresh', ageHours: Math.round(ageHours) };
  if (ageHours <= window.agingHours) return { status: 'aging', ageHours: Math.round(ageHours) };
  return { status: 'stale', ageHours: Math.round(ageHours) };
}

function source(
  id: PlayerDataFreshness['sources'][number]['id'],
  label: string,
  checkedAt: string | undefined,
  window: FreshnessWindow,
  now: Date,
  override?: DataFreshnessStatus,
  reason?: string,
): PlayerDataFreshness['sources'][number] {
  const measured = freshnessStatus(checkedAt, window, now);
  return {
    id,
    label,
    checkedAt,
    ageHours: measured.ageHours,
    status: override || measured.status,
    reason,
  };
}

function scoreFor(status: DataFreshnessStatus) {
  return status === 'fresh' ? 100 : status === 'aging' ? 65 : status === 'stale' ? 20 : 0;
}

function parsedExpiry(value: string | undefined) {
  if (!value) return undefined;
  const timestamp = Date.parse(value.length <= 10 ? `${value}T23:59:59Z` : value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function applyDataFreshnessGuard(
  players: ModelPlayer[],
  options: {
    officialCheckedAt: string;
    fixturesAvailable: boolean;
    verified: boolean;
    now?: Date;
  },
): ModelPlayer[] {
  const now = options.now || new Date();
  return players.map((player) => {
    const roleMeasured = freshnessStatus(player.roleAssessment?.checkedAt, WINDOWS.role, now);
    const roleExpiry = parsedExpiry(player.roleAssessment?.expiresAt);
    const roleExpired = roleExpiry != null && now.getTime() > roleExpiry;
    const apiMeasured = freshnessStatus(player.apiFootball?.checkedAt, WINDOWS.apiFootball, now);
    const apiStatus = player.apiFootball && !player.apiFootball.currentSeason && apiMeasured.status === 'fresh'
      ? 'aging'
      : apiMeasured.status;
    const sources: PlayerDataFreshness['sources'] = [
      source('official-fpl', 'Official FPL player data', options.officialCheckedAt, WINDOWS.official, now),
      source(
        'official-fpl-fixtures',
        'Official FPL fixtures',
        options.fixturesAvailable ? options.officialCheckedAt : undefined,
        WINDOWS.fixtures,
        now,
      ),
      source('official-fpl-history', 'Official FPL recent history', player.historyCheckedAt, WINDOWS.history, now),
      source(
        'api-football',
        'API-Football evidence',
        player.apiFootball?.checkedAt,
        WINDOWS.apiFootball,
        now,
        apiStatus,
        player.apiFootball && !player.apiFootball.currentSeason
          ? 'Previous-season evidence is context, not current-role proof.'
          : undefined,
      ),
      source('recent-news', 'Recent news verification', player.newsCheckedAt, WINDOWS.news, now),
      source(
        'role-assessment',
        'Dated role assessment',
        player.roleAssessment?.checkedAt,
        WINDOWS.role,
        now,
        roleExpired ? 'stale' : roleMeasured.status,
        roleExpired ? 'The assessment passed its explicit expiry date.' : undefined,
      ),
    ];
    const applicable = sources.filter((item) =>
      options.verified || !['api-football', 'recent-news', 'official-fpl-history'].includes(item.id),
    );
    const score = applicable.length
      ? Math.round(applicable.reduce((sum, item) => sum + scoreFor(item.status), 0) / applicable.length)
      : 0;
    const criticalStale = sources.some((item) =>
      ['official-fpl', 'official-fpl-fixtures'].includes(item.id) && item.status === 'stale',
    );
    const staleFirstChoiceAssessment = Boolean(
      player.roleAssessment?.role === 'first-choice' &&
      sources.find((item) => item.id === 'role-assessment')?.status === 'stale',
    );
    const status: DataFreshnessStatus = criticalStale
      ? 'stale'
      : score >= 80
        ? 'fresh'
        : score >= 50
          ? 'aging'
          : applicable.some((item) => item.status === 'fresh' || item.status === 'aging')
            ? 'aging'
            : 'missing';
    const currentCompetitiveRole = Boolean(
      player.apiFootball?.currentSeason &&
      player.apiFootball.currentTeamMatched &&
      player.apiFootball.identityVerified &&
      player.apiFootball.competitiveMatches >= 2 &&
      (apiStatus === 'fresh' || apiStatus === 'aging'),
    );
    const historyStatus = sources.find((item) => item.id === 'official-fpl-history')?.status;
    const currentOfficialRole = Boolean(
      player.recentHistory &&
      player.recentHistory.sampleSize >= 3 &&
      player.recentHistory.startRate >= 60 &&
      player.recentHistory.averageMinutes >= 55 &&
      (historyStatus === 'fresh' || historyStatus === 'aging'),
    );
    const stalePositiveEvidence = staleFirstChoiceAssessment && !currentCompetitiveRole && !currentOfficialRole;
    const mustRemoveStaleBoost = stalePositiveEvidence;
    const starterConfidence = mustRemoveStaleBoost
      ? Math.min(player.starterConfidence, 64)
      : player.starterConfidence;
    const predictedMinutes = mustRemoveStaleBoost
      ? Math.min(player.predictedMinutes, 58)
      : player.predictedMinutes;
    const previousAvailabilityCore = Math.max(
      0.03,
      player.starterConfidence / 100 * 0.72 + player.predictedMinutes / 90 * 0.28,
    );
    const guardedAvailabilityCore = Math.max(
      0.03,
      starterConfidence / 100 * 0.72 + predictedMinutes / 90 * 0.28,
    );
    const projectionFactor = mustRemoveStaleBoost
      ? Math.min(1, guardedAvailabilityCore / previousAvailabilityCore)
      : 1;
    const expectedPoints = Number((player.expectedPoints * projectionFactor).toFixed(2));

    return {
      ...player,
      starterConfidence,
      predictedMinutes,
      starterLabel: mustRemoveStaleBoost && player.starterLabel !== 'unavailable'
        ? 'rotation' as const
        : player.starterLabel,
      appearanceProbability: Number((player.appearanceProbability * projectionFactor).toFixed(3)),
      expectedPoints,
      valueScore: Number((expectedPoints / Math.max(player.price, 1)).toFixed(2)),
      projection: mustRemoveStaleBoost ? {
        ...player.projection,
        next1: Number((player.projection.next1 * projectionFactor).toFixed(2)),
        next3: Number((player.projection.next3 * projectionFactor).toFixed(2)),
        next5: Number((player.projection.next5 * projectionFactor).toFixed(2)),
        next8: Number((player.projection.next8 * projectionFactor).toFixed(2)),
        byEvent: player.projection.byEvent.map((item) => ({
          ...item,
          points: Number((item.points * projectionFactor).toFixed(2)),
        })),
      } : player.projection,
      dataFreshness: { status, score, stalePositiveEvidence, sources },
    };
  });
}

export function hasFreshRoleEvidence(player: ModelPlayer) {
  if (!player.roleAssessment) return false;
  const status = player.dataFreshness?.sources.find((item) => item.id === 'role-assessment')?.status;
  return status === 'fresh' || status === 'aging';
}

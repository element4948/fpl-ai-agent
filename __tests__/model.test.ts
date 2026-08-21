import { describe, it, expect } from 'vitest';
import { normalizeTeamStrength, fixtureAttackMultiplier, cleanSheetProbabilityFrom } from '@/lib/fpl';
import { classifyHeadline, clusterNewsSignals, headlineMentionsName, playerNewsAliases, resolveSignalConflicts, sourceTier, verifySignals } from '@/lib/external-news';
import { validateSquad } from '@/lib/rules';
import { captainScore } from '@/lib/scoring';
import { suggestSafeTransfers, buildTransferPlans } from '@/lib/transfers';
import { buildSquadAlerts, buildSquadReports } from '@/lib/squad-alerts';
import { formatDeadlineLine, buildDigestMessage } from '@/lib/digest';
import { alertKey } from '@/lib/alert-store';
import { predictPriceMoves, isLikelyMove } from '@/lib/price-predictor';
import { splitTelegramMessage } from '@/lib/telegram';
import { matchPlayerIdentity } from '@/lib/player-identity';
import { calculateInternationalFatigueRisk } from '@/lib/api-football';
import { applyRecentHistoryEvidence } from '@/lib/history-enrichment';
import { applyCalibrationProfile, buildCalibrationProfile, evaluateSnapshot } from '@/lib/server-calibration';
import type { FplPlayer } from '@/types/fpl';
import { makePlayer, makeLegalSquad } from './helpers';
import { applyDataFreshnessGuard, freshnessStatus, hasFreshRoleEvidence } from '@/lib/data-freshness';
import { withTimeBudget } from '@/lib/provider-budget';
import { buildDecision } from '@/lib/decision';
import { buildDeadlineAlert, deadlineWindow } from '@/lib/deadline-alert';
import { starterSquadScore } from '@/lib/squad-optimizer';

describe('data freshness guard', () => {
  const now = new Date('2026-08-15T09:00:00Z');

  it('distinguishes fresh, aging, stale and missing timestamps', () => {
    expect(freshnessStatus('2026-08-15T08:00:00Z', { freshHours: 2, agingHours: 8 }, now).status).toBe('fresh');
    expect(freshnessStatus('2026-08-15T04:00:00Z', { freshHours: 2, agingHours: 8 }, now).status).toBe('aging');
    expect(freshnessStatus('2026-08-14T09:00:00Z', { freshHours: 2, agingHours: 8 }, now).status).toBe('stale');
    expect(freshnessStatus(undefined, { freshHours: 2, agingHours: 8 }, now).status).toBe('missing');
  });

  it('does not accept an expired first-choice assessment as current role proof', () => {
    const player = makePlayer({
      roleAssessment: {
        role: 'first-choice', confidence: 95, note: 'old', sourceLabel: 'Club',
        sourceUrl: 'https://example.com', checkedAt: '2026-07-01', expiresAt: '2026-07-10',
      },
    });
    const guarded = applyDataFreshnessGuard([player], {
      officialCheckedAt: now.toISOString(), fixturesAvailable: true, verified: true, now,
    })[0];
    expect(guarded.dataFreshness?.stalePositiveEvidence).toBe(true);
    expect(hasFreshRoleEvidence(guarded)).toBe(false);
    expect(guarded.starterConfidence).toBeLessThan(68);
    expect(guarded.predictedMinutes).toBeLessThan(60);
    expect(guarded.starterLabel).toBe('rotation');
  });

  it('keeps current Official FPL role evidence when an old note expires', () => {
    const player = makePlayer({
      historyCheckedAt: now.toISOString(),
      recentHistory: {
        sampleSize: 5, starts: 4, startRate: 80, averageMinutes: 76,
        sixtyPlusRate: 80, averagePoints: 5, recentMinutes: [90, 82, 76, 70, 62],
        recentPoints: [6, 5, 4, 7, 3], trend: 'stable', dataQuality: 'good',
      },
      roleAssessment: {
        role: 'first-choice', confidence: 95, note: 'old', sourceLabel: 'Club',
        sourceUrl: 'https://example.com', checkedAt: '2026-07-01', expiresAt: '2026-07-10',
      },
    });
    const guarded = applyDataFreshnessGuard([player], {
      officialCheckedAt: now.toISOString(), fixturesAvailable: true, verified: true, now,
    })[0];
    expect(guarded.dataFreshness?.stalePositiveEvidence).toBe(false);
    expect(guarded.starterConfidence).toBe(player.starterConfidence);
    expect(guarded.predictedMinutes).toBe(player.predictedMinutes);
  });

  it('labels previous-season provider evidence as aging, not current proof', () => {
    const player = makePlayer({
      apiFootball: {
        matches: 5, starts: 5, minutes: 88, rating: 7, shots: 0, keyPasses: 0,
        tackles: 0, saves: 0, checkedAt: now.toISOString(), season: 2025,
        currentSeason: false, currentTeamMatched: true, friendlyMatches: 0,
        friendlyStarts: 0, friendlyMinutes: 0, competitiveMatches: 5,
        competitiveStarts: 5, competitiveMinutes: 88, internationalMatches: 0,
        internationalStarts: 0, internationalMinutes: 0, internationalFatigueRisk: 0,
      },
    });
    const guarded = applyDataFreshnessGuard([player], {
      officialCheckedAt: now.toISOString(), fixturesAvailable: true, verified: true, now,
    })[0];
    expect(guarded.dataFreshness?.sources.find((item) => item.id === 'api-football')?.status).toBe('aging');
  });
});

describe('starter squad objective', () => {
  it('keeps immediate points dominant while durable mode value can decide a close call', () => {
    const baseProjection = makePlayer().projection;
    const immediate = makePlayer({ expectedPoints: 6, projection: { ...baseProjection, next3: 18, next5: 30 } });
    const durable = makePlayer({ id: 2, expectedPoints: 5.8, projection: { ...baseProjection, next3: 19, next5: 33 } });

    expect(starterSquadScore(immediate, () => 10)).toBeGreaterThan(starterSquadScore(durable, () => 10));
    expect(starterSquadScore(durable, () => 14)).toBeGreaterThan(starterSquadScore(immediate, () => 10));
  });
});

describe('provider time budget', () => {
  it('returns the fallback and timeout telemetry for a slow optional provider', async () => {
    const result = await withTimeBudget(
      new Promise<string>((resolve) => setTimeout(() => resolve('late'), 30)),
      'fallback',
      5,
    );
    expect(result.value).toBe('fallback');
    expect(result.timing.timedOut).toBe(true);
  });

  it('returns a fast provider result without a timeout flag', async () => {
    const result = await withTimeBudget(Promise.resolve('ready'), 'fallback', 50);
    expect(result.value).toBe('ready');
    expect(result.timing.timedOut).toBe(false);
  });
});

describe('deadline decision', () => {
  it('returns one compact captain, transfer, lineup, bench and risk contract', () => {
    const squad = makeLegalSquad();
    const decision = buildDecision({ allPlayers: squad, squad, bank: 0, freeTransfers: 1, isPreSeason: false });
    expect(decision.deadlineDecision.captain?.name).toBeTruthy();
    expect(decision.deadlineDecision.transfer.action).toMatch(/transfer|hold/);
    expect(decision.deadlineDecision.startingXI).toHaveLength(11);
    expect(decision.deadlineDecision.bench).toHaveLength(4);
  });
});

describe('position calibration safety gates', () => {
  const result = (
    eventId: number,
    sampleSize: number,
    predicted: number,
    actual: number,
    deployed?: { baselineMae: number; calibratedMae: number },
  ) => ({
    eventId,
    sampleSize,
    sumPredicted: predicted,
    sumActual: actual,
    mae: deployed?.baselineMae ?? 1,
    bias: 0,
    withinTwo: 75,
    perPosition: {
      MID: {
        sampleSize,
        sumPredicted: predicted,
        sumActual: actual,
        mae: deployed?.baselineMae ?? 1,
        bias: 0,
        withinTwo: 75,
        squaredErrorSum: 160,
        baselineMae: deployed?.baselineMae,
        calibratedMae: deployed?.calibratedMae,
        calibrationAppliedSampleSize: deployed ? sampleSize : 0,
      },
    },
    evaluatedAt: new Date(2026, 0, eventId).toISOString(),
  });

  it('does not correct projections from too little evidence', () => {
    const profile = buildCalibrationProfile([result(1, 30, 120, 150), result(2, 30, 120, 150)]);
    expect(profile.positions.MID.active).toBe(false);
    expect(profile.positions.MID.multiplier).toBe(1);
  });

  it('learns from the saved baseline instead of feeding corrected output back into itself', () => {
    const measured = evaluateSnapshot({
      eventId: 1,
      deadline: '2026-08-15T09:00:00Z',
      createdAt: '2026-08-15T08:00:00Z',
      players: [{ id: 1, name: 'Test', position: 'MID', predicted: 8, basePredicted: 5, calibrationMultiplier: 1.1 }],
    }, [{ id: 1, name: 'Test', points: 5 }]);
    expect(measured?.mae).toBe(0);
    expect(measured?.sumPredicted).toBe(5);
    expect(measured?.perPosition.MID.baselineMae).toBe(0);
    expect(measured?.perPosition.MID.calibratedMae).toBe(3);
  });

  it('applies a bounded, shrunk position correction after enough evidence', () => {
    const profile = buildCalibrationProfile([
      result(1, 25, 100, 140), result(2, 25, 100, 140), result(3, 25, 100, 140),
    ]);
    expect(profile.positions.MID.active).toBe(true);
    expect(profile.positions.MID.multiplier).toBeGreaterThan(1);
    expect(profile.positions.MID.multiplier).toBeLessThanOrEqual(1.12);
    const mid = makePlayer({ position: 'MID', positionId: 3, expectedPoints: 5, price: 5 });
    const defender = makePlayer({ id: 2, position: 'DEF', positionId: 2, expectedPoints: 5, price: 5 });
    const forward = makePlayer({ id: 3, position: 'FWD', positionId: 4, expectedPoints: 5.5, price: 6 });
    const calibrated = applyCalibrationProfile([mid, defender, forward], profile);
    expect(calibrated[0].expectedPoints).toBeGreaterThan(5);
    expect(calibrated[0].calibration?.beforeExpectedPoints).toBe(5);
    expect(calibrated[0].calibration?.expectedPointsDelta).toBeCloseTo(
      calibrated[0].expectedPoints - 5,
      2,
    );
    expect(calibrated[0].calibration?.beforeProjection.next1).toBe(mid.projection.next1);
    expect(calibrated[0].calibration?.estimatedRange).not.toBeNull();
    expect(calibrated[0].calibration?.beforeOverallRank).toBe(2);
    expect(calibrated[0].calibration?.afterOverallRank).toBe(1);
    expect(calibrated[1].expectedPoints).toBe(5);
  });

  it('holds an uncertain correction when its estimated range includes 1.0', () => {
    const profile = buildCalibrationProfile([
      result(1, 25, 100, 104), result(2, 25, 100, 104), result(3, 25, 100, 104),
    ]);
    expect(profile.positions.MID.status).toBe('uncertain');
    expect(profile.positions.MID.active).toBe(false);
    expect(profile.positions.MID.multiplier).toBe(1);
  });

  it('pauses correction when deployed MAE is worse than its saved baseline', () => {
    const profile = buildCalibrationProfile([
      result(1, 25, 100, 140, { baselineMae: 0.5, calibratedMae: 1 }),
      result(2, 25, 100, 140, { baselineMae: 0.5, calibratedMae: 1 }),
      result(3, 25, 100, 140, { baselineMae: 0.5, calibratedMae: 1 }),
    ]);
    expect(profile.positions.MID.status).toBe('paused');
    expect(profile.positions.MID.active).toBe(false);
    expect(profile.positions.MID.multiplier).toBe(1);
  });
});

function strongMid(id: number): ReturnType<typeof makePlayer> {
  return makePlayer({
    id,
    position: 'MID',
    positionId: 3,
    team: 'ZZZ',
    teamId: 60,
    price: 6,
    risk: 10,
    expectedPoints: 8,
    starterConfidence: 90,
    predictedMinutes: 88,
    projection: {
      next1: 8,
      next3: 24,
      next5: 40,
      next8: 64,
      games: 8,
      gameweeks: 8,
      byEvent: [1, 2, 3, 4, 5].map((event) => ({ event, points: 8 })),
    },
    evidence: { coverageScore: 90, trustLevel: 'high', availableMetrics: [], missingMetrics: [], sources: [] },
  });
}

describe('normalizeTeamStrength (scale-bug regression)', () => {
  it('maps the ~1000-1400 FPL scale into 1-5', () => {
    expect(normalizeTeamStrength(1000, 3)).toBeCloseTo(1, 5);
    expect(normalizeTeamStrength(1300, 3)).toBeCloseTo(4, 5);
    expect(normalizeTeamStrength(1400, 3)).toBeCloseTo(5, 5);
  });
  it('clamps out-of-range large values to 1-5', () => {
    expect(normalizeTeamStrength(1600, 3)).toBe(5);
    expect(normalizeTeamStrength(600, 3)).toBe(1);
  });
  it('passes through values already on the 1-5 scale', () => {
    expect(normalizeTeamStrength(3, 3)).toBe(3);
    expect(normalizeTeamStrength(5, 3)).toBe(5);
  });
  it('falls back when the value is missing/zero', () => {
    expect(normalizeTeamStrength(0, 3)).toBe(3);
    expect(normalizeTeamStrength(Number.NaN, 4)).toBe(4);
  });
});

describe('headlineMentionsName (news false-positive regression)', () => {
  it('matches the player as a whole word', () => {
    expect(headlineMentionsName('Bernardo Silva ruled out for Man City', 'Silva')).toBe(true);
    expect(headlineMentionsName('Son Heung-min injury doubt', 'Son')).toBe(true);
  });
  it('does not match substrings inside other words', () => {
    expect(headlineMentionsName('Johnson scores twice', 'Son')).toBe(false);
    expect(headlineMentionsName('There is no reason to panic', 'Son')).toBe(false);
  });
  it('ignores names that are too short', () => {
    expect(headlineMentionsName('Any headline', 'Xu')).toBe(false);
  });
});

describe('playerNewsAliases', () => {
  it('matches display, full and unique same-team surname forms', () => {
    expect(playerNewsAliases(
      { id: 1, name: 'B.Fernandes', fullName: 'Bruno Miguel Borges Fernandes' },
      [{ id: 1, name: 'B.Fernandes', fullName: 'Bruno Miguel Borges Fernandes' }],
    )).toEqual(expect.arrayContaining(['B.Fernandes', 'B Fernandes', 'Bruno Miguel Borges Fernandes', 'Fernandes']));
  });

  it('does not use surname-only matching when same-team names collide', () => {
    const aliases = playerNewsAliases(
      { id: 1, name: 'A.Smith', fullName: 'Adam Smith' },
      [
        { id: 1, name: 'A.Smith', fullName: 'Adam Smith' },
        { id: 2, name: 'J.Smith', fullName: 'John Smith' },
      ],
    );
    expect(aliases).not.toContain('Smith');
  });
});

describe('verifySignals source identity', () => {
  it('uses publisher domains instead of the shared Google News redirect host', () => {
    const signals = verifySignals([
      {
        headline: 'Player ruled out', url: 'https://news.google.com/a', sourceUrl: 'https://bbc.co.uk',
        publishedAt: '', source: 'BBC', tier: 'reliable', category: 'injury', severity: 'high',
      },
      {
        headline: 'Player ruled out through injury', url: 'https://news.google.com/b', sourceUrl: 'https://reuters.com',
        publishedAt: '', source: 'Reuters', tier: 'reliable', category: 'injury', severity: 'high',
      },
    ]);
    expect(signals.every((signal) => signal.verification === 'corroborated')).toBe(true);
    expect(signals[0].corroboratingSourceCount).toBe(2);
  });

  it('does not corroborate different claims that merely share a category', () => {
    const signals = verifySignals([
      {
        headline: 'Player ruled out', url: 'https://news.google.com/a', sourceUrl: 'https://bbc.co.uk',
        publishedAt: '', source: 'BBC', tier: 'reliable', category: 'injury', severity: 'high',
      },
      {
        headline: 'Player remains an injury doubt', url: 'https://news.google.com/b', sourceUrl: 'https://reuters.com',
        publishedAt: '', source: 'Reuters', tier: 'reliable', category: 'injury', severity: 'medium',
      },
    ]);
    expect(signals.every((signal) => signal.verification === 'single-source')).toBe(true);
  });
});

describe('sourceTier', () => {
  it('requires an exact official hostname or subdomain boundary', () => {
    expect(sourceTier('Manchester City', 'https://www.mancity.com/news')).toBe('official');
    expect(sourceTier('Manchester City', 'https://academy.mancity.com/news')).toBe('official');
    expect(sourceTier('Read Man City', 'https://readmancity.com/news')).toBe('secondary');
  });
});

describe('classifyHeadline', () => {
  it('does not punish a confirmed return from injury', () => {
    expect(classifyHeadline('Player returns to training after injury')).toEqual({
      category: 'availability', severity: 'low',
    });
  });

  it('recognizes an official outgoing loan move as transfer risk', () => {
    expect(classifyHeadline('Player joins Championship club on loan')).toEqual({
      category: 'transfer', severity: 'high',
    });
  });

  it('keeps unrelated headlines out of availability evidence', () => {
    expect(classifyHeadline('Player discusses his favourite stadium')).toEqual({
      category: 'other', severity: 'low',
    });
  });

  it('recognizes a confirmed stay as a transfer counter-signal', () => {
    expect(classifyHeadline('Manager confirms Player will stay at the club')).toEqual({
      category: 'transfer', severity: 'low',
    });
  });
});

describe('resolveSignalConflicts', () => {
  it('lets a newer official return supersede an older reliable injury warning', () => {
    const resolved = resolveSignalConflicts({ id: 1, name: 'Player' }, [
      {
        headline: 'Player ruled out', url: 'https://bbc.co.uk/old', sourceUrl: 'https://bbc.co.uk',
        publishedAt: '2026-08-18T10:00:00Z', source: 'BBC', tier: 'reliable', category: 'injury', severity: 'high',
        verification: 'single-source', corroboratingSourceCount: 1,
      },
      {
        headline: 'Player returns to training', url: 'https://club.test/new', sourceUrl: 'https://mancity.com',
        publishedAt: '2026-08-20T10:00:00Z', source: 'Manchester City', tier: 'official', category: 'availability', severity: 'low',
        verification: 'confirmed', corroboratingSourceCount: 1,
      },
    ]);
    expect(resolved.signals.map((signal) => signal.category)).toEqual(['availability']);
    expect(resolved.conflicts).toHaveLength(1);
    expect(resolved.conflicts[0].activeSource).toBe('Manchester City');
  });

  it('does not let an unverified secondary return erase a trusted injury warning', () => {
    const resolved = resolveSignalConflicts({ id: 1, name: 'Player' }, [
      {
        headline: 'Player ruled out', url: 'https://bbc.co.uk/injury', sourceUrl: 'https://bbc.co.uk',
        publishedAt: '2026-08-19T10:00:00Z', source: 'BBC', tier: 'reliable', category: 'injury', severity: 'high',
        verification: 'single-source', corroboratingSourceCount: 1,
      },
      {
        headline: 'Player returns to training', url: 'https://rumour.test/return', sourceUrl: 'https://rumour.test',
        publishedAt: '2026-08-20T10:00:00Z', source: 'Rumour', tier: 'secondary', category: 'availability', severity: 'low',
        verification: 'unverified', corroboratingSourceCount: 0,
      },
    ]);
    expect(resolved.signals).toHaveLength(2);
    expect(resolved.conflicts).toHaveLength(0);
  });
});

describe('clusterNewsSignals', () => {
  it('collapses the same semantic claim and keeps the strongest source', () => {
    const clustered = clusterNewsSignals(verifySignals([
      {
        headline: 'Player ruled out this weekend', url: 'https://bbc.co.uk/a', sourceUrl: 'https://bbc.co.uk',
        publishedAt: '2026-08-20T08:00:00Z', source: 'BBC', tier: 'reliable', category: 'injury', severity: 'high',
      },
      {
        headline: 'Player ruled out by manager', url: 'https://club.test/b', sourceUrl: 'https://mancity.com',
        publishedAt: '2026-08-20T09:00:00Z', source: 'Manchester City', tier: 'official', category: 'injury', severity: 'high',
      },
    ]));
    expect(clustered).toHaveLength(1);
    expect(clustered[0].source).toBe('Manchester City');
    expect(clustered[0].clusteredSourceCount).toBe(2);
    expect(clustered[0].clusteredSources).toEqual(expect.arrayContaining(['BBC', 'Manchester City']));
  });
});

describe('matchPlayerIdentity', () => {
  it('prefers an exact full-name match within the already matched team', () => {
    const result = matchPlayerIdentity('Pedro Porro', [
      { id: 1, name: 'Porro', fullName: 'Pedro Porro' },
      { id: 2, name: 'Pedro', fullName: 'Pedro Lima' },
    ]);
    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.candidate.id).toBe(1);
      expect(result.confidence).toBe(100);
    }
  });

  it('accepts a unique surname token but rejects a same-team ambiguity', () => {
    expect(matchPlayerIdentity('Porro', [
      { id: 1, name: 'Porro', fullName: 'Pedro Porro' },
    ]).status).toBe('matched');
    expect(matchPlayerIdentity('Smith', [
      { id: 1, name: 'Smith', fullName: 'John Smith' },
      { id: 2, name: 'Smith', fullName: 'Adam Smith' },
    ]).status).toBe('ambiguous');
  });

  it('supports a provider first initial only when the team candidate is unique', () => {
    const result = matchPlayerIdentity('B. Fernandes', [
      { id: 1, name: 'B.Fernandes', fullName: 'Bruno Miguel Borges Fernandes' },
    ]);
    expect(result.status).toBe('matched');
  });

  it('does not match short substrings inside another name', () => {
    expect(matchPlayerIdentity('Johnson', [
      { id: 1, name: 'Son', fullName: 'Heung-min Son' },
    ]).status).toBe('unmatched');
  });
});

describe('calculateInternationalFatigueRisk', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('penalizes a heavy, very recent international workload', () => {
    expect(calculateInternationalFatigueRisk(180, '2026-08-12T12:00:00.000Z', now)).toBe(45);
  });

  it('decays the penalty as recovery time increases', () => {
    expect(calculateInternationalFatigueRisk(130, '2026-08-09T12:00:00.000Z', now)).toBe(30);
    expect(calculateInternationalFatigueRisk(190, '2026-08-06T12:00:00.000Z', now)).toBe(22);
  });

  it('does not invent fatigue when minutes or date are unavailable', () => {
    expect(calculateInternationalFatigueRisk(0, '2026-08-12T12:00:00.000Z', now)).toBe(0);
    expect(calculateInternationalFatigueRisk(180, undefined, now)).toBe(0);
  });
});

describe('applyRecentHistoryEvidence', () => {
  const checkedAt = '2026-08-15T12:00:00.000Z';

  it('promotes a strong recent five-match role without exceeding valid ranges', () => {
    const player = makePlayer({ starterConfidence: 55, predictedMinutes: 50, risk: 55 });
    const [enriched] = applyRecentHistoryEvidence([player], {
      analyses: new Map([[player.id, {
        sampleSize: 5, starts: 5, startRate: 100, averageMinutes: 86,
        sixtyPlusRate: 100, averagePoints: 5, recentMinutes: [85, 90, 88, 82, 85],
        recentPoints: [2, 6, 3, 7, 7], trend: 'stable', dataQuality: 'good',
      }]]),
      checkedIds: new Set([player.id]), checkedAt,
      requestedPlayers: 1, successfulPlayers: 1, ok: true,
    });
    expect(enriched.starterConfidence).toBeGreaterThan(player.starterConfidence);
    expect(enriched.predictedMinutes).toBeGreaterThan(player.predictedMinutes);
    expect(enriched.risk).toBeLessThan(player.risk);
    expect(enriched.historyCheckedAt).toBe(checkedAt);
  });

  it('penalizes repeated low-minute bench appearances', () => {
    const player = makePlayer({ starterConfidence: 82, predictedMinutes: 80, risk: 15 });
    const [enriched] = applyRecentHistoryEvidence([player], {
      analyses: new Map([[player.id, {
        sampleSize: 5, starts: 0, startRate: 0, averageMinutes: 12,
        sixtyPlusRate: 0, averagePoints: 1, recentMinutes: [10, 15, 0, 20, 15],
        recentPoints: [1, 1, 0, 2, 1], trend: 'stable', dataQuality: 'good',
      }]]),
      checkedIds: new Set([player.id]), checkedAt,
      requestedPlayers: 1, successfulPlayers: 1, ok: true,
    });
    expect(enriched.starterConfidence).toBeLessThan(player.starterConfidence);
    expect(enriched.predictedMinutes).toBeLessThan(player.predictedMinutes);
    expect(enriched.risk).toBeGreaterThanOrEqual(55);
    expect(enriched.expectedPoints).toBeLessThan(player.expectedPoints);
  });
});

describe('validateSquad', () => {
  it('accepts a legal 2-5-5-3 squad under budget', () => {
    const result = validateSquad(makeLegalSquad());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  it('rejects an over-budget squad', () => {
    const squad = makeLegalSquad((p) => ({ ...p, price: 10 })); // 15 * 10 = 150m
    const result = validateSquad(squad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Budget/.test(e))).toBe(true);
  });
  it('rejects more than three players from one club', () => {
    const squad = makeLegalSquad((p, i) => (i < 4 ? { ...p, team: 'SAME', teamId: 99 } : p));
    const result = validateSquad(squad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Max 3/.test(e))).toBe(true);
  });
});

describe('captainScore risk penalty', () => {
  it('ranks the lower-risk player higher when expected points are equal', () => {
    const safe = makePlayer({ id: 1, risk: 10, expectedPoints: 6 });
    const risky = makePlayer({ id: 2, risk: 90, expectedPoints: 6 });
    expect(captainScore(safe)).toBeGreaterThan(captainScore(risky));
  });
});

describe('suggestSafeTransfers respects estimated selling price', () => {
  it('does not suggest a target the manager cannot afford after selling at estimated price', () => {
    // Squad player rose in price: market 8.0 but estimated selling 7.0, bank 0.
    const squad = makeLegalSquad();
    const out = squad.find((p) => p.position === 'MID')!;
    out.price = 8;
    out.sellingPrice = 7;
    out.risk = 80; // force urgent exit so a transfer is considered
    out.starterConfidence = 20;
    // A 7.5 target is affordable at market (<= 8 + 0) but NOT at selling (7 + 0).
    const target = makePlayer({
      id: 999,
      position: 'MID',
      positionId: 3,
      team: 'ZZZ',
      teamId: 50,
      price: 7.5,
      risk: 10,
      expectedPoints: 9,
      starterConfidence: 90,
      predictedMinutes: 88,
      evidence: { coverageScore: 90, trustLevel: 'high', availableMetrics: [], missingMetrics: [], sources: [] },
    });
    const suggestions = suggestSafeTransfers(squad, [target], 0, 1);
    expect(suggestions.some((s) => s.inPlayer.id === 999)).toBe(false);
  });
});

describe('buildTransferPlans (multi-transfer + hit)', () => {
  function weakSquad() {
    const squad = makeLegalSquad();
    const weak = squad.find((p) => p.position === 'MID')!;
    weak.expectedPoints = 1;
    weak.projection = { ...weak.projection, next1: 1, next3: 3, next5: 5, next8: 8, byEvent: weak.projection.byEvent.map((e) => ({ ...e, points: 1 })) };
    return squad;
  }

  it('always includes a hold option and recommends a clear single upgrade', () => {
    const plans = buildTransferPlans(weakSquad(), [strongMid(900)], 2, 1);
    expect(plans.some((p) => p.transfersUsed === 0)).toBe(true);
    const single = plans.find((p) => p.transfersUsed === 1);
    expect(single).toBeDefined();
    expect(single!.moves[0].inId).toBe(900);
    expect(plans.find((p) => p.recommended)!.transfersUsed).toBe(1);
  });

  it('charges a -4 hit when no free transfer is available', () => {
    const plans = buildTransferPlans(weakSquad(), [strongMid(900)], 2, 0);
    const single = plans.find((p) => p.transfersUsed === 1)!;
    expect(single.hitCost).toBe(4);
    expect(single.netGain).toBeCloseTo(single.grossGain - 4, 5);
  });
});

describe('fixtureAttackMultiplier (opponent/venue adjustment)', () => {
  it('rewards easier fixtures and home games over hard/away', () => {
    expect(fixtureAttackMultiplier(1, true)).toBeGreaterThan(fixtureAttackMultiplier(5, false));
    expect(fixtureAttackMultiplier(3, null)).toBeCloseTo(1, 5);
  });
  it('stays within bounds', () => {
    expect(fixtureAttackMultiplier(1, true)).toBeLessThanOrEqual(1.3);
    expect(fixtureAttackMultiplier(5, false)).toBeGreaterThanOrEqual(0.75);
  });
});

describe('cleanSheetProbabilityFrom (xGC-based clean sheet)', () => {
  it('is higher for lower xGC and easier fixtures', () => {
    expect(cleanSheetProbabilityFrom(0.5, 2, 0.3)).toBeGreaterThan(cleanSheetProbabilityFrom(1.8, 4, 0.3));
  });
  it('falls back to the historical rate when xGC is unknown', () => {
    expect(cleanSheetProbabilityFrom(0, 3, 0.25)).toBeCloseTo(0.25, 5);
  });
  it('never exceeds 0.9', () => {
    expect(cleanSheetProbabilityFrom(0.01, 1, 0.9)).toBeLessThanOrEqual(0.9);
  });
});

describe('buildSquadAlerts (Telegram digest)', () => {
  it('flags injuries and rotation risk but ignores healthy nailed players', () => {
    const squad = [
      makePlayer({ id: 1, name: 'Injured', status: 'i', news: 'Knee injury - 50% chance' }),
      makePlayer({ id: 2, name: 'Rotation', status: 'a', starterConfidence: 30, predictedMinutes: 30 }),
      makePlayer({ id: 3, name: 'Nailed', status: 'a', starterConfidence: 90 }),
    ];
    const alerts = buildSquadAlerts(squad);
    expect(alerts.some((a) => a.playerId === 1 && a.severity === 'high')).toBe(true);
    expect(alerts.some((a) => a.playerId === 2 && a.kind === 'rotation')).toBe(true);
    expect(alerts.some((a) => a.playerId === 3)).toBe(false);
    expect(alerts[0].severity).toBe('high');
  });
  it('buildSquadReports surfaces reliable single-source news', () => {
    const p = makePlayer({
      id: 5,
      name: 'Rumour',
      externalNews: [
        {
          headline: 'Linked with a move',
          url: 'https://x',
          publishedAt: '',
          source: 'BBC',
          tier: 'reliable',
          category: 'transfer',
          severity: 'medium',
          verification: 'single-source',
          corroboratingSourceCount: 1,
        },
      ],
    });
    expect(buildSquadReports([p]).some((r) => r.playerId === 5)).toBe(true);
  });
});

describe('digest formatting', () => {
  it('formatDeadlineLine shows remaining time and handles past/absent deadlines', () => {
    const now = 1_000_000_000_000;
    const future = new Date(now + (26 * 60 + 5) * 60000).toISOString(); // 1d 2h 5m
    const line = formatDeadlineLine(future, now)!;
    expect(line).toContain('Deadline хүртэл');
    expect(line).toContain('1ө');
    expect(formatDeadlineLine(new Date(now - 1000).toISOString(), now)).toContain('өнгөрсөн');
    expect(formatDeadlineLine(undefined, now)).toBeNull();
  });
  it('buildDigestMessage includes populated sections and omits empty ones', () => {
    const msg = buildDigestMessage({
      eventName: 'Gameweek 3',
      deadlineIso: new Date(2_000_000_000_000).toISOString(),
      nowMs: 1_999_990_000_000,
      alerts: [{ playerId: 1, name: 'A', team: 'ARS', kind: 'injury', severity: 'high', message: 'out' }],
      captain: { name: 'Salah', team: 'LIV', points: 6.8 },
      vice: { name: 'Palmer', team: 'CHE', points: 5.1 },
      transfer: { label: '1 transfer', moves: ['X → Y'], netGain: 2.1 },
      priceChanges: [{ name: 'A', delta: 0.1 }],
      league: { name: 'Friends', rank: 3, entries: 12, gapToLeader: 14, gapAbove: 3 },
      reports: [],
    });
    expect(msg).toContain('Gameweek 3');
    expect(msg).toContain('Captain: Salah');
    expect(msg).toContain('X → Y');
    expect(msg).toContain('Friends');
    expect(msg).not.toContain('баталгаажаагүй');
  });
});

describe('deadline reminders', () => {
  const deadline = new Date('2026-08-22T12:00:00Z').toISOString();

  it('selects the nearest configured reminder window and ignores expired deadlines', () => {
    expect(deadlineWindow(deadline, Date.parse('2026-08-21T13:00:00Z'))).toBe('24h');
    expect(deadlineWindow(deadline, Date.parse('2026-08-22T07:00:00Z'))).toBe('6h');
    expect(deadlineWindow(deadline, Date.parse('2026-08-22T11:00:00Z'))).toBe('90m');
    expect(deadlineWindow(deadline, Date.parse('2026-08-22T12:00:01Z'))).toBeNull();
  });

  it('deduplicates an unchanged decision but changes key when the decision changes', () => {
    const base = {
      eventName: 'Gameweek 1', window: '6h' as const,
      captain: { name: 'Salah', team: 'LIV', points: 7 },
      vice: { name: 'Palmer', team: 'CHE', points: 6 },
      transfer: { label: 'hold', moves: [], netGain: 0 },
      chip: { chip: 'Wildcard', action: 'Hold', confidence: 80, reason: 'No edge' },
      highRiskCount: 0,
    };
    const first = buildDeadlineAlert(base);
    expect(buildDeadlineAlert(base).key).toBe(first.key);
    expect(buildDeadlineAlert({ ...base, highRiskCount: 1 }).key).not.toBe(first.key);
    expect(first.message).toContain('Captain: Salah');
    expect(first.message).toContain('Transfer: Hold');
  });
});

describe('Telegram delivery limits', () => {
  it('keeps short messages intact and splits long digests below the safe limit', () => {
    expect(splitTelegramMessage('short digest')).toEqual(['short digest']);
    const paragraphs = Array.from(
      { length: 30 },
      (_, index) => `Section ${index}\n${'x'.repeat(180)}`,
    ).join('\n\n');
    const chunks = splitTelegramMessage(paragraphs, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true);
    expect(chunks.join('\n\n')).toContain('Section 29');
  });
});

describe('alertKey (urgent dedup)', () => {
  it('is stable and distinct per player/message', () => {
    expect(alertKey(1, 'out')).toBe(alertKey(1, 'out'));
    expect(alertKey(1, 'out')).not.toBe(alertKey(2, 'out'));
    expect(alertKey(1, 'out')).not.toBe(alertKey(1, 'injured'));
    expect(alertKey(1, 'out')).toMatch(/^fplalert:1:/);
  });
});

describe('predictPriceMoves', () => {
  const els = [
    { id: 1, web_name: 'Riser', cost_change_event: 0, transfers_in_event: 90000, transfers_out_event: 10000 },
    { id: 2, web_name: 'Faller', cost_change_event: 0, transfers_in_event: 5000, transfers_out_event: 80000 },
    { id: 3, web_name: 'AlreadyMoved', cost_change_event: 1, transfers_in_event: 100000, transfers_out_event: 0 },
    { id: 4, web_name: 'Flat', cost_change_event: 0, transfers_in_event: 100, transfers_out_event: 100 },
  ] as unknown as FplPlayer[];
  it('separates risers/fallers and excludes already-moved and flat players', () => {
    const { risers, fallers } = predictPriceMoves(els, 1_000_000);
    expect(risers.map((r) => r.id)).toContain(1);
    expect(risers.map((r) => r.id)).not.toContain(3);
    expect(risers.map((r) => r.id)).not.toContain(4);
    expect(fallers.map((f) => f.id)).toContain(2);
  });
  it('isLikelyMove thresholds on momentum', () => {
    expect(isLikelyMove(0.05)).toBe(true);
    expect(isLikelyMove(0.01)).toBe(false);
  });
});

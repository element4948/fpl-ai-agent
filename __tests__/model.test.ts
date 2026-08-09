import { describe, it, expect } from 'vitest';
import { normalizeTeamStrength, fixtureAttackMultiplier, cleanSheetProbabilityFrom } from '@/lib/fpl';
import { headlineMentionsName } from '@/lib/external-news';
import { validateSquad } from '@/lib/rules';
import { captainScore } from '@/lib/scoring';
import { suggestSafeTransfers, buildTransferPlans } from '@/lib/transfers';
import { buildSquadAlerts, buildSquadReports } from '@/lib/squad-alerts';
import { formatDeadlineLine, buildDigestMessage } from '@/lib/digest';
import { makePlayer, makeLegalSquad } from './helpers';

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

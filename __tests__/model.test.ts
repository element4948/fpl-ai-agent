import { describe, it, expect } from 'vitest';
import { normalizeTeamStrength } from '@/lib/fpl';
import { headlineMentionsName } from '@/lib/external-news';
import { validateSquad } from '@/lib/rules';
import { captainScore } from '@/lib/scoring';
import { suggestSafeTransfers } from '@/lib/transfers';
import { makePlayer, makeLegalSquad } from './helpers';

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

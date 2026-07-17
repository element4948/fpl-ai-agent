import type { ModelPlayer } from '@/types/fpl';
import type { RiskBreakdown } from './risk';

export type Explanation = {
    positives: string[];
    warnings: string[];
};

export function explainPlayer(player: ModelPlayer, risk: RiskBreakdown): Explanation {
    const positives: string[] = [];
    const warnings: string[] = [];

    const nextDifficulty = player.fixture?.nextDifficulty ?? 3;

    const averageDifficulty = player.fixture?.averageDifficulty ?? 3;

    if (player.expectedPoints >= 5.5) {
        positives.push('highExpectedPoints');
    }

    if (player.form >= 5) {
        positives.push('strongForm');
    }

    if (nextDifficulty <= 2 || averageDifficulty <= 2.8 || (player.fixtureScore || 0) >= 3.5) {
        positives.push('goodFixtures');
    }

    if (nextDifficulty >= 4 || averageDifficulty >= 4) {
        warnings.push('hardFixtures');
    }

    if (player.minutes >= 1800) {
        positives.push('secureMinutes');
    }

    if (player.valueScore >= 0.8) {
        positives.push('goodValue');
    }

    if (player.ownership >= 20) {
        positives.push('rankProtection');
    }

    if (player.ownership <= 10) {
        positives.push('differentialUpside');
    }

    if (risk.injury >= 40) {
        warnings.push('injuryConcern');
    }

    if (risk.rotation >= 30) {
        warnings.push('rotationConcern');
    }

    if (risk.minutes >= 30) {
        warnings.push('minutesConcern');
    }

    if (risk.news >= 30) {
        warnings.push('newsConcern');
    }

    if (player.expectedPoints < 3.5) {
        warnings.push('lowProjection');
    }

    if (!positives.length) {
        positives.push('balancedProfile');
    }

    if (!warnings.length) {
        warnings.push('noMajorWarning');
    }

    return {
        positives: positives.slice(0, 5),
        warnings: warnings.slice(0, 3),
    };
}

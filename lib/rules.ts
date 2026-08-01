import { likelyStarterCount, selectBestLineup } from '@/lib/lineup';
import { buildDraftTrust } from '@/lib/evidence';
import { calculateDraftFlexibility, maximumDraftSpend } from '@/lib/flexibility';
import { isReliableStarter } from '@/lib/starter';
import { positionMetricChecks } from '@/lib/position-model';
import { optimizeSquadGlobally } from '@/lib/squad-optimizer';
import type { DraftTeam, ModelPlayer, SquadValidation } from '@/types/fpl';

const TOTAL_BUDGET = 100;

const POSITION_REQUIREMENTS: Record<string, number> = {
    GKP: 2,
    DEF: 5,
    MID: 5,
    FWD: 3,
};

type DraftMode = DraftTeam['mode'];

function roundMoney(value: number): number {
    return Number(value.toFixed(1));
}

function playerScore(player: ModelPlayer, mode: DraftMode): number {
    const gameweeks = Math.max(1, player.projection.gameweeks);
    const horizon =
        (player.projection.next3 / Math.min(3, gameweeks)) * 0.45 +
        (player.projection.next5 / Math.min(5, gameweeks)) * 0.35 +
        (player.projection.next8 / Math.min(8, gameweeks)) * 0.2;
    const uncertaintyPenalty =
        player.dataQuality === 'unknown' ? 3 : player.dataQuality === 'limited' ? 0.6 : 0;

    if (mode === 'Differential') {
        return player.expectedPoints + horizon * 1.2 + player.valueScore * 0.45 - player.ownership * 0.025 - player.risk * 0.012 - uncertaintyPenalty;
    }

    if (mode === 'Safe') {
        return player.expectedPoints * 0.95 + horizon * 1.1 - player.risk * 0.03 - uncertaintyPenalty * 1.4;
    }

    if (mode === 'Alternative') {
        return player.expectedPoints * 0.85 + horizon * 1.05 + player.valueScore * 0.9 - player.risk * 0.016 - uncertaintyPenalty;
    }

    return player.expectedPoints * 1.1 + horizon * 1.3 + player.valueScore * 0.35 - player.risk * 0.018 - uncertaintyPenalty;
}

function isSquadEligible(player: ModelPlayer, mode: DraftMode) {
    if (isReliableStarter(player)) return true;
    if (mode === 'Safe') return false;
    const verifiedHighWarning = player.externalNews?.some(
        (signal) => signal.severity === 'high' &&
            (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
    );
    return player.status === 'a' &&
        player.dataQuality !== 'unknown' &&
        player.roleAssessment?.role !== 'backup' &&
        player.roleAssessment?.role !== 'competition' &&
        !verifiedHighWarning &&
        player.starterConfidence >= 58 &&
        player.predictedMinutes >= 50;
}

function buildSelectionAudit(
    selected: ModelPlayer[],
    evaluatedPlayers: ModelPlayer[],
    eligiblePlayers: ModelPlayer[],
    mode: DraftMode,
) {
    return Object.fromEntries(selected.map((player) => {
        const pool = evaluatedPlayers
            .filter((candidate) => candidate.position === player.position)
            .sort((a, b) => playerScore(b, mode) - playerScore(a, mode));
        const eligiblePool = eligiblePlayers
            .filter((candidate) => candidate.position === player.position)
            .sort((a, b) => playerScore(b, mode) - playerScore(a, mode));
        const rank = Math.max(1, pool.findIndex((candidate) => candidate.id === player.id) + 1);
        const eligibleRank = Math.max(1, eligiblePool.findIndex((candidate) => candidate.id === player.id) + 1);
        const checks = positionMetricChecks(player);
        return [player.id, {
            rank,
            totalCandidates: pool.length,
            eligibleRank,
            eligibleCandidates: eligiblePool.length,
            higherRankedRejected: Math.max(0, rank - eligibleRank),
            passedMetrics: checks.filter(Boolean).length,
            totalMetrics: checks.length,
        }];
    }));
}

export function validateSquad(players: ModelPlayer[], budget = TOTAL_BUDGET): SquadValidation {
    const errors: string[] = [];

    const totalCost = roundMoney(players.reduce((sum, player) => sum + player.price, 0));

    const positionCounts: Record<string, number> = {};
    const clubCounts: Record<string, number> = {};

    for (const player of players) {
        positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;

        clubCounts[player.team] = (clubCounts[player.team] || 0) + 1;
    }

    if (players.length !== 15) {
        errors.push(`Squad must have 15 players. Current: ${players.length}`);
    }

    if (totalCost > budget) {
        errors.push(`Budget exceeded: £${totalCost}m / £${budget}m`);
    }

    for (const [position, requiredCount] of Object.entries(POSITION_REQUIREMENTS)) {
        const currentCount = positionCounts[position] || 0;

        if (currentCount !== requiredCount) {
            errors.push(`${position} must be ${requiredCount}. Current: ${currentCount}`);
        }
    }

    for (const [team, count] of Object.entries(clubCounts)) {
        if (count > 3) {
            errors.push(`${team} has ${count} players. Max 3.`);
        }
    }

    return {
        valid: errors.length === 0,
        totalCost,
        errors,
        positionCounts,
        clubCounts,
    };
}

function buildCheapestValidBase(
    players: ModelPlayer[],
    mode: DraftMode,
): ModelPlayer[] {
    const selected: ModelPlayer[] = [];
    const selectedIds = new Set<number>();
    const clubCounts: Record<string, number> = {};

    const positionOrder = ['GKP', 'DEF', 'MID', 'FWD'];

    for (const position of positionOrder) {
        const requiredCount = POSITION_REQUIREMENTS[position];

        const candidates = players
            .filter(
                (player) =>
                    player.position === position &&
                    player.status !== 'u' &&
                    isReliableStarter(player),
            )
            .sort((a, b) => {
                if (a.price !== b.price) {
                    return a.price - b.price;
                }

                return playerScore(b, 'Safe') - playerScore(a, 'Safe');
            });

        for (const candidate of candidates) {
            if (selected.filter((player) => player.position === position).length >= requiredCount) {
                break;
            }

            if (selectedIds.has(candidate.id)) {
                continue;
            }

            if ((clubCounts[candidate.team] || 0) >= 3) {
                continue;
            }

            selected.push(candidate);
            selectedIds.add(candidate.id);

            clubCounts[candidate.team] = (clubCounts[candidate.team] || 0) + 1;
        }
    }

    return selected;
}

function canReplacePlayer(
    currentPlayer: ModelPlayer,
    incomingPlayer: ModelPlayer,
    selected: ModelPlayer[],
    currentCost: number,
    maximumSpend: number,
): boolean {
    if (currentPlayer.id === incomingPlayer.id) {
        return false;
    }

    if (currentPlayer.position !== incomingPlayer.position) {
        return false;
    }

    if (selected.some((player) => player.id === incomingPlayer.id)) {
        return false;
    }

    const newCost = roundMoney(currentCost - currentPlayer.price + incomingPlayer.price);

    if (newCost > maximumSpend) {
        return false;
    }

    const clubCounts: Record<string, number> = {};

    for (const player of selected) {
        if (player.id === currentPlayer.id) {
            continue;
        }

        clubCounts[player.team] = (clubCounts[player.team] || 0) + 1;
    }

    return (clubCounts[incomingPlayer.team] || 0) < 3;
}

function optimizeSquad(baseSquad: ModelPlayer[], allPlayers: ModelPlayer[], mode: DraftMode): ModelPlayer[] {
    let selected = [...baseSquad];
    const maximumSpend = maximumDraftSpend(mode);

    const candidatePool = allPlayers
        .filter(
            (player) =>
                player.status !== 'u' &&
                isReliableStarter(player),
        )
        .sort((a, b) => playerScore(b, mode) - playerScore(a, mode));

    for (let iteration = 0; iteration < 150; iteration += 1) {
        const currentCost = roundMoney(selected.reduce((sum, player) => sum + player.price, 0));

        let bestSwap:
            | {
                  currentIndex: number;
                  incoming: ModelPlayer;
                  scoreGain: number;
              }
            | undefined;

        for (let currentIndex = 0; currentIndex < selected.length; currentIndex += 1) {
            const currentPlayer = selected[currentIndex];
            const currentScore = playerScore(currentPlayer, mode);

            for (const incomingPlayer of candidatePool) {
                if (!canReplacePlayer(currentPlayer, incomingPlayer, selected, currentCost, maximumSpend)) {
                    continue;
                }

                const scoreGain = playerScore(incomingPlayer, mode) - currentScore;

                if (scoreGain <= 0.001) {
                    continue;
                }

                if (!bestSwap || scoreGain > bestSwap.scoreGain) {
                    bestSwap = {
                        currentIndex,
                        incoming: incomingPlayer,
                        scoreGain,
                    };
                }
            }
        }

        if (!bestSwap) {
            break;
        }

        selected[bestSwap.currentIndex] = bestSwap.incoming;
    }

    return selected;
}

function fixtureDraftExplanation(players: ModelPlayer[]): string[] {
    const strongNextFixtures = players.filter((player) => (player.fixture?.nextDifficulty ?? 3) <= 2).length;

    const goodFixtureRuns = players.filter((player) => (player.fixture?.averageDifficulty ?? 3) <= 2.8).length;

    const homeFixtures = players.filter((player) => player.fixture?.nextIsHome === true).length;

    return [
        `${strongNextFixtures} players have FDR 1–2 next fixtures`,
        `${goodFixtureRuns} players have a favourable next-five fixture run`,
        `${homeFixtures} players are at home in the next fixture`,
    ];
}

function baseDraftExplanation(mode: DraftMode): string[] {
    if (mode === 'Differential') {
        return ['Lower ownership bias', 'Fixture upside is weighted strongly', 'Useful when chasing mini-league gaps'];
    }

    if (mode === 'Safe') {
        return ['Minutes and availability bias', 'Avoids injury and rotation risk', 'Fixture difficulty is included'];
    }

    if (mode === 'Alternative') {
        return ['Value-first squad structure', 'Fixture run affects player ranking', 'Different price distribution from Best Draft'];
    }

    return ['Highest projected points bias', 'Budget, value, fixture and risk used together', 'Main recommended draft'];
}

export function buildDraft(players: ModelPlayer[], mode: DraftMode): DraftTeam {
    const availablePlayers = players.filter(
        (player) => ['GKP', 'DEF', 'MID', 'FWD'].includes(player.position) && player.price > 0 && player.status !== 'u',
    );

    const reliablePlayers = availablePlayers.filter(isReliableStarter);
    const eligiblePlayers = availablePlayers.filter((player) => isSquadEligible(player, mode));
    const globallyOptimized = optimizeSquadGlobally(
        eligiblePlayers,
        maximumDraftSpend(mode),
        (player) => playerScore(player, mode),
        mode,
    );
    const baseSquad = globallyOptimized.length === 15
        ? globallyOptimized
        : buildCheapestValidBase(availablePlayers, mode);

    if (baseSquad.length !== 15) {
        const validation = validateSquad(baseSquad);
        const trust = buildDraftTrust(baseSquad, []);
        const flexibility = calculateDraftFlexibility(baseSquad, baseSquad, availablePlayers, mode);

        return {
            mode,
            players: baseSquad,

            startingXI: [],
            bench: baseSquad,
            formation: '4-4-2',
            formationAlternatives: [],

            validation,
            trust,
            flexibility,
            selectionAudit: buildSelectionAudit(baseSquad, availablePlayers, eligiblePlayers, mode),
            explanation: [...baseDraftExplanation(mode), 'Could not create a complete 15-player squad from current API data'],
        };
    }

    const optimizedSquad = globallyOptimized.length === 15
        ? globallyOptimized
        : optimizeSquad(baseSquad, availablePlayers, mode);

    const sortedSquad = [...optimizedSquad].sort((a, b) => {
        const positionOrder: Record<string, number> = {
            GKP: 1,
            DEF: 2,
            MID: 3,
            FWD: 4,
        };

        const positionDifference = positionOrder[a.position] - positionOrder[b.position];

        if (positionDifference !== 0) {
            return positionDifference;
        }

        return playerScore(b, mode) - playerScore(a, mode);
    });

    const lineup = selectBestLineup(sortedSquad, mode);

    const playableDefenders = likelyStarterCount(sortedSquad, 'DEF');

    const playableGoalkeepers = likelyStarterCount(sortedSquad, 'GKP');
    const playableMidfielders = likelyStarterCount(sortedSquad, 'MID');
    const playableForwards = likelyStarterCount(sortedSquad, 'FWD');

    const validation = validateSquad(sortedSquad);
    const trust = buildDraftTrust(sortedSquad, lineup.startingXI);
    const flexibility = calculateDraftFlexibility(
        sortedSquad,
        lineup.bench,
        availablePlayers,
        mode,
    );
    const unknownStartingPlayers = lineup.startingXI.filter(
        (player) => player.dataQuality === 'unknown',
    );

    const requiredReliableDefenders = mode === 'Safe' ? 5 : 4;
    if (playableDefenders < requiredReliableDefenders) {
        validation.valid = false;
        validation.errors.push(
            `Only ${playableDefenders} defenders are reliable starters. ${mode} requires ${requiredReliableDefenders}.`,
        );
    }

    if (playableGoalkeepers < 1) {
        validation.valid = false;
        validation.errors.push('No goalkeeper is currently likely to start.');
    }
    if (mode === 'Safe' && playableGoalkeepers < 2) {
        validation.valid = false;
        validation.errors.push(
            `Only ${playableGoalkeepers} goalkeeper is a reliable starter. Every draft requires two playable goalkeepers.`,
        );
    }

    if (playableMidfielders < (mode === 'Safe' ? 5 : 4)) {
        validation.valid = false;
        validation.errors.push(`Only ${playableMidfielders} midfielders are reliable starters. All 5 are required.`);
    }

    if (playableForwards < (mode === 'Safe' ? 3 : 2)) {
        validation.valid = false;
        validation.errors.push(`Only ${playableForwards} forwards are reliable starters. All 3 are required.`);
    }

    if (lineup.startingXI.length !== 11) {
        validation.valid = false;
        validation.errors.push(`Starting XI must have 11 players. Current: ${lineup.startingXI.length}`);
    }

    if (unknownStartingPlayers.length > 0) {
        validation.valid = false;
        validation.errors.push(
            `${unknownStartingPlayers.length} Starting XI players have unknown minutes data: ${unknownStartingPlayers
                .map((player) => player.name)
                .join(', ')}.`,
        );
    }
    if (trust.status === 'insufficient') {
        validation.valid = false;
        validation.errors.push('Draft evidence coverage is insufficient. Treat this squad as provisional only.');
    }
    if (mode !== 'Differential' && flexibility.bank < flexibility.targetBank) {
        validation.valid = false;
        validation.errors.push(
            `GW1 flexibility requires £${flexibility.targetBank.toFixed(1)}m bank. Current: £${flexibility.bank.toFixed(1)}m.`,
        );
    }

    return {
        mode,
        players: sortedSquad,

        startingXI: lineup.startingXI,
        bench: lineup.bench,
        formation: lineup.formation,
        formationAlternatives: lineup.alternatives,

        validation,
        trust,
        flexibility,
        selectionAudit: buildSelectionAudit(sortedSquad, availablePlayers, eligiblePlayers, mode),

        explanation: [
            ...baseDraftExplanation(mode),
            ...fixtureDraftExplanation(sortedSquad),
            `Best formation: ${lineup.formation}`,
            `${playableDefenders}/5 defenders are reliable starters`,
            `${playableMidfielders}/5 midfielders and ${playableForwards}/3 forwards are reliable starters`,
            `${sortedSquad.filter((player) => player.dataQuality === 'good').length}/15 players have good data quality`,
            `Flexibility ${flexibility.score}/100 · £${flexibility.bank.toFixed(1)}m bank · ${flexibility.pricePointCount} price points`,
            ...lineup.warnings,
        ],
    };
}

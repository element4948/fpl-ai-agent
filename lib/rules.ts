import { likelyStarterCount, selectBestLineup } from '@/lib/lineup';
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
    const fixtureScore = player.fixtureScore ?? 3;
    const nextDifficulty = player.fixture?.nextDifficulty ?? 3;
    const averageDifficulty = player.fixture?.averageDifficulty ?? 3;

    const nextFixtureBonus = (6 - nextDifficulty) * 0.45;
    const fixtureRunBonus = (6 - averageDifficulty) * 0.3;
    const homeBonus = player.fixture?.nextIsHome ? 0.15 : 0;

    const fixtureContribution = fixtureScore * 0.9 + nextFixtureBonus + fixtureRunBonus + homeBonus;
    const starterContribution =
        player.starterConfidence * 0.22 +
        player.predictedMinutes * 0.16 -
        (player.dataQuality === 'unknown' ? 24 : player.dataQuality === 'limited' ? 6 : 0);

    if (mode === 'Differential') {
        return player.expectedPoints * 1.15 + player.valueScore * 2.2 + fixtureContribution * 1.05 + starterContribution - player.ownership * 0.075 - player.risk * 0.035;
    }

    if (mode === 'Safe') {
        return player.expectedPoints * 1.2 + player.confidence * 0.055 + starterContribution * 1.25 + fixtureContribution * 0.9 - player.risk * 0.075;
    }

    if (mode === 'Alternative') {
        return player.expectedPoints * 0.9 + player.valueScore * 3 + starterContribution + fixtureContribution * 0.95 - player.ownership * 0.012 - player.risk * 0.035;
    }

    return player.expectedPoints * 1.55 + player.valueScore * 1.1 + starterContribution + fixtureContribution - player.risk * 0.05;
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

function buildCheapestValidBase(players: ModelPlayer[]): ModelPlayer[] {
    const selected: ModelPlayer[] = [];
    const selectedIds = new Set<number>();
    const clubCounts: Record<string, number> = {};

    const positionOrder = ['GKP', 'DEF', 'MID', 'FWD'];

    for (const position of positionOrder) {
        const requiredCount = POSITION_REQUIREMENTS[position];

        const candidates = players
            .filter((player) => player.position === position && player.status !== 'u')
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

function canReplacePlayer(currentPlayer: ModelPlayer, incomingPlayer: ModelPlayer, selected: ModelPlayer[], currentCost: number): boolean {
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

    if (newCost > TOTAL_BUDGET) {
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

    const candidatePool = allPlayers.filter((player) => player.status !== 'u').sort((a, b) => playerScore(b, mode) - playerScore(a, mode));

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
                if (!canReplacePlayer(currentPlayer, incomingPlayer, selected, currentCost)) {
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

    const baseSquad = buildCheapestValidBase(availablePlayers);

    if (baseSquad.length !== 15) {
        const validation = validateSquad(baseSquad);

        return {
            mode,
            players: baseSquad,

            startingXI: [],
            bench: baseSquad,
            formation: '4-4-2',

            validation,
            explanation: [...baseDraftExplanation(mode), 'Could not create a complete 15-player squad from current API data'],
        };
    }

    const optimizedSquad = optimizeSquad(baseSquad, availablePlayers, mode);

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

    const lineup = selectBestLineup(sortedSquad);

    const playableDefenders = likelyStarterCount(sortedSquad, 'DEF');

    const playableGoalkeepers = likelyStarterCount(sortedSquad, 'GKP');
    const playableMidfielders = likelyStarterCount(sortedSquad, 'MID');
    const playableForwards = likelyStarterCount(sortedSquad, 'FWD');

    const validation = validateSquad(sortedSquad);

    if (playableDefenders < 4) {
        validation.valid = false;
        validation.errors.push(`Only ${playableDefenders} defenders are reliable starters. Minimum 4 required for safe cover.`);
    }

    if (playableGoalkeepers < 1) {
        validation.valid = false;
        validation.errors.push('No goalkeeper is currently likely to start.');
    }

    if (playableMidfielders < 4) {
        validation.valid = false;
        validation.errors.push(`Only ${playableMidfielders} midfielders are reliable starters. Minimum 4 required.`);
    }

    if (playableForwards < 2) {
        validation.valid = false;
        validation.errors.push(`Only ${playableForwards} forwards are reliable starters. Minimum 2 required.`);
    }

    if (lineup.startingXI.length !== 11) {
        validation.valid = false;
        validation.errors.push(`Starting XI must have 11 players. Current: ${lineup.startingXI.length}`);
    }

    return {
        mode,
        players: sortedSquad,

        startingXI: lineup.startingXI,
        bench: lineup.bench,
        formation: lineup.formation,

        validation,

        explanation: [
            ...baseDraftExplanation(mode),
            ...fixtureDraftExplanation(sortedSquad),
            `Best formation: ${lineup.formation}`,
            `${playableDefenders}/5 defenders are reliable starters`,
            `${playableMidfielders}/5 midfielders and ${playableForwards}/3 forwards are reliable starters`,
            ...lineup.warnings,
        ],
    };
}

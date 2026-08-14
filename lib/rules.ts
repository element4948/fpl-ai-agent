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
    const verifiedHighWarning = player.externalNews?.some(
        (signal) => signal.severity === 'high' &&
            (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
    );
    // A legal 15-player squad may contain low-cost cover that is not strong
    // enough for the XI. The lineup gate below still requires reliable
    // starters; this branch exists only so the optimizer can fund them with a
    // cheap second/third substitute instead of buying 15 equal players.
    const reserveThreshold = mode === 'Safe' ? 48 : 38;
    return player.status === 'a' &&
        player.dataQuality !== 'unknown' &&
        player.roleAssessment?.role !== 'backup' &&
        !verifiedHighWarning &&
        player.starterConfidence >= reserveThreshold &&
        player.predictedMinutes >= (mode === 'Safe' ? 35 : 25) &&
        player.appearanceProbability >= (mode === 'Safe' ? 0.5 : 0.4) &&
        player.risk <= 55;
}

function isBudgetBenchCandidate(player: ModelPlayer) {
    const verifiedHighWarning = player.externalNews?.some(
        (signal) => signal.severity === 'high' &&
            (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
    );
    return player.status === 'a' &&
        player.dataQuality !== 'unknown' &&
        player.roleAssessment?.role !== 'backup' &&
        !verifiedHighWarning &&
        player.starterConfidence >= 38 &&
        player.predictedMinutes >= 25 &&
        player.appearanceProbability >= 0.4 &&
        player.risk <= 55;
}

/*
 * Build the reserve unit after the strongest legal XI is known. This is a
 * deliberate two-budget model: starters compete for points, while substitutes
 * compete on low price plus usable emergency cover. A future difficult fixture
 * is handled by the transfer roadmap and never funds a permanent premium bench.
 */
function rebalanceBench(
    squad: ModelPlayer[],
    allPlayers: ModelPlayer[],
    mode: DraftMode,
) {
    const initialLineup = selectBestLineup(squad, mode);
    if (initialLineup.startingXI.length !== 11) return squad;

    const starters = initialLineup.startingXI;
    const starterIds = new Set(starters.map((player) => player.id));
    const clubCounts = new Map<number, number>();
    for (const player of starters) {
        clubCounts.set(player.teamId, (clubCounts.get(player.teamId) || 0) + 1);
    }
    const required = { GKP: 2, DEF: 5, MID: 5, FWD: 3 } as Record<string, number>;
    for (const player of starters) required[player.position] -= 1;
    const slots = Object.entries(required).flatMap(([position, count]) =>
        Array.from({ length: count }, () => position),
    );
    const pools = Object.fromEntries(
        Object.keys(required).map((position) => [
            position,
            allPlayers
                .filter((player) =>
                    player.position === position &&
                    !starterIds.has(player.id) &&
                    isBudgetBenchCandidate(player))
                .sort((a, b) => a.price - b.price || playerScore(b, mode) - playerScore(a, mode))
                .slice(0, 14),
        ]),
    ) as Record<string, ModelPlayer[]>;
    if (slots.some((position) => !pools[position]?.length)) return squad;

    let bestBench: ModelPlayer[] | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    let bestTieBreak = Number.NEGATIVE_INFINITY;
    const search = (
        index: number,
        selected: ModelPlayer[],
        ids: Set<number>,
        counts: Map<number, number>,
        cost: number,
    ) => {
        if (cost > bestCost + 0.001) return;
        if (index === slots.length) {
            const total = roundMoney(starters.reduce((sum, player) => sum + player.price, 0) + cost);
            if (total > maximumDraftSpend(mode) + 0.001) return;
            // Require at least one reliably-starting outfield substitute so the
            // most-likely auto-sub (and any Bench Boost) actually plays, rather
            // than the absolute-cheapest rotation-risk cover. The remaining bench
            // spots stay lean. Falls back to the original squad if no cheap
            // nailed option is constructible.
            const hasNailedOutfieldSub = selected.some(
                (player) => player.position !== 'GKP' && player.appearanceProbability >= 0.6,
            );
            if (!hasNailedOutfieldSub) return;
            const tieBreak = selected.reduce((sum, player) => sum + playerScore(player, mode), 0);
            if (cost < bestCost - 0.001 || (Math.abs(cost - bestCost) < 0.001 && tieBreak > bestTieBreak)) {
                bestBench = [...selected];
                bestCost = cost;
                bestTieBreak = tieBreak;
            }
            return;
        }
        const position = slots[index];
        for (const player of pools[position]) {
            if (ids.has(player.id) || (counts.get(player.teamId) || 0) >= 3) continue;
            ids.add(player.id);
            counts.set(player.teamId, (counts.get(player.teamId) || 0) + 1);
            selected.push(player);
            search(index + 1, selected, ids, counts, roundMoney(cost + player.price));
            selected.pop();
            const nextCount = (counts.get(player.teamId) || 1) - 1;
            if (nextCount) counts.set(player.teamId, nextCount);
            else counts.delete(player.teamId);
            ids.delete(player.id);
        }
    };
    search(0, [], new Set<number>(), new Map(clubCounts), 0);
    if (!bestBench) return squad;

    // Reinvest money released from the bench into the XI. Test both a direct
    // upgrade and a paired reallocation (for example, downgrade an overpriced
    // MID and use the saving on a DEF). The paired move avoids getting trapped
    // by the current £0.5m bank when two coordinated changes improve total XI.
    const leanBench: ModelPlayer[] = bestBench;
    let upgradedStarters = [...starters];
    const candidatePools = Object.fromEntries(
        ['GKP', 'DEF', 'MID', 'FWD'].map((position) => [
            position,
            allPlayers
                .filter((player) => player.position === position && isReliableStarter(player))
                .sort((a, b) => playerScore(b, mode) - playerScore(a, mode))
                .slice(0, 18),
        ]),
    ) as Record<string, ModelPlayer[]>;
    for (let iteration = 0; iteration < 8; iteration += 1) {
        const selected = [...upgradedStarters, ...leanBench];
        const selectedIds = new Set(selected.map((player) => player.id));
        let bestMove: { replacements: Array<{ index: number; player: ModelPlayer }>; gain: number } | null = null;
        const moveIsLegal = (replacements: Array<{ index: number; player: ModelPlayer }>) => {
            const replacementIds = new Set(replacements.map((item) => item.player.id));
            if (replacementIds.size !== replacements.length) return false;
            const removedIds = new Set(replacements.map((item) => upgradedStarters[item.index].id));
            if (replacements.some((item) => selectedIds.has(item.player.id) && !removedIds.has(item.player.id))) return false;
            const proposed = selected.map((player) => {
                const replacement = replacements.find((item) => upgradedStarters[item.index].id === player.id);
                return replacement?.player || player;
            });
            const total = proposed.reduce((sum, player) => sum + player.price, 0);
            if (total > maximumDraftSpend(mode) + 0.001) return false;
            const proposedIds = new Set(proposed.map((player) => player.id));
            if (proposedIds.size !== proposed.length) return false;
            const proposedClubs = new Map<number, number>();
            for (const player of proposed) {
                const count = (proposedClubs.get(player.teamId) || 0) + 1;
                if (count > 3) return false;
                proposedClubs.set(player.teamId, count);
            }
            return true;
        };
        for (let index = 0; index < upgradedStarters.length; index += 1) {
            const current = upgradedStarters[index];
            for (const candidate of candidatePools[current.position]) {
                const replacements = [{ index, player: candidate }];
                if (!moveIsLegal(replacements)) continue;
                const gain = playerScore(candidate, mode) - playerScore(current, mode);
                if (gain > 0.001 && (!bestMove || gain > bestMove.gain)) {
                    bestMove = { replacements, gain };
                }
            }
        }
        for (let first = 0; first < upgradedStarters.length; first += 1) {
            const firstCurrent = upgradedStarters[first];
            for (let second = first + 1; second < upgradedStarters.length; second += 1) {
                const secondCurrent = upgradedStarters[second];
                for (const firstCandidate of candidatePools[firstCurrent.position]) {
                    for (const secondCandidate of candidatePools[secondCurrent.position]) {
                        const replacements = [
                            { index: first, player: firstCandidate },
                            { index: second, player: secondCandidate },
                        ];
                        if (!moveIsLegal(replacements)) continue;
                        const gain =
                            playerScore(firstCandidate, mode) + playerScore(secondCandidate, mode) -
                            playerScore(firstCurrent, mode) - playerScore(secondCurrent, mode);
                        if (gain > 0.001 && (!bestMove || gain > bestMove.gain)) {
                            bestMove = { replacements, gain };
                        }
                    }
                }
            }
        }
        if (!bestMove) break;
        for (const replacement of bestMove.replacements) {
            upgradedStarters[replacement.index] = replacement.player;
        }
    }
    return [...upgradedStarters, ...leanBench];
}

function buildSelectionAudit(
    selected: ModelPlayer[],
    evaluatedPlayers: ModelPlayer[],
    eligiblePlayers: ModelPlayer[],
    mode: DraftMode,
) {
    const selectedIds = new Set(selected.map((player) => player.id));
    const selectedCost = roundMoney(selected.reduce((sum, player) => sum + player.price, 0));
    const selectedClubCounts = selected.reduce((counts, player) => {
        counts.set(player.teamId, (counts.get(player.teamId) || 0) + 1);
        return counts;
    }, new Map<number, number>());

    return Object.fromEntries(selected.map((player) => {
        const pool = evaluatedPlayers
            .filter((candidate) => candidate.position === player.position)
            .sort((a, b) => playerScore(b, mode) - playerScore(a, mode));
        const eligiblePool = eligiblePlayers
            .filter((candidate) => candidate.position === player.position)
            .sort((a, b) => playerScore(b, mode) - playerScore(a, mode));
        const rank = Math.max(1, pool.findIndex((candidate) => candidate.id === player.id) + 1);
        const eligibleIndex = eligiblePool.findIndex((candidate) => candidate.id === player.id);
        const eligibleRank = eligibleIndex >= 0 ? eligibleIndex + 1 : null;
        const checks = positionMetricChecks(player);
        const alternativePlayer = eligiblePool.find((candidate) => !selectedIds.has(candidate.id)) || null;
        let alternative: DraftTeam['selectionAudit'][number]['alternative'] = null;
        if (alternativePlayer) {
            const priceDelta = roundMoney(alternativePlayer.price - player.price);
            const newCost = roundMoney(selectedCost + priceDelta);
            const candidateClubCount =
                (selectedClubCounts.get(alternativePlayer.teamId) || 0) -
                (alternativePlayer.teamId === player.teamId ? 1 : 0);
            const clubLimitBlocked = candidateClubCount >= 3;
            const budgetBlocked = newCost > maximumDraftSpend(mode) + 0.001;
            const directSwapLegal = !budgetBlocked && !clubLimitBlocked;
            alternative = {
                id: alternativePlayer.id,
                name: alternativePlayer.name,
                price: alternativePlayer.price,
                priceDelta,
                expectedPointsDelta: Number((alternativePlayer.expectedPoints - player.expectedPoints).toFixed(2)),
                nextFiveDelta: Number((alternativePlayer.projection.next5 - player.projection.next5).toFixed(2)),
                modelScoreDelta: Number((playerScore(alternativePlayer, mode) - playerScore(player, mode)).toFixed(2)),
                directSwapLegal,
                blocker: budgetBlocked
                    ? 'budget'
                    : clubLimitBlocked
                      ? 'club-limit'
                      : directSwapLegal && playerScore(alternativePlayer, mode) > playerScore(player, mode)
                        ? 'global-squad-balance'
                        : 'none',
            };
        }
        return [player.id, {
            rank,
            totalCandidates: pool.length,
            eligibleRank,
            eligibleCandidates: eligiblePool.length,
            higherRankedRejected: eligibleRank == null ? 0 : Math.max(0, rank - eligibleRank),
            passedMetrics: checks.filter(Boolean).length,
            totalMetrics: checks.length,
            alternative,
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

export function buildDraft(
    players: ModelPlayer[],
    mode: DraftMode,
    quality: 'fast' | 'full' = 'full',
): DraftTeam {
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
        // Only the primary "Best" draft needs the full-width beam. The secondary
        // modes (Alternative/Differential/Safe) use a narrower beam so building
        // all four variants is markedly faster with negligible quality loss.
        quality === 'fast' ? 900 : mode === 'Best' ? 4800 : 1800,
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

    const benchBalancedSquad = rebalanceBench(optimizedSquad, availablePlayers, mode);

    const sortedSquad = [...benchBalancedSquad].sort((a, b) => {
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

    const requiredReliableDefenders = 3;
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
    if (playableMidfielders < 2) {
        validation.valid = false;
        validation.errors.push(
            `Only ${playableMidfielders} midfielders are reliable starters. A legal Starting XI requires at least 2.`,
        );
    }

    if (playableForwards < 1) {
        validation.valid = false;
        validation.errors.push(
            `Only ${playableForwards} forwards are reliable starters. A legal Starting XI requires at least 1.`,
        );
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
    if (flexibility.benchCost > flexibility.benchBudgetTarget + 0.1) {
        validation.valid = false;
        validation.errors.push(
            `Bench spend £${flexibility.benchCost.toFixed(1)}m is too high for ${mode}. Target: £${flexibility.benchBudgetTarget.toFixed(1)}m.`,
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
            `Starting XI £${flexibility.startingCost.toFixed(1)}m · bench £${flexibility.benchCost.toFixed(1)}m (target £${flexibility.benchBudgetTarget.toFixed(1)}m)`,
            ...lineup.warnings,
        ],
    };
}

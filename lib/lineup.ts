import type { Formation, ModelPlayer } from '@/types/fpl';
import { isReliableStarter } from './starter';

type FormationRule = {
    formation: Formation;
    GKP: number;
    DEF: number;
    MID: number;
    FWD: number;
};

const FORMATIONS: FormationRule[] = [
    {
        formation: '3-4-3',
        GKP: 1,
        DEF: 3,
        MID: 4,
        FWD: 3,
    },
    {
        formation: '3-5-2',
        GKP: 1,
        DEF: 3,
        MID: 5,
        FWD: 2,
    },
    {
        formation: '4-3-3',
        GKP: 1,
        DEF: 4,
        MID: 3,
        FWD: 3,
    },
    {
        formation: '4-4-2',
        GKP: 1,
        DEF: 4,
        MID: 4,
        FWD: 2,
    },
    {
        formation: '4-5-1',
        GKP: 1,
        DEF: 4,
        MID: 5,
        FWD: 1,
    },
    {
        formation: '5-2-3',
        GKP: 1,
        DEF: 5,
        MID: 2,
        FWD: 3,
    },
    {
        formation: '5-3-2',
        GKP: 1,
        DEF: 5,
        MID: 3,
        FWD: 2,
    },
    {
        formation: '5-4-1',
        GKP: 1,
        DEF: 5,
        MID: 4,
        FWD: 1,
    },
];

export type LineupResult = {
    startingXI: ModelPlayer[];
    bench: ModelPlayer[];
    formation: Formation;
    score: number;
    warnings: string[];
};

function lineupScore(player: ModelPlayer): number {
    const nextFdr = player.fixture?.nextDifficulty ?? 3;

    const averageFdr = player.fixture?.averageDifficulty ?? 3;

    const fixtureBonus = (6 - nextFdr) * 0.55 + (6 - averageFdr) * 0.3 + (player.fixture?.nextIsHome ? 0.25 : 0);

    const reliable = isReliableStarter(player);
    const availabilityPenalty = reliable ? 0 : 30;

    return (
        player.expectedPoints * 2 +
        player.confidence * 0.04 +
        player.starterConfidence * 0.12 +
        player.predictedMinutes * 0.1 +
        fixtureBonus +
        player.form * 0.25 -
        player.risk * 0.09 -
        availabilityPenalty
    );
}

function playersByPosition(squad: ModelPlayer[], position: string): ModelPlayer[] {
    return squad.filter((player) => player.position === position).sort((a, b) => lineupScore(b) - lineupScore(a));
}

function chooseFormation(squad: ModelPlayer[], rule: FormationRule): LineupResult | null {
    const goalkeepers = playersByPosition(squad, 'GKP');

    const defenders = playersByPosition(squad, 'DEF');

    const midfielders = playersByPosition(squad, 'MID');

    const forwards = playersByPosition(squad, 'FWD');

    if (goalkeepers.length < rule.GKP || defenders.length < rule.DEF || midfielders.length < rule.MID || forwards.length < rule.FWD) {
        return null;
    }

    const startingXI = [
        ...goalkeepers.slice(0, rule.GKP),
        ...defenders.slice(0, rule.DEF),
        ...midfielders.slice(0, rule.MID),
        ...forwards.slice(0, rule.FWD),
    ];

    const starterIds = new Set(startingXI.map((player) => player.id));

    const bench = squad
        .filter((player) => !starterIds.has(player.id))
        .sort((a, b) => {
            if (a.position === 'GKP') return 1;
            if (b.position === 'GKP') return -1;

            return lineupScore(b) - lineupScore(a);
        });

    const unavailableStarters = startingXI.filter((player) => !isReliableStarter(player));

    const playableDefenders = startingXI.filter((player) => player.position === 'DEF' && isReliableStarter(player)).length;

    const warnings: string[] = [];

    if (unavailableStarters.length > 0) {
        warnings.push(`${unavailableStarters.length} гарааны тоглогчийн гарах магадлал эргэлзээтэй байна.`);
    }

    if (playableDefenders < 3) {
        warnings.push('Гараанд тоглох боломжтой хамгийн багадаа 3 хамгаалагч шаардлагатай.');
    }

    const score = startingXI.reduce((sum, player) => sum + lineupScore(player), 0) - unavailableStarters.length * 25 - warnings.length * 10;

    return {
        startingXI,
        bench,
        formation: rule.formation,
        score,
        warnings,
    };
}

export function selectBestLineup(squad: ModelPlayer[]): LineupResult {
    const options = FORMATIONS.map((rule) => chooseFormation(squad, rule)).filter((option): option is LineupResult => option !== null);

    const validOptions = options.filter((option) => option.warnings.length === 0);

    const candidates = validOptions.length > 0 ? validOptions : options;

    const best = candidates.sort((a, b) => b.score - a.score)[0];

    if (best) {
        return best;
    }

    return {
        startingXI: [],
        bench: squad,
        formation: '4-4-2',
        score: 0,
        warnings: ['Дүрэм хангасан гарааны бүрэлдэхүүн үүсгэж чадсангүй.'],
    };
}

export function likelyStarterCount(players: ModelPlayer[], position?: string): number {
    return players.filter((player) => (!position || player.position === position) && isReliableStarter(player)).length;
}

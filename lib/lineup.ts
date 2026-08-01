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
    alternatives: Array<{ formation: Formation; projectedScore: number; gap: number }>;
    warnings: string[];
};

function horizonProjection(player: ModelPlayer): number {
    const gameweeks = Math.max(1, player.projection.gameweeks);
    const next3Average = player.projection.next3 / Math.min(3, gameweeks);
    const next5Average = player.projection.next5 / Math.min(5, gameweeks);
    return player.expectedPoints * 0.6 + next3Average * 0.25 + next5Average * 0.15;
}

function lineupScore(player: ModelPlayer): number {
    const reliable = isReliableStarter(player);
    const availabilityPenalty = reliable ? 0 : 30;
    const roleUncertaintyPenalty =
        player.roleAssessment?.role === 'backup'
            ? 45
            : player.roleAssessment?.role === 'competition'
              ? 28
              : 0;

    return (
        horizonProjection(player) * 2.4 -
        player.risk * 0.01 -
        availabilityPenalty -
        roleUncertaintyPenalty
    );
}

function playersByPosition(squad: ModelPlayer[], position: string): ModelPlayer[] {
    return squad.filter((player) => player.position === position).sort((a, b) => lineupScore(b) - lineupScore(a));
}

function chooseFormation(
    squad: ModelPlayer[],
    rule: FormationRule,
    mode: 'Best' | 'Alternative' | 'Differential' | 'Safe',
): LineupResult | null {
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
    const reliableOutfieldBench = bench.filter(
        (player) => player.position !== 'GKP' && isReliableStarter(player),
    );
    const reliableDefenderCover = bench.some(
        (player) => player.position === 'DEF' && isReliableStarter(player),
    );

    if (unavailableStarters.length > 0) {
        warnings.push(`${unavailableStarters.length} гарааны тоглогчийн гарах магадлал эргэлзээтэй байна.`);
    }

    if (playableDefenders < 3) {
        warnings.push('Гараанд тоглох боломжтой хамгийн багадаа 3 хамгаалагч шаардлагатай.');
    }
    if (reliableOutfieldBench.length < 2) {
        warnings.push('Bench cover хангалтгүй: дор хаяж 2 найдвартай outfield сэлгээ шаардлагатай.');
    }
    if (rule.DEF === 3 && !reliableDefenderCover) {
        warnings.push('3 хамгаалагчтай formation боловч найдвартай DEF bench cover алга.');
    }

    const benchResilienceScore = reliableOutfieldBench
        .slice(0, 2)
        .reduce((sum, player) => sum + lineupScore(player) * 0.12, 0);
    const uncertainShare = startingXI.filter((player) => player.dataQuality !== 'good').length /
        Math.max(1, startingXI.length);
    const extraDefenders = Math.max(0, rule.DEF - 3);
    const formationPenalty = extraDefenders * uncertainShare *
        (mode === 'Safe' ? 0.35 : mode === 'Best' ? 0.65 : mode === 'Alternative' ? 0.75 : 0.9);
    const score =
        startingXI.reduce((sum, player) => sum + lineupScore(player), 0) +
        benchResilienceScore -
        formationPenalty -
        unavailableStarters.length * 25 -
        warnings.length * 10;

    return {
        startingXI,
        bench,
        formation: rule.formation,
        score,
        alternatives: [],
        warnings,
    };
}

export function selectBestLineup(
    squad: ModelPlayer[],
    mode: 'Best' | 'Alternative' | 'Differential' | 'Safe' = 'Best',
): LineupResult {
    const options = FORMATIONS.map((rule) => chooseFormation(squad, rule, mode)).filter((option): option is LineupResult => option !== null);

    const validOptions = options.filter((option) => option.warnings.length === 0);

    const candidates = validOptions.length > 0 ? validOptions : options;

    const ranked = candidates.sort((a, b) => b.score - a.score);
    const best = ranked[0];

    if (best) {
        return {
            ...best,
            alternatives: ranked.slice(0, 4).map((option) => ({
                formation: option.formation,
                projectedScore: Number(option.score.toFixed(2)),
                gap: Number((best.score - option.score).toFixed(2)),
            })),
        };
    }

    return {
        startingXI: [],
        bench: squad,
        formation: '4-4-2',
        score: 0,
        alternatives: [],
        warnings: ['Дүрэм хангасан гарааны бүрэлдэхүүн үүсгэж чадсангүй.'],
    };
}

export function likelyStarterCount(players: ModelPlayer[], position?: string): number {
    return players.filter((player) => (!position || player.position === position) && isReliableStarter(player)).length;
}

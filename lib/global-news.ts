import type { FplPlayer, ModelPlayer } from '@/types/fpl';
import { mnFplNews, mnStatus, withSource } from './mn';

// FPL-wide important news — NOT limited to the owner's squad. Built almost
// entirely from FPL's own fields (status / news / ownership / price / transfer
// counts / fixtures) so it is cheap (no extra per-player RSS fetches) and works
// year-round. Source text is kept in the ORIGINAL language (English), concise
// and untranslated, so the reader can translate it themselves if they want.

export type GlobalInjury = { id: number; name: string; team: string; ownership: number; text: string };
export type GlobalMover = { name: string; team: string; net: number };
export type GlobalFixture = { name: string; team: string; opponent: string; difficulty: number; xp: number };
export type GlobalTransfer = { name: string; team: string; inCount: number };

export type GlobalNews = {
    injuries: GlobalInjury[];
    risers: GlobalMover[];
    fallers: GlobalMover[];
    bestFixtures: GlobalFixture[];
    templateIn: GlobalTransfer[];
};

export function buildGlobalNews(input: {
    players: ModelPlayer[];
    elements: FplPlayer[];
    priceMoves: { risers: Array<{ id: number; name: string; net: number; momentum: number }>; fallers: Array<{ id: number; name: string; net: number; momentum: number }> };
    isLikelyMove: (momentum: number) => boolean;
}): GlobalNews {
    const { players, elements, priceMoves, isLikelyMove } = input;
    const teamById = new Map(players.map((p) => [p.id, p.team]));

    // 1) Notable availability/injury changes among players the wider field owns
    //    or values highly. FPL's own `news` field is already English.
    const injuries: GlobalInjury[] = players
        .filter((p) => p.status && p.status !== 'a')
        .filter((p) => p.ownership >= 6 || p.price >= 6.5)
        .filter((p) => (p.news && p.news.trim().length > 0) || p.status === 's' || p.status === 'i' || p.status === 'o')
        .sort((a, b) => b.ownership - a.ownership)
        .slice(0, 8)
        .map((p) => {
            // Body in Mongolian; the FPL `news` field (no publisher suffix, so it
            // is NOT run through the RSS `concise` publisher-stripper) is attached
            // untranslated as the English source, just length-capped.
            const raw = (p.news || '').trim();
            const english = raw.length > 96 ? `${raw.slice(0, 95).trimEnd()}…` : raw;
            const mn = english ? mnFplNews(english) || mnStatus(p.status) : mnStatus(p.status);
            return {
                id: p.id,
                name: p.name,
                team: p.team,
                ownership: p.ownership,
                text: withSource(mn, english),
            };
        });

    // 2) Biggest predicted price moves game-wide (estimate, not a guarantee).
    const risers: GlobalMover[] = priceMoves.risers
        .filter((m) => isLikelyMove(m.momentum))
        .slice(0, 6)
        .map((m) => ({ name: m.name, team: teamById.get(m.id) || '', net: m.net }));
    const fallers: GlobalMover[] = priceMoves.fallers
        .filter((m) => isLikelyMove(m.momentum))
        .slice(0, 6)
        .map((m) => ({ name: m.name, team: teamById.get(m.id) || '', net: m.net }));

    // 3) Best upcoming fixtures — the strongest attacking assets facing the
    //    easiest next opponent (FDR ≤ 2).
    const bestFixtures: GlobalFixture[] = players
        .filter((p) => (p.fixture?.nextDifficulty ?? 5) <= 2 && p.position !== 'GKP')
        .filter((p) => (p.status || 'a') === 'a' && p.expectedPoints > 0)
        .sort((a, b) => b.expectedPoints - a.expectedPoints)
        .slice(0, 6)
        .map((p) => ({
            name: p.name,
            team: p.team,
            opponent: p.fixture?.nextOpponent ?? 'TBD',
            difficulty: p.fixture?.nextDifficulty ?? 0,
            xp: p.expectedPoints,
        }));

    // 4) Where the field is moving — most transferred IN this gameweek (the
    //    "template" everyone is buying). Straight from FPL transfer counts.
    const templateIn: GlobalTransfer[] = [...elements]
        .filter((e) => Number(e.transfers_in_event || 0) > 0)
        .sort((a, b) => Number(b.transfers_in_event || 0) - Number(a.transfers_in_event || 0))
        .slice(0, 6)
        .map((e) => ({ name: e.web_name, team: teamById.get(e.id) || '', inCount: Number(e.transfers_in_event || 0) }));

    return { injuries, risers, fallers, bestFixtures, templateIn };
}

export function hasGlobalNews(news: GlobalNews): boolean {
    return Boolean(
        news.injuries.length ||
            news.risers.length ||
            news.fallers.length ||
            news.bestFixtures.length ||
            news.templateIn.length,
    );
}

import { describe, expect, it } from 'vitest';
import { buildGlobalNews, hasGlobalNews } from '@/lib/global-news';
import { buildDigestMessage } from '@/lib/digest';
import type { FplPlayer } from '@/types/fpl';
import { makePlayer } from './helpers';

function elem(id: number, web_name: string, extra: Record<string, number> = {}): FplPlayer {
    return { id, web_name, transfers_in_event: 0, transfers_out_event: 0, cost_change_event: 0, ...extra } as unknown as FplPlayer;
}

describe('buildGlobalNews', () => {
    it('surfaces injured high-owned players with concise untranslated source text', () => {
        const players = [
            makePlayer({ id: 10, name: 'Star', team: 'ARS', ownership: 40, status: 'i', news: 'Hamstring injury - expected back in October - Sky Sports' }),
            makePlayer({ id: 11, name: 'Nobody', team: 'BUR', ownership: 0.2, price: 4.0, status: 'i', news: 'Knock' }),
            makePlayer({ id: 12, name: 'Fit', team: 'MCI', ownership: 30, status: 'a', news: '' }),
        ];
        const elements = players.map((p) => elem(p.id, p.name));
        const news = buildGlobalNews({ players, elements, priceMoves: { risers: [], fallers: [] }, isLikelyMove: () => true });

        expect(news.injuries.map((i) => i.name)).toContain('Star');
        // Low-owned, cheap player is excluded from the FPL-wide injury list.
        expect(news.injuries.map((i) => i.name)).not.toContain('Nobody');
        // Available player is not an injury.
        expect(news.injuries.map((i) => i.name)).not.toContain('Fit');
        // Source text stays English and the trailing " - Publisher" is trimmed.
        const star = news.injuries.find((i) => i.name === 'Star')!;
        expect(star.text).toBe('Hamstring injury - expected back in October');
        expect(star.text).not.toMatch(/Sky Sports/);
    });

    it('ranks best fixtures by expected points among easy opponents', () => {
        const players = [
            makePlayer({ id: 1, name: 'EasyBig', team: 'LIV', position: 'FWD', positionId: 4, expectedPoints: 7, status: 'a', fixture: { nextOpponent: 'SHU', nextDifficulty: 2 } as never }),
            makePlayer({ id: 2, name: 'EasySmall', team: 'BHA', position: 'MID', positionId: 3, expectedPoints: 3, status: 'a', fixture: { nextOpponent: 'LUT', nextDifficulty: 2 } as never }),
            makePlayer({ id: 3, name: 'HardBig', team: 'CHE', position: 'FWD', positionId: 4, expectedPoints: 8, status: 'a', fixture: { nextOpponent: 'MCI', nextDifficulty: 5 } as never }),
        ];
        const elements = players.map((p) => elem(p.id, p.name));
        const news = buildGlobalNews({ players, elements, priceMoves: { risers: [], fallers: [] }, isLikelyMove: () => true });
        expect(news.bestFixtures[0]?.name).toBe('EasyBig');
        expect(news.bestFixtures.map((f) => f.name)).not.toContain('HardBig');
    });

    it('lists the most transferred-in players as template moves', () => {
        const players = [makePlayer({ id: 1, name: 'Hot', team: 'ARS' }), makePlayer({ id: 2, name: 'Cold', team: 'BUR' })];
        const elements = [elem(1, 'Hot', { transfers_in_event: 500000 }), elem(2, 'Cold', { transfers_in_event: 10 })];
        const news = buildGlobalNews({ players, elements, priceMoves: { risers: [], fallers: [] }, isLikelyMove: () => true });
        expect(news.templateIn[0]?.name).toBe('Hot');
    });
});

describe('buildDigestMessage FPL-wide section', () => {
    it('renders the global section and a fresh-since-last headline', () => {
        const message = buildDigestMessage({
            eventName: 'Gameweek 1',
            nowMs: 0,
            alerts: [],
            captain: null,
            vice: null,
            transfer: null,
            priceChanges: [],
            league: null,
            reports: [],
            freshHeadline: '🆕 Сүүлийн мэдэгдлээс хойш 2 шинэ чухал зүйл илэрлээ.',
            globalNews: {
                injuries: [{ id: 5, name: 'Star', team: 'ARS', ownership: 40, text: 'Hamstring injury' }],
                risers: [{ name: 'Riser', team: 'LIV', net: 90000 }],
                fallers: [],
                bestFixtures: [{ name: 'Big', team: 'LIV', opponent: 'SHU', difficulty: 2, xp: 7 }],
                templateIn: [{ name: 'Hot', team: 'ARS', inCount: 500000 }],
            },
        });
        expect(message).toMatch(/Сүүлийн мэдэгдлээс хойш 2 шинэ/);
        expect(message).toMatch(/FPL-ийн чухал мэдээ/);
        expect(message).toMatch(/Star \(ARS, 40%\): Hamstring injury/);
        expect(message).toMatch(/Хамгийн хялбар тоглолт/);
        expect(message).toMatch(/Hot \(ARS\) — \+500мянга/);
    });

    it('omits the global section entirely when there is no FPL-wide news', () => {
        const message = buildDigestMessage({
            nowMs: 0,
            alerts: [],
            captain: null,
            vice: null,
            transfer: null,
            priceChanges: [],
            league: null,
            reports: [],
            globalNews: { injuries: [], risers: [], fallers: [], bestFixtures: [], templateIn: [] },
        });
        expect(hasGlobalNews({ injuries: [], risers: [], fallers: [], bestFixtures: [], templateIn: [] })).toBe(false);
        expect(message).not.toMatch(/FPL-ийн чухал мэдээ/);
    });
});

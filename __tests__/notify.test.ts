import { describe, expect, it } from 'vitest';
import { buildGlobalNews, hasGlobalNews } from '@/lib/global-news';
import { buildDigestMessage } from '@/lib/digest';
import { mnFplNews, withSource } from '@/lib/mn';
import type { FplPlayer } from '@/types/fpl';
import { makePlayer } from './helpers';

describe('Mongolian translation of FPL news', () => {
    it('translates common FPL injury/availability phrases to Mongolian', () => {
        expect(mnFplNews('Knee injury - 75% chance of playing')).toBe('Өвдөгний гэмтэл — 75% тоглох магадлал');
        expect(mnFplNews('Ankle injury - Expected back 25 Dec')).toMatch(/Шагайны гэмтэл/);
        expect(mnFplNews('Ankle injury - Expected back 25 Dec')).toMatch(/≈25 Dec сэргэнэ/);
        expect(mnFplNews('Suspended - Unknown return date')).toBe('Тэмцээнээс хол (шийтгэл) — Сэргэх хугацаа тодорхойгүй');
        expect(mnFplNews('')).toBe('');
    });

    it('withSource attaches the untranslated English source concisely', () => {
        expect(withSource('Өвдөгний гэмтэл', 'Knee injury', 'Sky')).toBe('Өвдөгний гэмтэл · эх: Knee injury (Sky)');
        expect(withSource('Мэдээ', '')).toBe('Мэдээ');
    });
});

function elem(id: number, web_name: string, extra: Record<string, number> = {}): FplPlayer {
    return { id, web_name, transfers_in_event: 0, transfers_out_event: 0, cost_change_event: 0, ...extra } as unknown as FplPlayer;
}

describe('buildGlobalNews', () => {
    it('surfaces injured high-owned players with concise untranslated source text', () => {
        const players = [
            makePlayer({ id: 10, name: 'Star', team: 'ARS', ownership: 40, status: 'i', news: 'Hamstring injury - 75% chance of playing' }),
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
        // Body is Mongolian; the English FPL source is attached untranslated.
        const star = news.injuries.find((i) => i.name === 'Star')!;
        expect(star.text).toMatch(/Гуяны шөрмөсний гэмтэл/); // MN translation of "Hamstring injury"
        expect(star.text).toMatch(/75% тоглох магадлал/); // MN translation of the chance
        expect(star.text).toMatch(/· эх: Hamstring injury - 75% chance of playing/); // English source kept
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
    it('includes owner rank, chip, differential and honest data coverage', () => {
        const message = buildDigestMessage({
            nowMs: 0,
            alerts: [],
            captain: null,
            vice: null,
            transfer: null,
            entry: { teamName: 'My XI', totalPoints: 123, overallRank: 4567, gameweekPoints: 61 },
            differential: { name: 'Upside', team: 'ARS', ownership: 6.2, points: 5.4, nextFive: 26.5 },
            chip: { chip: 'Triple Captain', action: 'Hold', confidence: 88, reason: 'Better opportunity expected.' },
            coverage: { officialFpl: true, fixtures: true, squad: true, externalChecked: 15, externalTarget: 15, league: 'available' },
            priceChanges: [],
            league: null,
            reports: [],
        });
        expect(message).toContain('My XI: 123 оноо');
        expect(message).toContain('Overall #4,567');
        expect(message).toContain('Differential: Upside');
        expect(message).toContain('Chip: Triple Captain — Hold');
        expect(message).toContain('news 15/15');
    });

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

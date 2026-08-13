import { currentEvent, getBootstrap, getEntryPicks, getFixtures, getLeague, nextEvent, toModelPlayers } from '@/lib/fpl';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildSquadAlerts, buildSquadReports, type SquadAlert } from '@/lib/squad-alerts';
import { type CaptainPick, type LeagueLine, type PriceChange, type TransferPick } from '@/lib/digest';
import { rankCaptainCandidates } from '@/lib/scoring';
import { buildTransferPlans } from '@/lib/transfers';
import { predictPriceMoves, isLikelyMove } from '@/lib/price-predictor';
import { buildGlobalNews, type GlobalNews } from '@/lib/global-news';
import { alertKey } from '@/lib/alert-store';
import type { ModelPlayer } from '@/types/fpl';

// Shared digest data-gathering used by BOTH the daily cron (/api/notify) and the
// on-demand refresh button (/api/notify/refresh). Keeping it in one place means
// the two endpoints can never drift apart in what they analyse.

export type DigestData = {
    ok: boolean;
    reason?: string;
    eventName?: string;
    deadlineIso?: string;
    note?: string;
    hasSquad: boolean;
    alerts: SquadAlert[];
    reports: SquadAlert[];
    captain: CaptainPick;
    vice: CaptainPick;
    transfer: TransferPick;
    priceChanges: PriceChange[];
    priceWatch: { falling: Array<{ name: string; net: number }>; rising: Array<{ name: string; net: number }> };
    league: LeagueLine | null;
    globalNews: GlobalNews;
    // Stable dedup keys for the noteworthy items in this digest (squad alerts +
    // reports + global injuries). Used to detect what is NEW since the last send.
    itemKeys: string[];
};

export async function gatherDigest(): Promise<DigestData> {
    const empty: DigestData = {
        ok: false,
        hasSquad: false,
        alerts: [],
        reports: [],
        captain: null,
        vice: null,
        transfer: null,
        priceChanges: [],
        priceWatch: { falling: [], rising: [] },
        league: null,
        globalNews: { injuries: [], risers: [], fallers: [], bestFixtures: [], templateIn: [] },
        itemKeys: [],
    };

    const [boot, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);
    if (!boot) return { ...empty, reason: 'FPL API unavailable' };

    const next = nextEvent(boot.events);
    const completed = boot.events.filter((event) => event.finished).length;
    const players = toModelPlayers(boot.elements, boot.teams, boot.element_types, fixtures || [], next?.id, completed);

    const entryId = process.env.FPL_ENTRY_ID;
    const event = currentEvent(boot.events);
    const picks = entryId && event?.id ? await getEntryPicks(entryId, event.id) : null;
    const pickIds = picks?.picks?.map((pick) => pick.element) || [];
    const hasSquad = pickIds.length >= 11;

    const relevance = (p: ModelPlayer) => p.expectedPoints + p.valueScore * 0.4 + p.ownership * 0.03;
    const focusIds = hasSquad
        ? pickIds
        : [...players].sort((a, b) => relevance(b) - relevance(a)).slice(0, 24).map((p) => p.id);

    const teamValue = Number((picks?.entry_history?.value || 0) / 10);
    const marketSum = focusIds.reduce((sum, id) => sum + (players.find((p) => p.id === id)?.price || 0), 0);
    const sellRatio = hasSquad && marketSum > 0 && teamValue > 0 ? Math.min(1, teamValue / marketSum) : 1;
    const bank = Number((picks?.entry_history?.bank || 0) / 10);

    const focus: ModelPlayer[] = players
        .filter((player) => focusIds.includes(player.id))
        .map((player) => ({ ...player, sellingPrice: Number((player.price * sellRatio).toFixed(1)) }));

    const enriched = applyExternalNewsSignals(focus, await getExternalNewsSignals(focus, focusIds));

    const alerts = buildSquadAlerts(enriched);
    const reports = buildSquadReports(enriched);

    const captainRanked = rankCaptainCandidates(enriched, 3);
    const captainFallback = [...enriched].filter((p) => p.position !== 'GKP').sort((a, b) => b.expectedPoints - a.expectedPoints);
    const capList = captainRanked.length ? captainRanked : captainFallback;
    const captain: CaptainPick = capList[0] ? { name: capList[0].name, team: capList[0].team, points: capList[0].expectedPoints } : null;
    const vice: CaptainPick = capList[1] ? { name: capList[1].name, team: capList[1].team, points: capList[1].expectedPoints } : null;

    let transfer: TransferPick = null;
    if (hasSquad) {
        const plans = buildTransferPlans(enriched, players, bank, 1);
        const recommended = plans.find((plan) => plan.recommended) || plans[0] || null;
        transfer = recommended
            ? {
                  label: recommended.label,
                  moves: (recommended.moves || []).map((move: { out: string; in: string }) => `${move.out} → ${move.in}`),
                  netGain: recommended.netGain,
              }
            : null;
    }

    const priceChanges: PriceChange[] = boot.elements
        .filter((element) => focusIds.includes(element.id) && Number(element.cost_change_event || 0) !== 0)
        .map((element) => ({ name: element.web_name, delta: Number(element.cost_change_event || 0) / 10 }));

    const priceMoves = predictPriceMoves(boot.elements, boot.total_players || 0);
    const focusSet = new Set(focusIds);
    const priceWatch = {
        falling: priceMoves.fallers.filter((m) => focusSet.has(m.id) && isLikelyMove(m.momentum)).map((m) => ({ name: m.name, net: m.net })),
        rising: priceMoves.risers.filter((m) => !focusSet.has(m.id) && isLikelyMove(m.momentum)).slice(0, 5).map((m) => ({ name: m.name, net: m.net })),
    };

    // FPL-wide important news across ALL players (cheap: FPL-native fields only).
    const globalNews = buildGlobalNews({ players, elements: boot.elements, priceMoves, isLikelyMove });

    let league: LeagueLine | null = null;
    const leagueId = process.env.FPL_LEAGUE_ID;
    if (leagueId && entryId) {
        const standings = await getLeague(leagueId);
        const results = standings?.standings?.results || [];
        const meIndex = results.findIndex((row) => row.entry === Number(entryId));
        if (meIndex >= 0 && (results[0]?.total || 0) > 0) {
            const me = results[meIndex];
            league = {
                name: standings?.league?.name || 'League',
                rank: me.rank,
                entries: results.length,
                gapToLeader: (results[0]?.total || me.total) - me.total,
                gapAbove: meIndex > 0 ? (results[meIndex - 1]?.total || me.total) - me.total : 0,
            };
        }
    }

    const note = hasSquad
        ? undefined
        : 'ℹ️ Таны багийн picks нээгдээгүй (pre-season) тул хамгийн чухал тоглогчид дээр мэдээ/шинжилгээ (watchlist).';

    // Stable keys for "what is new since last time". Squad alerts (high/medium),
    // reports, and global injuries all count as noteworthy items.
    const itemKeys = [
        ...alerts.filter((a) => a.severity !== 'low').map((a) => alertKey(a.playerId, a.message)),
        ...reports.map((r) => alertKey(r.playerId, r.message)),
        ...globalNews.injuries.map((i) => alertKey(i.id, i.text)),
    ];

    return {
        ok: true,
        eventName: next?.name,
        deadlineIso: next?.deadline_time,
        note,
        hasSquad,
        alerts,
        reports,
        captain,
        vice,
        transfer,
        priceChanges,
        priceWatch,
        league,
        globalNews,
        itemKeys,
    };
}

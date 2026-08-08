import { NextResponse } from 'next/server';

import { getBootstrap, getEntry, getEntryPicks, getFixtures, toModelPlayers } from '@/lib/fpl';

import { chipPlanner } from '@/lib/chips';
import { selectBestLineup } from '@/lib/lineup';
import { validateSquad } from '@/lib/rules';
import { rankCaptainCandidates } from '@/lib/scoring';
import { buildTransferPlans, suggestSafeTransfers } from '@/lib/transfers';
import { applyExternalNewsSignals, getExternalNewsSignals } from '@/lib/external-news';
import { buildSeasonRoadmap } from '@/lib/season-roadmap';
import { buildDraftTrust } from '@/lib/evidence';
import { applyApiFootballEvidence, getApiFootballEvidence } from '@/lib/api-football';

// External enrichment (API-Football + news) can exceed the default 10s timeout.
export const maxDuration = 60;

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));

    const entryId = String(body.entryId || '').trim();

    if (!entryId) {
        return NextResponse.json(
            {
                error: 'Entry ID оруулна уу.',
            },
            {
                status: 400,
            },
        );
    }

    const [boot, entry, fixtures] = await Promise.all([getBootstrap(), getEntry(entryId), getFixtures()]);

    if (!boot) {
        return NextResponse.json(
            {
                error: 'FPL API одоогоор ажиллахгүй байна.',
            },
            {
                status: 503,
            },
        );
    }

    if (!entry) {
        return NextResponse.json(
            {
                error: 'Entry ID олдсонгүй. ID дугаараа дахин шалгана уу.',
            },
            {
                status: 404,
            },
        );
    }

    /*
     * FPL-ийн public picks endpoint нь ихэвчлэн
     * Gameweek эхэлсний дараа тухайн GW-ийн
     * бүрэлдэхүүнийг харуулдаг.
     */
    const entryEventId = Number(entry.current_event || 0);

    const lastFinishedEvent = [...boot.events].filter((event) => event.finished).sort((a, b) => b.id - a.id)[0];

    const analysisEventId = entryEventId > 0 ? entryEventId : lastFinishedEvent?.id;

    if (!analysisEventId) {
        return NextResponse.json({
            mode: 'pre-season',
            entry,
            summary: {
                playerName: entry.player_first_name ? `${entry.player_first_name} ${entry.player_last_name}` : entry.name,

                teamName: entry.name,

                overallPoints: entry.summary_overall_points,

                overallRank: entry.summary_overall_rank,
            },
            error: 'Шинэ улирлын Gameweek хараахан эхлээгүй тул Entry ID-аар одоогийн draft багийг public API-аас унших боломжгүй байна.',
            help: 'Gameweek deadline өнгөрсний дараа Entry ID analysis ажиллана. Одоогоор AI Agent-ийн санал болгож буй draft болон formation-ийг ашиглана уу.',
        });
    }

    const picks = await getEntryPicks(entryId, analysisEventId);

    if (!picks?.picks?.length) {
        return NextResponse.json({
            mode: 'entry-found-picks-unavailable',
            entry,
            eventId: analysisEventId,

            summary: {
                playerName: entry.player_first_name ? `${entry.player_first_name} ${entry.player_last_name}` : entry.name,

                teamName: entry.name,

                overallPoints: entry.summary_overall_points,

                overallRank: entry.summary_overall_rank,
            },

            error: 'Entry ID зөв байна. Гэхдээ тухайн Gameweek-ийн баг public picks API дээр хараахан нээгдээгүй байна.',

            help: 'Deadline өнгөрсний дараа дахин Analyze дарна уу.',
        });
    }

    const event = boot.events.find((item) => item.id === analysisEventId) || null;

    const nextEvent = boot.events.find((item) => item.is_next);

    const fixtureEventId = nextEvent?.id || analysisEventId + 1;

    const basePlayers = toModelPlayers(
        boot.elements,
        boot.teams,
        boot.element_types,
        fixtures || [],
        fixtureEventId,
        boot.events.filter((item) => item.finished).length,
    );
    const apiFootballScan = await getApiFootballEvidence(basePlayers);
    const statsPlayers = applyApiFootballEvidence(basePlayers, apiFootballScan);
    const allPlayers = applyExternalNewsSignals(
        statsPlayers,
        await getExternalNewsSignals(statsPlayers, picks.picks.map((pick) => pick.element)),
    );

    const playerMap = new Map(allPlayers.map((player) => [player.id, player]));

    // Estimate per-player selling price from total team value (see decision route).
    const marketSum = picks.picks.reduce((sum, pick) => sum + (playerMap.get(pick.element)?.price || 0), 0);
    const teamValue = Number((picks.entry_history?.value || 0) / 10);
    const sellRatio = marketSum > 0 && teamValue > 0 ? Math.min(1, teamValue / marketSum) : 1;

    const squad = picks.picks
        .map((pick) => {
            const player = playerMap.get(pick.element);

            if (!player) {
                return null;
            }

            return {
                ...player,
                sellingPrice: Number((player.price * sellRatio).toFixed(1)),
                pick,
            };
        })
        .filter((player): player is NonNullable<typeof player> => player !== null);

    const bank = Number(((picks.entry_history?.bank || 0) / 10).toFixed(1));

    const requestedFreeTransfers = Number(body.freeTransfers);
    const freeTransfers = Number.isFinite(requestedFreeTransfers)
        ? Math.max(0, Math.min(5, requestedFreeTransfers))
        : 1;

    const validation = validateSquad(squad);

    const lineup = selectBestLineup(squad);

    const captains = rankCaptainCandidates(lineup.startingXI.length ? lineup.startingXI : squad, 6);

    const transfers = suggestSafeTransfers(squad, allPlayers, bank, freeTransfers);
    const transferPlans = buildTransferPlans(squad, allPlayers, bank, freeTransfers);
    const roadmap = buildSeasonRoadmap(squad, allPlayers);
    const trust = buildDraftTrust(squad, lineup.startingXI);

    return NextResponse.json({
        mode: 'live',
        entry,
        event,

        summary: {
            playerName: entry.player_first_name ? `${entry.player_first_name} ${entry.player_last_name}` : entry.name,

            teamName: entry.name,

            overallPoints: entry.summary_overall_points,

            overallRank: entry.summary_overall_rank,

            gwPoints: entry.summary_event_points,

            gwRank: entry.summary_event_rank,

            bank,

            value: Number(((picks.entry_history?.value || 0) / 10).toFixed(1)),

            freeTransfers,
        },

        squad,

        recommendedLineup: {
            formation: lineup.formation,
            startingXI: lineup.startingXI,
            bench: lineup.bench,
            warnings: lineup.warnings,
        },

        validation,
        trust,
        roadmap,
        apiFootball: {
            enabled: apiFootballScan.enabled,
            matchedPlayers: apiFootballScan.matchedPlayers,
            fixturesChecked: apiFootballScan.fixturesChecked,
            error: apiFootballScan.error,
        },

        captainShortlist: captains,

        transferSuggestions: transfers,
        transferPlans,

        chips: chipPlanner({
            hasEntry: true,
            isPreSeason: false,
            roadmap,
        }),
    });
}

import type { FplPlayer } from '@/types/fpl';

// FPL price changes are driven by net transfers relative to the total manager
// base. The exact threshold is undisclosed and adjusts nightly, so this is an
// ESTIMATE from transfer momentum, never a guarantee. Players that already
// changed price this event are excluded (we predict the *next* change).

export type PriceMove = {
    id: number;
    name: string;
    net: number; // net transfers this event (in - out)
    momentum: number; // net / total managers
    direction: 'rise' | 'fall';
};

export function predictPriceMoves(
    elements: FplPlayer[],
    totalPlayers: number,
    limit = 8,
): { risers: PriceMove[]; fallers: PriceMove[] } {
    const base = totalPlayers > 0 ? totalPlayers : 1;
    const moves: PriceMove[] = [];
    for (const el of elements) {
        if (Number(el.cost_change_event || 0) !== 0) continue; // already moved this event
        const net = Number(el.transfers_in_event || 0) - Number(el.transfers_out_event || 0);
        if (net === 0) continue;
        moves.push({
            id: el.id,
            name: el.web_name,
            net,
            momentum: Number((net / base).toFixed(4)),
            direction: net > 0 ? 'rise' : 'fall',
        });
    }
    const risers = moves.filter((m) => m.direction === 'rise').sort((a, b) => b.momentum - a.momentum).slice(0, limit);
    const fallers = moves.filter((m) => m.direction === 'fall').sort((a, b) => a.momentum - b.momentum).slice(0, limit);
    return { risers, fallers };
}

/** Momentum strong enough to be worth flagging (rough heuristic threshold). */
export function isLikelyMove(momentum: number): boolean {
    return Math.abs(momentum) >= 0.03;
}

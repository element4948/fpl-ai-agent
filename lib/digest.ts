import type { SquadAlert } from './squad-alerts';

// Assembles the full Telegram digest from already-gathered sections. Kept pure
// (no fetching / no Date.now) so it is easy to test; the route passes `nowMs`.

export type PriceChange = { name: string; delta: number };
export type LeagueLine = {
    name: string;
    rank: number;
    entries: number;
    gapToLeader: number;
    gapAbove: number;
};
export type CaptainPick = { name: string; team: string; points: number } | null;
export type TransferPick = { label: string; moves: string[]; netGain: number } | null;

export function formatDeadlineLine(deadlineIso: string | undefined, nowMs: number): string | null {
    if (!deadlineIso) return null;
    const deadlineMs = new Date(deadlineIso).getTime();
    if (!Number.isFinite(deadlineMs)) return null;
    const diff = deadlineMs - nowMs;
    if (diff <= 0) return '⏳ Deadline өнгөрсөн';
    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const left = days > 0 ? `${days}ө ${hours}ц ${minutes}м` : `${hours}ц ${minutes}м`;
    return `⏳ Deadline хүртэл: ${left}`;
}

const ICON: Record<SquadAlert['severity'], string> = { high: '🔴', medium: '🟡', low: '⚪' };

export function buildDigestMessage(input: {
    eventName?: string;
    deadlineIso?: string;
    nowMs: number;
    alerts: SquadAlert[];
    captain: CaptainPick;
    vice: CaptainPick;
    transfer: TransferPick;
    priceChanges: PriceChange[];
    league: LeagueLine | null;
    reports: SquadAlert[];
}): string {
    const blocks: string[] = [];
    blocks.push(`⚽ FPL дайджест${input.eventName ? ` — ${input.eventName}` : ''}`);

    const deadline = formatDeadlineLine(input.deadlineIso, input.nowMs);
    if (deadline) blocks.push(deadline);

    if (input.alerts.length) {
        const lines = input.alerts.slice(0, 20).map((a) => `${ICON[a.severity]} ${a.name} (${a.team}): ${a.message}`);
        blocks.push(`📋 Багийн мэдэгдэл:\n${lines.join('\n')}`);
    } else {
        blocks.push('📋 Багт чинь чухал шинэ мэдээ алга ✅');
    }

    if (input.captain) {
        const viceText = input.vice ? ` · Vice: ${input.vice.name}` : '';
        blocks.push(`© Captain: ${input.captain.name} (${input.captain.team}) — ${input.captain.points.toFixed(1)} xP${viceText}`);
    }

    if (input.transfer) {
        blocks.push(
            input.transfer.moves.length
                ? `⇄ Transfer: ${input.transfer.moves.join(', ')} (+${input.transfer.netGain.toFixed(1)} net · ${input.transfer.label})`
                : '⇄ Transfer: Hold — энэ долоо хоног тодорхой ашиг алга',
        );
    }

    if (input.priceChanges.length) {
        const lines = input.priceChanges
            .slice(0, 10)
            .map((p) => `${p.delta > 0 ? '📈' : '📉'} ${p.name} ${p.delta > 0 ? '+' : ''}${p.delta.toFixed(1)}`);
        blocks.push(`💰 Үнийн өөрчлөлт:\n${lines.join('\n')}`);
    }

    if (input.league) {
        blocks.push(
            `🏆 ${input.league.name}: ${input.league.rank}/${input.league.entries}-т · ` +
                `тэргүүлэгчээс −${input.league.gapToLeader}` +
                (input.league.gapAbove > 0 ? ` · дээд байраас −${input.league.gapAbove}` : ''),
        );
    }

    if (input.reports.length) {
        const lines = input.reports.slice(0, 8).map((r) => `⚪ ${r.name} (${r.team}): ${r.message}`);
        blocks.push(`📰 Мэдээ (баталгаажаагүй — шалгах):\n${lines.join('\n')}`);
    }

    return blocks.join('\n\n');
}

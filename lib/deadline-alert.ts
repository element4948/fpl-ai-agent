import type { CaptainPick, ChipPick, TransferPick } from './digest';

export type DeadlineWindow = '24h' | '6h' | '90m';

const WINDOWS: Array<{ id: DeadlineWindow; minutes: number }> = [
    { id: '90m', minutes: 90 },
    { id: '6h', minutes: 360 },
    { id: '24h', minutes: 1440 },
];

export function deadlineWindow(deadlineIso: string | undefined, nowMs: number): DeadlineWindow | null {
    if (!deadlineIso) return null;
    const remainingMinutes = (new Date(deadlineIso).getTime() - nowMs) / 60000;
    if (!Number.isFinite(remainingMinutes) || remainingMinutes <= 0) return null;
    return WINDOWS.find((window) => remainingMinutes <= window.minutes)?.id || null;
}

export function buildDeadlineAlert(input: {
    eventName?: string;
    window: DeadlineWindow;
    captain: CaptainPick;
    vice: CaptainPick;
    transfer: TransferPick;
    chip: ChipPick;
    highRiskCount: number;
}): { key: string; message: string } {
    const captain = input.captain
        ? `${input.captain.name}${input.vice ? ` · Vice ${input.vice.name}` : ''}`
        : 'Squad мэдээлэл нээгдээгүй';
    const transfer = input.transfer
        ? input.transfer.moves.length ? input.transfer.moves.join(', ') : 'Hold'
        : 'Шийдвэр гараагүй';
    const chip = input.chip ? `${input.chip.chip}: ${input.chip.action}` : 'Hold / шийдвэр гараагүй';
    const risk = input.highRiskCount > 0 ? `${input.highRiskCount} өндөр эрсдэлтэй мэдээ байна` : 'Өндөр эрсдэлтэй шинэ мэдээ алга';
    const signature = [captain, transfer, chip, input.highRiskCount].join('|');
    const event = input.eventName || 'next-gameweek';

    return {
        key: `fpldeadline:${event}:${input.window}:${stableHash(signature)}`,
        message: [
            `⏰ ${event} deadline — ${input.window} үлдлээ`,
            `© Captain: ${captain}`,
            `⇄ Transfer: ${transfer}`,
            `🎴 Chip: ${chip}`,
            `🚨 ${risk}`,
            'Official FPL дээр хэрэгжүүлэхээсээ өмнө бүрэлдэхүүнээ эцэслэн шалгана уу.',
        ].join('\n'),
    };
}

function stableHash(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
}

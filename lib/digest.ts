import type { SquadAlert } from './squad-alerts';
import type { GlobalNews } from './global-news';
import { hasGlobalNews } from './global-news';

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
export type TransferPick = { label: string; moves: string[]; netGain: number; freeTransfersAssumed?: number } | null;
export type EntrySummary = {
    teamName: string;
    totalPoints: number;
    overallRank: number | null;
    gameweekPoints: number;
} | null;
export type DifferentialPick = {
    name: string;
    team: string;
    ownership: number;
    points: number;
    nextFive: number;
} | null;
export type ChipPick = { chip: string; action: string; confidence: number; reason: string } | null;
export type DigestCoverage = {
    officialFpl: boolean;
    fixtures: boolean;
    squad: boolean;
    externalChecked: number;
    externalTarget: number;
    league: 'available' | 'not-configured' | 'unavailable';
};

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
    note?: string;
    deadlineIso?: string;
    nowMs: number;
    alerts: SquadAlert[];
    targetAlerts?: SquadAlert[];
    hasSquad?: boolean;
    captain: CaptainPick;
    vice: CaptainPick;
    transfer: TransferPick;
    entry?: EntrySummary;
    differential?: DifferentialPick;
    chip?: ChipPick;
    coverage?: DigestCoverage;
    priceChanges: PriceChange[];
    priceWatch?: { falling: Array<{ name: string; net: number }>; rising: Array<{ name: string; net: number }> };
    league: LeagueLine | null;
    reports: SquadAlert[];
    globalNews?: GlobalNews;
    freshHeadline?: string;
}): string {
    const blocks: string[] = [];
    const hasSquad = input.hasSquad ?? input.coverage?.squad ?? true;
    blocks.push(`⚽ FPL шийдвэр${input.eventName ? ` — ${input.eventName}` : ''}`);
    if (input.freshHeadline) blocks.push(input.freshHeadline);
    if (input.note) blocks.push(input.note);

    const deadline = formatDeadlineLine(input.deadlineIso, input.nowMs);
    if (deadline) blocks.push(deadline);

    if (input.entry) {
        blocks.push(
            `👤 ${input.entry.teamName}: ${input.entry.totalPoints} оноо · ` +
                `Overall ${input.entry.overallRank ? `#${input.entry.overallRank.toLocaleString('en-US')}` : '—'} · ` +
                `GW ${input.entry.gameweekPoints}`,
        );
    }

    if (!hasSquad) {
        blocks.push(
            '⚠️ Хувийн багийн шийдвэр гараагүй: Official FPL-ээс таны одоогийн 15 тоглогч хараахан нээлттэй биш байна. ' +
            'Доорх нь зөвхөн ажиглах жагсаалт; captain эсвэл transfer заавар биш.',
        );
    } else {
        const decisionLines: string[] = [];
        if (input.captain) {
            decisionLines.push(
                `© Ахлагч: ${input.captain.name} (${input.captain.team}) — ${input.captain.points.toFixed(1)} таамаг оноо` +
                (input.vice ? ` · Дэд: ${input.vice.name}` : ''),
            );
        } else {
            decisionLines.push('© Ахлагч: мэдээлэл дутуу — deadline-ийн өмнө дахин шалгана');
        }
        if (input.transfer) {
            const assumption = input.transfer.freeTransfersAssumed
                ? ` · ${input.transfer.freeTransfersAssumed} үнэгүй солилцоо гэж тооцсон`
                : '';
            decisionLines.push(
                input.transfer.moves.length
                    ? `⇄ Солилцоо: ${input.transfer.moves.join(', ')} · цэвэр өсөлт +${input.transfer.netGain.toFixed(1)} таамаг оноо${assumption}`
                    : `⇄ Солилцоо: HOLD — тодорхой цэвэр ашиг алга${assumption}`,
            );
        } else {
            decisionLines.push('⇄ Солилцоо: мэдээлэл дутуу — автоматаар үйлдэл хийхгүй');
        }
        if (input.chip) {
            decisionLines.push(`🎴 Chip: ${mnAction(input.chip.action)} · ${input.chip.confidence}% — ${input.chip.reason}`);
        }
        blocks.push(`✅ ОДОО ХИЙХ ЗҮЙЛ\n${decisionLines.join('\n')}`);
    }

    if (input.alerts.length) {
        const lines = input.alerts.slice(0, 20).map((a) => `${ICON[a.severity]} ${a.name} (${a.team}): ${a.message}`);
        blocks.push(`🚨 ТАНЫ БАГИЙН ЭРСДЭЛ:\n${lines.join('\n')}`);
    } else if (hasSquad) {
        blocks.push('🚨 Таны багт одоогоор чухал эрсдэлийн мэдээ алга ✅');
    }

    if (input.targetAlerts?.length) {
        const lines = input.targetAlerts.slice(0, 8).map((a) => `${ICON[a.severity]} ${a.name} (${a.team}): ${a.message}`);
        blocks.push(`👀 АЖИГЛАЖ БУЙ СОЛИЛЦООНЫ БАЙ:\n${lines.join('\n')}`);
    }

    if (input.differential) {
        blocks.push(
            `💎 ${hasSquad ? 'Дифференциал санал' : 'Ажиглах бага эзэмшилтэй тоглогч'}: ${input.differential.name} (${input.differential.team}) · ` +
                `${input.differential.ownership.toFixed(1)}% эзэмшил · ${input.differential.points.toFixed(1)} таамаг оноо · ` +
                `дараагийн 5-д ${input.differential.nextFive.toFixed(1)}`,
        );
    }

    if (input.priceChanges.length) {
        const lines = input.priceChanges
            .slice(0, 10)
            .map((p) => `${p.delta > 0 ? '📈' : '📉'} ${p.name} ${p.delta > 0 ? '+' : ''}${p.delta.toFixed(1)}`);
        blocks.push(`💰 Үнийн өөрчлөлт:\n${lines.join('\n')}`);
    }

    if (input.priceWatch && (input.priceWatch.falling.length || input.priceWatch.rising.length)) {
        const lines: string[] = [];
        for (const move of input.priceWatch.falling.slice(0, 6)) lines.push(`📉 ${move.name} — унах магадлалтай (сель бол өнөөдөр)`);
        for (const move of input.priceWatch.rising.slice(0, 6)) lines.push(`📈 ${move.name} — өсөх магадлалтай (авах бол одоо)`);
        blocks.push(`💹 Үнийн таамаг (магадлал, баталгаа биш):\n${lines.join('\n')}`);
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
        blocks.push(`📰 Баталгаажаагүй мэдээ — шийдвэр гаргахаас өмнө шалгах:\n${lines.join('\n')}`);
    }

    if (input.globalNews && hasGlobalNews(input.globalNews)) {
        blocks.push(formatGlobalNews(input.globalNews));
    }

    if (input.coverage) {
        const league = input.coverage.league === 'available'
            ? 'league ✓'
            : input.coverage.league === 'not-configured'
              ? 'league ID алга'
              : 'league data алга';
        blocks.push(
            `🔎 Мэдээллийн хамрах хүрээ: Official FPL ${input.coverage.officialFpl ? '✓' : '✗'} · ` +
                `тоглолт ${input.coverage.fixtures ? '✓' : '✗'} · хувийн баг ${input.coverage.squad ? '✓' : '✗'} · ` +
                `мэдээ ${input.coverage.externalChecked}/${input.coverage.externalTarget} · ${league}`,
        );
    }

    return blocks.join('\n\n');
}

function mnAction(action: string) {
    if (action.toLowerCase() === 'hold') return 'HOLD — одоохондоо ашиглахгүй';
    return action;
}

// FPL-wide important news (not just the owner's squad). Source snippets are kept
// in their original language (English), untranslated, so the reader can
// translate them if they wish.
function formatGlobalNews(news: GlobalNews): string {
    const sections: string[] = ['🌍 FPL-ийн чухал мэдээ (бүх тоглогч · монголоор, эх сурвалж англиар)'];

    if (news.injuries.length) {
        const lines = news.injuries.map(
            (i) => `🔴 ${i.name} (${i.team}, ${i.ownership.toFixed(0)}%): ${i.text}`,
        );
        sections.push(`Гэмтэл / бэлэн бус:\n${lines.join('\n')}`);
    }

    if (news.risers.length || news.fallers.length) {
        const lines: string[] = [];
        for (const m of news.risers) lines.push(`📈 ${m.name}${m.team ? ` (${m.team})` : ''} — өсөх магадлалтай`);
        for (const m of news.fallers) lines.push(`📉 ${m.name}${m.team ? ` (${m.team})` : ''} — унах магадлалтай`);
        sections.push(`Үнийн таамаг (магадлал, баталгаа биш):\n${lines.join('\n')}`);
    }

    if (news.bestFixtures.length) {
        const lines = news.bestFixtures.map(
            (f) => `🔥 ${f.name} (${f.team}) → ${f.opponent} (FDR ${f.difficulty}, ${f.xp.toFixed(1)} xP)`,
        );
        sections.push(`Хамгийн хялбар тоглолт (сайн боломж):\n${lines.join('\n')}`);
    }

    if (news.templateIn.length) {
        const lines = news.templateIn.map((t) => `🔁 ${t.name}${t.team ? ` (${t.team})` : ''} — +${formatCount(t.inCount)}`);
        sections.push(`Талбар хамгийн их авч буй (template):\n${lines.join('\n')}`);
    }

    return sections.join('\n\n');
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}сая`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}мянга`;
    return String(n);
}

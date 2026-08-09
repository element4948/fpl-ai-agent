import type { CSSProperties } from 'react';

type Any = any;

const MODE_LABEL: Record<string, string> = {
    Best: 'Best',
    Alternative: 'Alternative',
    Differential: 'Differential',
    Safe: 'Safe',
};

const cellHead: CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '2px solid var(--line, #333)',
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: 'nowrap',
};
const cellLabel: CSSProperties = {
    padding: '7px 10px',
    borderBottom: '1px solid var(--line, #2a2a2a)',
    color: 'var(--muted, #999)',
    whiteSpace: 'nowrap',
};
const cell: CSSProperties = {
    padding: '7px 10px',
    borderBottom: '1px solid var(--line, #2a2a2a)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
};

function xiPoints(draft: Any): number {
    return Number(
        (draft?.startingXI || []).reduce((sum: number, p: Any) => sum + (p.expectedPoints || 0), 0).toFixed(1),
    );
}

function topCaptain(draft: Any): string {
    const xi = [...(draft?.startingXI || [])]
        .filter((p: Any) => p.position !== 'GKP')
        .sort((a: Any, b: Any) => (b.expectedPoints || 0) - (a.expectedPoints || 0));
    return xi[0]?.name || '—';
}

/**
 * Side-by-side comparison of the draft variants (one column per mode) so the
 * owner can compare them at a glance instead of expanding each collapsed card.
 */
export function DraftCompareTable({ drafts, lang }: { drafts: Any[]; lang: 'mn' | 'en' }) {
    if (!drafts || drafts.length < 2) return null;
    const best = drafts.find((d) => d.mode === 'Best') || drafts[0];
    const bestIds = new Set((best?.players || []).map((p: Any) => p.id));
    const trustLabel = (status: string) =>
        status === 'verified'
            ? lang === 'mn' ? 'Баталгаатай' : 'Verified'
            : status === 'provisional'
              ? lang === 'mn' ? 'Урьдчилсан' : 'Provisional'
              : lang === 'mn' ? 'Дутуу' : 'Insufficient';

    const rows: Array<{ label: string; get: (d: Any) => string }> = [
        { label: lang === 'mn' ? 'XI таамаг оноо' : 'Projected XI xP', get: (d) => `${xiPoints(d)}` },
        { label: lang === 'mn' ? 'Багийн үнэ' : 'Squad cost', get: (d) => `£${(d.validation?.totalCost ?? 0).toFixed(1)}m` },
        { label: lang === 'mn' ? 'Банк' : 'Bank', get: (d) => `£${(d.flexibility?.bank ?? 0).toFixed(1)}m` },
        { label: lang === 'mn' ? 'Бүтэц' : 'Formation', get: (d) => d.formation || '—' },
        { label: lang === 'mn' ? 'Санал captain' : 'Top captain', get: (d) => topCaptain(d) },
        { label: lang === 'mn' ? 'Итгэл' : 'Trust', get: (d) => trustLabel(d.trust?.status) },
        {
            label: lang === 'mn' ? 'Best-ээс ялгаа' : 'Differs from Best',
            get: (d) =>
                d.mode === 'Best'
                    ? '—'
                    : `${(d.players || []).filter((p: Any) => !bestIds.has(p.id)).length} ${lang === 'mn' ? 'тоглогч' : 'players'}`,
        },
    ];

    return (
        <div className="draft-compare" style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table className="draft-compare-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr>
                        <th style={cellHead}>{lang === 'mn' ? 'Үзүүлэлт' : 'Metric'}</th>
                        {drafts.map((d) => (
                            <th key={d.mode} style={cellHead}>{MODE_LABEL[d.mode] || d.mode}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <td style={cellLabel}>{row.label}</td>
                            {drafts.map((d) => (
                                <td key={d.mode} style={cell}>{row.get(d)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

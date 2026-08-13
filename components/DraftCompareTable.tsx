import type { CSSProperties } from 'react';

type Any = any;

const MODE_LABEL: Record<string, string> = {
    Best: 'Best',
    Alternative: 'Alternative',
    Differential: 'Differential',
    Safe: 'Safe',
};

const BORDER = '1px solid rgba(128,128,128,0.25)';
const HILITE = 'rgba(56,161,105,0.16)';

const cellHead: CSSProperties = { textAlign: 'right', padding: '9px 12px', borderBottom: BORDER, fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' };
const cellHeadFirst: CSSProperties = { ...cellHead, textAlign: 'left' };
const cellLabel: CSSProperties = { padding: '8px 12px', borderBottom: BORDER, opacity: 0.7, whiteSpace: 'nowrap', textAlign: 'left' };
const cell: CSSProperties = { padding: '8px 12px', borderBottom: BORDER, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' };

function xiPoints(draft: Any): number {
    return Number((draft?.startingXI || []).reduce((sum: number, p: Any) => sum + (p.expectedPoints || 0), 0).toFixed(1));
}

function topCaptain(draft: Any): string {
    const xi = [...(draft?.startingXI || [])]
        .filter((p: Any) => p.position !== 'GKP')
        .sort((a: Any, b: Any) => (b.expectedPoints || 0) - (a.expectedPoints || 0));
    return xi[0]?.name || '—';
}

/**
 * Side-by-side comparison of the draft variants (one column per mode). The
 * variant with the highest projected XI points is highlighted with ⭐ so it is
 * obvious at a glance which option scores best.
 */
export function DraftCompareTable({ drafts, lang }: { drafts: Any[]; lang: 'mn' | 'en' }) {
    if (!drafts || drafts.length < 2) return null;
    const best = drafts.find((d) => d.mode === 'Best') || drafts[0];
    const bestIds = new Set((best?.players || []).map((p: Any) => p.id));

    const xiByMode = new Map<string, number>(drafts.map((d) => [d.mode, xiPoints(d)]));
    const topMode = [...xiByMode.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const trustLabel = (status: string) =>
        status === 'verified'
            ? lang === 'mn' ? 'Баталгаатай' : 'Verified'
            : status === 'provisional'
              ? lang === 'mn' ? 'Урьдчилсан' : 'Provisional'
              : lang === 'mn' ? 'Дутуу' : 'Insufficient';

    const rows: Array<{ label: string; get: (d: Any) => string; highlightBest?: boolean }> = [
        { label: lang === 'mn' ? 'XI таамаг оноо' : 'Projected XI xP', get: (d) => `${xiPoints(d)}`, highlightBest: true },
        { label: lang === 'mn' ? 'Багийн үнэ' : 'Squad cost', get: (d) => `£${(d.validation?.totalCost ?? 0).toFixed(1)}m` },
        { label: lang === 'mn' ? 'Банк' : 'Bank', get: (d) => `£${(d.flexibility?.bank ?? 0).toFixed(1)}m` },
        { label: lang === 'mn' ? 'Бүтэц' : 'Formation', get: (d) => d.formation || '—' },
        { label: lang === 'mn' ? 'Санал captain' : 'Top captain', get: (d) => topCaptain(d) },
        { label: lang === 'mn' ? 'Итгэл' : 'Trust', get: (d) => trustLabel(d.trust?.status) },
        {
            label: lang === 'mn' ? 'Best-ээс ялгаа' : 'Differs from Best',
            get: (d) => (d.mode === 'Best' ? '—' : `${(d.players || []).filter((p: Any) => !bestIds.has(p.id)).length} ${lang === 'mn' ? 'тоглогч' : 'players'}`),
        },
    ];

    return (
        <div className="draft-compare" style={{ overflowX: 'auto', margin: '4px 0 18px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr>
                        <th style={cellHeadFirst}>{lang === 'mn' ? 'Үзүүлэлт' : 'Metric'}</th>
                        {drafts.map((d) => (
                            <th key={d.mode} style={{ ...cellHead, background: d.mode === topMode ? HILITE : undefined }}>
                                {d.mode === topMode ? '⭐ ' : ''}
                                {MODE_LABEL[d.mode] || d.mode}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <td style={cellLabel}>{row.label}</td>
                            {drafts.map((d) => {
                                const isBestCol = d.mode === topMode;
                                const highlight = row.highlightBest && isBestCol;
                                return (
                                    <td
                                        key={d.mode}
                                        style={{
                                            ...cell,
                                            background: isBestCol ? HILITE : undefined,
                                            fontWeight: highlight ? 900 : 600,
                                        }}
                                    >
                                        {highlight ? '⭐ ' : ''}
                                        {row.get(d)}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {drafts
                .filter((d) => d.mode !== 'Best')
                .map((d) => {
                    const added = (d.players || []).filter((p: Any) => !bestIds.has(p.id)).map((p: Any) => p.name);
                    return added.length ? (
                        <p key={d.mode} style={{ margin: '6px 2px 0', fontSize: 12 }}>
                            <b>{MODE_LABEL[d.mode] || d.mode}:</b> Best-ээс ялгаатай нь → {added.join(', ')}
                        </p>
                    ) : null;
                })}
            <p style={{ margin: '8px 2px 0', fontSize: 12, opacity: 0.65 }}>
                {lang === 'mn'
                    ? '⭐ = хамгийн өндөр таамаг XI оноотой хувилбар. Дэлгэрэнгүйг доор нээж үзнэ.'
                    : '⭐ = variant with the highest projected XI points. Full detail in the cards below.'}
            </p>
        </div>
    );
}

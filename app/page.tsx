'use client';

import { Card } from '@/components/Card';
import { Metric } from '@/components/Metric';
import { Navbar } from '@/components/Navbar';
import { TermTip } from '@/components/TermTip';
import {
    actionPlanLabel,
    chipAction,
    chipReason,
    decisionActionLabel,
    decisionStatusLabel,
    decisionStrategyLabel,
    decisionSummaryLabel,
    dict,
    draftModeLabel,
    riskLevelLabel,
    signalLabel,
    strategyLabel,
    transferReason,
} from '@/lib/i18n';
import { defaultSettings, loadSettings, saveSettings } from '@/lib/storage';
import type { ModelPlayer, UserSettings } from '@/types/fpl';
import { useEffect, useState } from 'react';

type Any = any;

function openPlayerDetail(playerId: number) {
    window.dispatchEvent(new CustomEvent('open-player-detail', { detail: playerId }));
}

function PlayerDetailButton({ playerId }: { playerId: number }) {
    return (
        <button
            type="button"
            className="player-detail-button"
            onClick={() => openPlayerDetail(playerId)}
            aria-label="Тоглогчийн дэлгэрэнгүй анализ харах"
        >
            Дэлгэрэнгүй ↗
        </button>
    );
}

function PlayerDetailModal() {
    const [playerId, setPlayerId] = useState<number | null>(null);
    const [detail, setDetail] = useState<Any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const open = (event: Event) => setPlayerId((event as CustomEvent<number>).detail);
        window.addEventListener('open-player-detail', open);
        return () => window.removeEventListener('open-player-detail', open);
    }, []);

    useEffect(() => {
        if (!playerId) return;
        setLoading(true);
        setDetail(null);
        fetch(`/api/player/${playerId}`)
            .then(async (response) => {
                const body = await response.json();
                if (!response.ok) throw new Error(body.error || 'Player data unavailable');
                setDetail(body);
            })
            .catch((error) => setDetail({ error: error.message }))
            .finally(() => setLoading(false));
    }, [playerId]);

    useEffect(() => {
        if (!playerId) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setPlayerId(null);
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [playerId]);

    if (!playerId) return null;

    const player = detail?.player as ModelPlayer | undefined;
    const recent = detail?.recent;

    return (
        <div className="player-modal-backdrop" role="presentation" onMouseDown={() => setPlayerId(null)}>
            <section
                className="player-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Тоглогчийн дэлгэрэнгүй анализ"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="player-modal-head">
                    <div>
                        <span className="eyebrow">Official FPL data</span>
                        <h2>{player?.name || 'Тоглогчийн анализ'}</h2>
                        {player ? <p>{player.team} · {player.position} · £{player.price.toFixed(1)}m</p> : null}
                    </div>
                    <button className="player-modal-close" type="button" onClick={() => setPlayerId(null)} aria-label="Хаах">×</button>
                </div>

                {loading ? <div className="skeleton player-modal-loading" /> : null}
                {detail?.error ? <div className="warning-box">{detail.error}</div> : null}

                {player && recent ? (
                    <>
                        <div className="player-detail-summary">
                            <div><small>Starter confidence ↑</small><strong>{player.starterConfidence}%</strong></div>
                            <div><small>Predicted minutes ↑</small><strong>{player.predictedMinutes}</strong></div>
                            <div><small>Expected points ↑</small><strong>{player.expectedPoints.toFixed(1)}</strong></div>
                            <div><small>Risk ↓</small><strong>{player.risk}%</strong></div>
                        </div>

                        <div className="player-detail-quality">
                            <DataQualityBadge quality={recent.dataQuality} />
                            <span>Сүүлийн {recent.sampleSize} тоглолтын бодит мэдээлэлд тулгуурлав.</span>
                        </div>

                        <div className="player-history-grid">
                            <div><small>Гараанд эхэлсэн</small><strong>{recent.starts}/{recent.sampleSize}</strong><span>{recent.startRate}%</span></div>
                            <div><small>Дундаж минут</small><strong>{recent.averageMinutes}</strong><span>60+ минут: {recent.sixtyPlusRate}%</span></div>
                            <div><small>Дундаж оноо</small><strong>{recent.averagePoints}</strong><span>Trend: {recent.trend}</span></div>
                        </div>

                        <div className="player-recent-bars">
                            <h3>Сүүлийн тоглолтууд</h3>
                            {recent.recentMinutes.map((minutes: number, index: number) => (
                                <div key={`${minutes}-${index}`}>
                                    <span>GW {detail.history?.slice(-recent.sampleSize)[index]?.round || index + 1}</span>
                                    <div><i style={{ width: `${Math.min(100, (minutes / 90) * 100)}%` }} /></div>
                                    <b>{minutes} мин · {recent.recentPoints[index]} оноо</b>
                                </div>
                            ))}
                        </div>

                        {player.signals?.length ? (
                            <div className="player-official-signals">
                                <h3>Official warning / news</h3>
                                {player.signals.map((signal, index) => (
                                    <div className={`signal-${signal.severity}`} key={`${signal.type}-${index}`}>
                                        <strong>{signal.type}</strong>
                                        <span>{signal.message}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="notice player-no-signal">Official FPL дээр одоогоор injury/news warning алга.</div>
                        )}

                        <div className="player-upcoming">
                            <h3>Дараагийн тоглолтууд</h3>
                            <div>
                                {player.fixture?.fixtures?.slice(0, 5).map((fixture, index) => (
                                    <span key={`${fixture.opponent}-${index}`}>
                                        <b>{fixture.opponentName} {fixture.isHome ? 'H' : 'A'}</b>
                                        <small className={`fdr fdr-${fixture.difficulty}`}>FDR {fixture.difficulty}/5 ↓</small>
                                    </span>
                                ))}
                            </div>
                            <p>FDR бага байх тусам хялбар. Expected points, Starter confidence өндөр байх тусам сайн.</p>
                        </div>
                    </>
                ) : null}
            </section>
        </div>
    );
}

function DataQualityBadge({ quality }: { quality: ModelPlayer['dataQuality'] }) {
    const label = quality === 'good' ? 'Good data' : quality === 'limited' ? 'Limited data' : 'Unknown data';
    return (
        <span
            className={`data-quality data-quality-${quality}`}
            title={
                quality === 'good'
                    ? 'Бодит минут, гарааны мэдээлэл хангалттай.'
                    : quality === 'limited'
                      ? 'Өгөгдөл хязгаарлагдмал тул нэмэлт мэдээ шалгана.'
                      : 'Найдвартай минутын өгөгдөл байхгүй. Шууд сонгохоос болгоомжилно.'
            }
        >
            {label}
        </span>
    );
}

function PlayerRow({ p, index, lang }: { p: ModelPlayer; index?: number; lang: 'mn' | 'en' }) {
    const t = dict[lang];
    const width = Math.min(100, Math.max(8, p.expectedPoints * 12));
    return (
        <div className="row">
            <div>
                <div className="row-title">
                    {index ? <span className="badge">#{index}</span> : null}
                    <span>{p.name}</span>
                    {p.risk > 50 ? <span className="badge red">{t.risk}</span> : null}
                    {p.signals?.some((signal) => signal.severity === 'high') ? (
                        <span className="badge red" title={p.signals.map((signal) => signal.message).join(' · ')}>Official warning</span>
                    ) : null}
                    <DataQualityBadge quality={p.dataQuality} />
                </div>
                <div className="row-meta">
                    {p.team} · {p.position} · £{p.price}m ·{' '}
                    <TermTip description="Тухайн тоглогч гарааны бүрэлдэхүүнд эхлэх магадлал. 75%+ хүчтэй, 55%-аас доош эргэлзээтэй.">
                        Starter confidence
                    </TermTip>{' '}
                    {p.starterConfidence}% ·{' '}
                    <TermTip description="Дараагийн тоглолтод талбайд өнгөрүүлэхээр таамагласан минут. 70+ минут бол тоглох боломж харьцангуй өндөр.">
                        Predicted minutes
                    </TermTip>{' '}
                    {p.predictedMinutes} · {t.confidence} {p.confidence}
                </div>
                {p.fixture ? (
                    <div className="row-meta fixture-meta">
                        Fixture (тоглолт): {p.fixture.nextOpponent} · {p.fixture.nextIsHome ? 'H (талбайдаа)' : 'A (айлд)'} ·{' '}
                        <TermTip description="Fixture Difficulty Rating буюу тоглолтын хүндрэлийн үнэлгээ. 1 хамгийн хялбар, 5 хамгийн хүнд.">
                            FDR
                        </TermTip>{' '}
                        {p.fixture.nextDifficulty}/5 (1 хялбар, 5 хүнд) · Next 5 average (дараагийн 5-ын дундаж) {p.fixture.averageDifficulty}/5
                    </div>
                ) : null}
                <div className="bar">
                    <span style={{ ['--w' as string]: `${width}%` }} />
                </div>
                <PlayerDetailButton playerId={p.id} />
            </div>
            <div className="score" title="Expected Points: их байх тусам сайн">
                {p.expectedPoints.toFixed(1)}
                <small className="score-direction">↑ сайн</small>
            </div>
        </div>
    );
}

function DecisionInsight({ player, lang }: { player: ModelPlayer; lang: 'mn' | 'en' }) {
    const t = dict[lang];
    const risk = player.riskBreakdown;
    if (!risk) return null;
    return (
        <div className="insight-grid">
            <div className="insight-panel">
                <h3>{t.aiReason}</h3>
                <div className="tabs">
                    {player.reasons?.map((key) => (
                        <span className="tab good-tab" key={key}>
                            ✓ {signalLabel(key, lang)}
                        </span>
                    ))}
                </div>
                <h3>{t.warningSignals}</h3>
                <div className="tabs">
                    {player.warnings?.map((key) => (
                        <span className="tab warning-tab" key={key}>
                            ! {signalLabel(key, lang)}
                        </span>
                    ))}
                </div>
            </div>
            <div className="insight-panel">
                <div className="row-title">
                    {t.riskBreakdown}{' '}
                    <span className={`badge ${risk.level === 'high' ? 'red' : risk.level === 'low' ? 'green' : ''}`}>
                        {riskLevelLabel(risk.level, lang)}
                    </span>
                </div>
                {[
                    [t.injuryRisk, risk.injury],
                    [t.availabilityRisk, risk.availability],
                    [t.minutesRisk, risk.minutes],
                    [t.rotationRisk, risk.rotation],
                    [t.newsRisk, risk.news],
                ].map(([label, value]) => (
                    <div className="risk-line" key={String(label)}>
                        <span>{label}</span>
                        <b>{value}%</b>
                    </div>
                ))}
            </div>
        </div>
    );
}

function WeeklyActionPlan({ plan, lang }: { plan: Any; lang: 'mn' | 'en' }) {
    const t = dict[lang];
    if (!plan) return null;
    const groups = [
        { title: t.doNow, items: plan.doNow || [], className: 'good-tab' },
        { title: t.checkBeforeDeadline, items: plan.checkBeforeDeadline || [], className: '' },
        { title: t.avoidThisWeek, items: plan.avoid || [], className: 'warning-tab' },
    ];
    return (
        <div className="action-plan">
            <div className="row-title" style={{ marginBottom: 12 }}>
                {t.weeklyActionPlan}
                <span className={`badge ${plan.decisionStatus === 'ready' ? 'green' : plan.decisionStatus === 'wait' ? 'red' : ''}`}>
                    {decisionStatusLabel(plan.decisionStatus, lang)}
                </span>
            </div>
            <div className="grid grid-3">
                {groups.map((group) => (
                    <div className="insight-panel" key={group.title}>
                        <h3>{group.title}</h3>
                        <div className="action-list">
                            {group.items.map((key: string) => (
                                <div className={`action-item ${group.className}`} key={key}>
                                    {actionPlanLabel(key, lang)}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DraftPlayerTile({ player }: { player: ModelPlayer }) {
    const starterTone =
        player.starterConfidence >= 75 ? 'draft-confidence-good' : player.starterConfidence >= 55 ? 'draft-confidence-medium' : 'draft-confidence-low';

    return (
        <div className={`draft-player-tile ${starterTone}`}>
            <div className="draft-player-topline">
                <strong>{player.name}</strong>
                <span>£{player.price.toFixed(1)}m</span>
            </div>

            <div className="draft-player-team">
                {player.team} · {player.position} · <DataQualityBadge quality={player.dataQuality} />
            </div>
            {player.signals?.length ? (
                <div className="player-signal" title={player.signals.map((signal) => signal.message).join(' · ')}>
                    ! Official signal
                </div>
            ) : null}

            <div className="draft-player-metrics">
                <span title="Starter confidence — гарааны магадлал">Starter {player.starterConfidence}%</span>
                <span title="Predicted minutes — таамаг минут">{player.predictedMinutes} min</span>
            </div>

            {player.fixture ? (
                <div className="draft-fixture">
                    <span>
                        {player.fixture.nextOpponent} {player.fixture.nextIsHome ? '(H)' : '(A)'}
                    </span>
                    <b
                        className={`fdr fdr-${Math.round(player.fixture.nextDifficulty)}`}
                        title="FDR: 1 хамгийн хялбар, 5 хамгийн хүнд"
                    >
                        FDR {player.fixture.nextDifficulty} ↓
                    </b>
                </div>
            ) : (
                <div className="draft-fixture">
                    <span>Fixture тодорхойгүй</span>
                </div>
            )}
            <PlayerDetailButton playerId={player.id} />
        </div>
    );
}

function TargetRow({ player, rank, lang }: { player: ModelPlayer; rank: number; lang: 'mn' | 'en' }) {
    const t = dict[lang];
    const starterTone = player.starterConfidence >= 75 ? 'green' : player.starterConfidence < 55 ? 'red' : '';

    return (
        <div className="target-row">
            <span className="target-rank">{rank}</span>

            <div className="target-identity">
                <div className="row-title">
                    <strong>{player.name}</strong>
                    <span className="badge">{player.position}</span>
                    <DataQualityBadge quality={player.dataQuality} />
                </div>
                <div className="row-meta">
                    {player.team} · £{player.price.toFixed(1)}m · {t.ownership} {player.ownership}%
                </div>
            </div>

            <div className="target-fixture">
                <small>Дараагийн тоглолт</small>
                {player.fixture ? (
                    <strong>
                        {player.fixture.nextOpponent} {player.fixture.nextIsHome ? '(H)' : '(A)'}
                        <span className={`fdr fdr-${Math.round(player.fixture.nextDifficulty)}`}>FDR {player.fixture.nextDifficulty} ↓</span>
                    </strong>
                ) : (
                    <strong>Тодорхойгүй</strong>
                )}
            </div>

            <div className="target-stat">
                <small>
                    <TermTip description="Тоглогч гарааны бүрэлдэхүүнд эхлэх магадлал.">Starter</TermTip>
                </small>
                <span className={`badge ${starterTone}`}>{player.starterConfidence}%</span>
            </div>

            <div className="target-stat target-points">
                <small>
                    <TermTip description="Form, fixture, минут, гарааны магадлал болон эрсдэлд үндэслэсэн дараагийн Gameweek-ийн таамаг оноо.">
                        Expected points
                    </TermTip>
                </small>
                <strong>{player.expectedPoints.toFixed(1)} ↑</strong>
            </div>
            <PlayerDetailButton playerId={player.id} />
        </div>
    );
}

function RiskMonitor({ items }: { items: Any[] }) {
    const [filter, setFilter] = useState<'all' | 'high' | 'starter' | 'data'>('all');
    const visible = items
        .filter((item) => {
            if (filter === 'high') return item.severity === 'high';
            if (filter === 'starter') return item.reasons?.includes('low-starter-confidence');
            if (filter === 'data') return item.reasons?.includes('unknown-data');
            return true;
        })
        .slice(0, 12);

    return (
        <Card
            id="risk-monitor"
            title="Risk & News Monitor (эрсдэл, мэдээ)"
            subtitle="Official FPL warning болон гарааны эргэлзээтэй тоглогчдыг хамгийн ноцтойгоос нь эрэмбэлэв."
            helpHref="/docs#risk"
        >
            <div className="risk-monitor-head">
                <div className="risk-monitor-counts">
                    <span><b>{items.filter((item) => item.severity === 'high').length}</b> өндөр</span>
                    <span><b>{items.filter((item) => item.reasons?.includes('low-starter-confidence')).length}</b> starter эргэлзээтэй</span>
                    <span><b>{items.filter((item) => item.reasons?.includes('unknown-data')).length}</b> data unknown</span>
                </div>
                <div className="risk-monitor-filters">
                    {[
                        ['all', 'Бүгд'],
                        ['high', 'Өндөр'],
                        ['starter', 'Starter'],
                        ['data', 'Data'],
                    ].map(([value, label]) => (
                        <button
                            type="button"
                            className={filter === value ? 'active' : ''}
                            onClick={() => setFilter(value as typeof filter)}
                            key={value}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {visible.length ? (
                <div className="risk-monitor-list">
                    {visible.map((item) => {
                        const player = item.player as ModelPlayer;
                        return (
                            <div className={`risk-monitor-row risk-monitor-${item.severity}`} key={player.id}>
                                <span className="risk-monitor-level">
                                    {item.severity === 'high' ? '!' : item.severity === 'medium' ? '△' : 'i'}
                                </span>
                                <div className="risk-monitor-copy">
                                    <div>
                                        <strong>{player.name}</strong>
                                        <span>{player.team} · {player.position}</span>
                                        <DataQualityBadge quality={player.dataQuality} />
                                    </div>
                                    <p>{item.summary}</p>
                                </div>
                                <div className="risk-monitor-metrics">
                                    <span>Starter <b>{player.starterConfidence}%</b></span>
                                    <span>Risk <b>{player.risk}%</b></span>
                                </div>
                                <PlayerDetailButton playerId={player.id} />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="notice">Энэ шүүлтүүрт тохирох warning алга.</div>
            )}

            <p className="risk-monitor-note">
                “Warning алга” нь гараанд баталгаатай гэсэн үг биш. Data Quality болон Starter confidence-ийг хамтад нь шалгана.
            </p>
        </Card>
    );
}

function PositionTargetGroup({ position, players, lang }: { position: string; players: ModelPlayer[]; lang: 'mn' | 'en' }) {
    const labels: Record<string, { title: string; icon: string }> = {
        GKP: { title: 'Goalkeeper (Хаалгач)', icon: '🧤' },
        DEF: { title: 'Defender (Хамгаалагч)', icon: '🛡️' },
        MID: { title: 'Midfielder (Хагас хамгаалагч)', icon: '🎯' },
        FWD: { title: 'Forward (Довтлогч)', icon: '⚡' },
    };
    const label = labels[position] || { title: position, icon: '•' };

    return (
        <div className="position-target-group">
            <div className="position-target-head">
                <span>{label.icon}</span>
                <div>
                    <h3>{label.title}</h3>
                    <p>Тухайн байрлалын шилдэг сонголтууд</p>
                </div>
            </div>

            <div className="position-target-list">
                {players.slice(0, 4).map((player, index) => (
                    <div className="position-target-row" key={player.id}>
                        <span className="position-rank">{index + 1}</span>
                        <div>
                            <strong>{player.name}</strong>
                            <small>
                                {player.team} · £{player.price.toFixed(1)}m
                            </small>
                        </div>
                        <div className="position-target-score">
                            <strong>{player.expectedPoints.toFixed(1)}</strong>
                            <small>
                                <TermTip description="Дараагийн Gameweek-д авах хүлээгдэж буй таамаг оноо.">Expected</TermTip>
                            </small>
                        </div>
                        <div className="position-target-signal">
                            <span>{player.starterConfidence}% starter</span>
                            {player.fixture ? (
                                <span className={`fdr fdr-${Math.round(player.fixture.nextDifficulty)}`}>
                                    FDR {player.fixture.nextDifficulty} ↓
                                </span>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DraftCard({ draft, lang }: { draft: Any; lang: 'mn' | 'en' }) {
    const t = dict[lang];
    const totalCost = draft.validation?.totalCost || 0;
    const remainingBudget = Number(Math.max(0, 100 - totalCost).toFixed(1));
    const playerCount = draft.players?.length || 0;
    const positions = ['GKP', 'DEF', 'MID', 'FWD'];

    return (
        <details className="draft-team-card" open={draft.mode === 'Best'}>
            <summary className="draft-team-summary">
                <div className="draft-team-title">
                    <span className="draft-chevron">›</span>
                    <div>
                        <h3>{draftModeLabel(draft.mode, lang)}</h3>
                        <p>{draft.formation || '—'} formation · Гарааны {draft.startingXI?.length || 0}/11</p>
                    </div>
                </div>

                <div className="draft-summary-metrics">
                    <span>
                        <small>Нийт үнэ</small>
                        <b>£{totalCost.toFixed(1)}m</b>
                    </span>
                    <span>
                        <small>Үлдэгдэл</small>
                        <b>£{remainingBudget.toFixed(1)}m</b>
                    </span>
                    <span>
                        <small>Тоглогч</small>
                        <b>{playerCount}/15</b>
                    </span>
                    <span className={draft.validation.valid ? 'draft-valid' : 'draft-invalid'}>
                        {draft.validation.valid ? `✓ ${t.allGood}` : `! ${t.check}`}
                    </span>
                </div>
            </summary>

            <div className="draft-team-body">
                <div className="draft-toolbar">
                    <div>
                        <span className="draft-toolbar-label">Сонгосон formation (байрлал)</span>
                        <strong>{draft.formation || '—'}</strong>
                    </div>
                    <div>
                        <span className="draft-toolbar-label">Төсвийн ашиглалт</span>
                        <strong>{totalCost.toFixed(1)}%</strong>
                    </div>
                    <div className="draft-budget-track" aria-label={`Budget used £${totalCost.toFixed(1)}m`}>
                        <span style={{ width: `${Math.min(100, totalCost)}%` }} />
                    </div>
                </div>

                {!draft.validation.valid && draft.validation.errors?.length ? (
                    <div className="warning-box draft-warning">
                        <strong>Багийг баталгаажуулахаас өмнө шалгах зүйлс</strong>
                        {draft.validation.errors.map((error: string) => (
                            <div key={error}>• {error}</div>
                        ))}
                    </div>
                ) : null}

                <div className="draft-layout">
                    <div>
                        <div className="draft-section-title">
                            <div>
                                <span>Starting XI</span>
                                <h4>Гарааны 11</h4>
                            </div>
                            <span className="badge green">{draft.startingXI?.length || 0}/11</span>
                        </div>

                        <div className="football-pitch">
                            {positions.map((position) => {
                                const players = (draft.startingXI || []).filter((player: ModelPlayer) => player.position === position);
                                if (!players.length) return null;
                                return (
                                    <div className={`pitch-line pitch-${position.toLowerCase()}`} key={position}>
                                        {players.map((player: ModelPlayer) => (
                                            <DraftPlayerTile player={player} key={player.id} />
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <aside className="draft-sidebar">
                        <div className="draft-section-title">
                            <div>
                                <span>Bench</span>
                                <h4>Сэлгээ</h4>
                            </div>
                            <span className="badge">{draft.bench?.length || 0}/4</span>
                        </div>

                        <div className="draft-bench-list">
                            {draft.bench?.map((player: ModelPlayer, index: number) => (
                                <div className="draft-bench-player" key={player.id}>
                                    <span className="bench-order">{index + 1}</span>
                                    <DraftPlayerTile player={player} />
                                </div>
                            ))}
                        </div>

                        <div className="draft-legend">
                            <h4>Үзүүлэлтийг унших</h4>
                            <p><b>Starter ↑</b> — их байх тусам сайн.</p>
                            <p><b>Minutes ↑</b> — их байх тусам тоглох боломж өндөр.</p>
                            <p><b>FDR ↓</b> — бага байх тусам сайн. 1 хялбар, 5 хүнд.</p>
                            <p><b>Next 5 average ↓</b> — бага байх тусам хуваарь таатай.</p>
                            <p><b>Risk ↓</b> — бага байх тусам сайн.</p>
                        </div>
                    </aside>
                </div>

                <div className="draft-reasons">
                    {draft.explanation?.map((item: string) => (
                        <span key={item}>✓ {item}</span>
                    ))}
                </div>
            </div>
        </details>
    );
}

export default function Home() {
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [saved, setSaved] = useState(false);
    const [boot, setBoot] = useState<Any>(null);
    const [analysis, setAnalysis] = useState<Any>(null);
    const [league, setLeague] = useState<Any>(null);
    const [decision, setDecision] = useState<Any>(null);
    const [loading, setLoading] = useState(false);

    const lang = settings.lang || 'mn';
    const t = dict[lang];

    useEffect(() => {
        setSettings(loadSettings());
    }, []);
    useEffect(() => {
        fetch('/api/bootstrap')
            .then((r) => r.json())
            .then(setBoot)
            .catch((e) => setBoot({ error: e.message }));
    }, []);
    useEffect(() => {
        runDecision(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, []);

    const isPreSeason = boot?.isPreSeason ?? true;
    const statusTitle = isPreSeason ? t.preSeason : t.live;
    const deadline = boot?.nextEvent?.deadline_time ? new Date(boot.nextEvent.deadline_time).toLocaleString() : t.notPublished;

    async function runDecision() {
        setLoading(true);
        const res = await fetch('/api/decision', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                entryId: settings.entryId,
                riskProfile: settings.riskProfile,
                goal: settings.goal,
                freeTransfers: 1,
            }),
        });
        setDecision(await res.json());
        setLoading(false);
    }

    async function runAnalyze() {
        setLoading(true);
        setAnalysis(null);
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entryId: settings.entryId, freeTransfers: 1 }),
        });
        setAnalysis(await res.json());
        setLoading(false);
    }

    async function runLeague() {
        setLoading(true);
        setLeague(null);
        const res = await fetch('/api/league', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entryId: settings.entryId, leagueId: settings.leagueId }),
        });
        setLeague(await res.json());
        setLoading(false);
    }

    function updateSettings(next: Partial<UserSettings>) {
        setSettings((s) => ({ ...s, ...next }));
        setSaved(false);
    }

    function persist() {
        saveSettings(settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
    }

    const top = boot?.topPlayers?.slice(0, 10) || [];
    const captain = analysis?.captainShortlist || boot?.captainShortlist || [];
    const transfers = analysis?.transferSuggestions || [];
    const chips = analysis?.chips || boot?.chips || [];
    const topTargets = boot?.topTargets || {};
    const primaryChip = decision?.chips?.[0] || chips[0];
    const captainPick = captain?.[0] || decision?.captain;
    const viceCaptainPick = captain?.[1] || decision?.viceCaptain;

    return (
        <>
            <Navbar lang={lang} onLang={() => updateSettings({ lang: lang === 'mn' ? 'en' : 'mn' })} />
            <PlayerDetailModal />
            <main id="top">
                <section className="hero">
                    <div className="hero-panel">
                        <div className="hero-product-line">
                            <span className="eyebrow">⚽ AI Agent</span>
                            <span className="version-badge">AI Brain v2</span>
                            <a className="help-button" href="/docs#player-evaluation" aria-label="AI Brain v2 тайлбар">?</a>
                        </div>
                        <h1>{t.heroTitle}</h1>
                        <p className="lead">{t.heroLead}</p>
                        <div className="brain-capabilities">
                            <span>✓ Starter Intelligence (гарааны магадлал)</span>
                            <span>✓ Formation Optimizer (байрлал сонголт)</span>
                            <span>✓ Fixture & Risk (хуваарь ба эрсдэл)</span>
                        </div>
                        <div className="actions">
                            <a className="button-link" href="#drafts">
                                {t.navDrafts}
                            </a>
                            <a className="button-link secondary" href="#settings">
                                {t.navSettings}
                            </a>
                        </div>
                    </div>
                    <Card title={t.seasonStatus} subtitle={t.optionalIds} helpHref="/docs#start">
                        <div className="season-status-main">
                            <span className={`season-orb ${isPreSeason ? 'season-waiting' : 'season-live'}`} />
                            <div>
                                <small>{t.mode}</small>
                                <strong>{statusTitle}</strong>
                            </div>
                        </div>
                        <div className="season-facts">
                            <div><span>{t.nextDeadline}</span><b>{deadline}</b></div>
                            <div><span>Fixture data</span><b className={boot?.fixtureReady ? 'good' : 'yellow'}>{boot?.fixtureReady ? 'Ready (бэлэн)' : 'Waiting'}</b></div>
                            <div><span>Entry ID</span><b className={settings.entryId ? 'good' : 'yellow'}>{settings.entryId ? 'Connected' : 'Optional'}</b></div>
                        </div>
                        {!settings.entryId && (
                            <div className="season-note">
                                {t.noId} {t.addLater}
                            </div>
                        )}
                        {boot?.error ? <p className="bad">{boot.error}</p> : null}
                    </Card>
                </section>

                <Card title={t.thisWeekDecision} subtitle={t.decisionSub} helpHref="/docs#decision">
                    <div className="decision-status-line">
                        <span className={`decision-dot ${decision?.actionPlan?.decisionStatus === 'ready' ? 'ready' : ''}`} />
                        <strong>{decision?.actionPlan ? decisionStatusLabel(decision.actionPlan.decisionStatus, lang) : t.loading}</strong>
                        <span>{decision ? decisionStrategyLabel(decision.strategy, lang) : '—'}</span>
                    </div>

                    <div className="decision-glance-grid">
                        <div className="decision-glance primary">
                            <span>©</span>
                            <small>Captain (Ахлагч)</small>
                            <strong>{decision?.captain?.name || '—'}</strong>
                            <p>{decision?.captain ? `${decision.captain.expectedPoints.toFixed(1)} expected ↑ · ${decision.captain.starterConfidence}% starter` : 'Мэдээлэл хүлээж байна'}</p>
                        </div>
                        <div className="decision-glance">
                            <span>⇄</span>
                            <small>Transfer (Солилцоо)</small>
                            <strong>{decision?.transfer ? `${decision.transfer.out} → ${decision.transfer.in}` : decision ? decisionActionLabel(decision.action, lang) : '—'}</strong>
                            <p>{decision?.transfer ? `+${decision.transfer.expectedGain} expected gain` : 'No-hit шийдвэр'}</p>
                        </div>
                        <div className="decision-glance">
                            <span>◆</span>
                            <small>Chip (Тусгай эрх)</small>
                            <strong>{primaryChip?.chip || '—'}</strong>
                            <p>{primaryChip ? chipAction(primaryChip.action, lang) : 'Мэдээлэл хүлээж байна'}</p>
                        </div>
                        <div className="decision-glance">
                            <span>◎</span>
                            <small>Vice Captain (Дэд ахлагч)</small>
                            <strong>{decision?.viceCaptain?.name || '—'}</strong>
                            <p>Captain тоглохгүй үед орлоно</p>
                        </div>
                    </div>

                    <p className="decision-summary">
                        {decision ? decisionSummaryLabel(decision.summary, lang) : t.loading}
                    </p>

                    <div className="decision-footer">
                        <button className="btn" disabled={loading} onClick={runDecision}>
                            {loading ? t.loading : t.runDecision}
                        </button>
                        <details className="decision-details">
                            <summary>Дэлгэрэнгүй үндэслэл харах</summary>
                            {decision?.actionPlan ? <WeeklyActionPlan plan={decision.actionPlan} lang={lang} /> : null}
                            {decision?.captain ? <DecisionInsight player={decision.captain} lang={lang} /> : null}
                        </details>
                    </div>
                </Card>

                <section className="grid grid-3">
                    <Card title={t.dataFoundation} subtitle={t.dataText} helpHref="/docs#player-evaluation">
                        <div className="engine-status good-engine"><span>✓</span><strong>Official FPL API</strong><small>Үндсэн өгөгдлийн эх сурвалж</small></div>
                        <div className="engine-facts">
                            <div><span>Players</span><b>{boot?.playerCount ?? '...'}</b></div>
                            <div><span>Teams</span><b>{boot?.teamCount ?? '...'}</b></div>
                            <div><span>Fixtures</span><b>{boot?.fixtureCount ?? '...'}</b></div>
                        </div>
                        <p className="engine-footnote">Player, team, price, fixture болон status мэдээлэл 15 минутын cache ашиглана.</p>
                    </Card>
                    <Card title={t.ruleEngine} subtitle={t.ruleText} helpHref="/docs#drafts">
                        <div className="rule-checklist">
                            <div><span>✓</span><p><b>£100.0m</b><small>Нийт төсвийн хязгаар</small></p></div>
                            <div><span>✓</span><p><b>15 players</b><small>2 GKP · 5 DEF · 5 MID · 3 FWD</small></p></div>
                            <div><span>✓</span><p><b>Max 3</b><small>Нэг клубээс авах дээд тоо</small></p></div>
                            <div><span>✓</span><p><b>Valid XI</b><small>Зөв formation ба найдвартай гараа</small></p></div>
                        </div>
                    </Card>
                    <Card title={t.riskEngine} subtitle={t.riskText} helpHref="/docs#risk">
                        <div className="risk-direction-grid">
                            <div><small>Confidence</small><strong>↑ Их = сайн</strong><span>Саналд итгэх түвшин</span></div>
                            <div><small>Risk</small><strong>↓ Бага = сайн</strong><span>Биелэхгүй байх эрсдэл</span></div>
                        </div>
                        <div className="risk-inputs"><span>Injury</span><span>Minutes</span><span>Rotation</span><span>News</span></div>
                        <p className="engine-footnote">Өгөгдөл дутуу үед Risk 0% гэж үзэхгүй; Unknown/limited penalty хэрэглэнэ.</p>
                    </Card>
                </section>

                <RiskMonitor items={boot?.riskMonitor || []} />

                <Card id="settings" title={t.settings} subtitle={t.optionalIds} helpHref="/docs#start">
                    <div className="grid grid-3">
                        <label className="field">
                            <span>{t.entryId}</span>
                            <input
                                value={settings.entryId || ''}
                                placeholder={t.addLaterPlaceholder}
                                onChange={(e) => updateSettings({ entryId: e.target.value })}
                            />
                        </label>
                        <label className="field">
                            <span>{t.leagueId}</span>
                            <input
                                value={settings.leagueId || ''}
                                placeholder={t.addLaterPlaceholder}
                                onChange={(e) => updateSettings({ leagueId: e.target.value })}
                            />
                        </label>
                        <label className="field">
                            <span>{t.language}</span>
                            <select value={settings.lang} onChange={(e) => updateSettings({ lang: e.target.value as any })}>
                                <option value="mn">Монгол</option>
                                <option value="en">English</option>
                            </select>
                        </label>
                        <label className="field">
                            <span>{t.riskProfile}</span>
                            <select value={settings.riskProfile} onChange={(e) => updateSettings({ riskProfile: e.target.value as any })}>
                                <option value="safe">{t.safe}</option>
                                <option value="balanced">{t.balanced}</option>
                                <option value="aggressive">{t.aggressive}</option>
                            </select>
                        </label>
                        <label className="field">
                            <span>{t.goal}</span>
                            <select value={settings.goal} onChange={(e) => updateSettings({ goal: e.target.value as any })}>
                                <option value="overall">{t.overall}</option>
                                <option value="league">{t.league}</option>
                                <option value="both">{t.both}</option>
                            </select>
                        </label>
                        <div className="field">
                            <span>&nbsp;</span>
                            <button className="btn" onClick={persist}>
                                {saved ? t.saved : t.save}
                            </button>
                        </div>
                    </div>
                </Card>

                <section id="team" className="grid grid-2">
                    <Card title={t.navTeam} subtitle={t.liveTeamSub} helpHref="/docs#team">
                        <button className="btn" disabled={loading} onClick={runAnalyze}>
                            {loading ? t.loading : t.runTeamAnalysis}
                        </button>

                        {analysis?.summary ? (
                            <div className="grid grid-4" style={{ marginTop: 16 }}>
                                <Metric label={t.overall} value={analysis.summary.overallRank ?? '—'} />

                                <Metric label={t.gwRank} value={analysis.summary.gwRank ?? '—'} />

                                <Metric label={t.teamValue} value={analysis.summary.value != null ? `£${analysis.summary.value}m` : '—'} />

                                <Metric label={t.bank} value={analysis.summary.bank != null ? `£${analysis.summary.bank}m` : '—'} />
                            </div>
                        ) : null}

                        {analysis?.validation ? (
                            <div className="notice" style={{ marginTop: 14 }}>
                                {t.squadRules}: {analysis.validation.valid ? t.valid : t.invalid}
                            </div>
                        ) : null}

                        {analysis?.error ? (
                            <div className="warning-box" style={{ marginTop: 14 }}>
                                <strong>{analysis.error === 'FPL API unavailable' ? t.fplUnavailable : analysis.error}</strong>

                                {analysis.help ? <div style={{ marginTop: 8 }}>{analysis.help}</div> : null}
                            </div>
                        ) : null}

                        {analysis?.message ? <p className="muted">{t.noIdTeam}</p> : null}

                        {analysis?.recommendedLineup ? (
                            <div style={{ marginTop: 20 }}>
                                <div className="section-heading">
                                    <div>
                                        <h3>Recommended Lineup (Санал болгож буй гараа)</h3>

                                        <p>
                                            Formation (Байрлал): <strong>{analysis.recommendedLineup.formation}</strong>
                                        </p>
                                    </div>

                                    <span className="badge green">{analysis.recommendedLineup.startingXI?.length || 0}/11</span>
                                </div>

                                <h4 style={{ marginTop: 16 }}>Starting XI (Гарааны 11)</h4>

                                <div className="draft-list">
                                    {analysis.recommendedLineup.startingXI?.map((player: ModelPlayer, index: number) => (
                                        <PlayerRow key={player.id} p={player} index={index + 1} lang={lang} />
                                    ))}
                                </div>

                                <h4 style={{ marginTop: 18 }}>Bench (Сэлгээ)</h4>

                                <div className="draft-list">
                                    {analysis.recommendedLineup.bench?.map((player: ModelPlayer, index: number) => (
                                        <div className="draft-player" key={player.id}>
                                            <strong>
                                                {index + 1}. {player.name}
                                            </strong>

                                            <span>
                                                {player.position}
                                                {' · '}
                                                {player.team}
                                                {' · '}£{player.price.toFixed(1)}m{' · '}Starter confidence (гарааны магадлал){' '}
                                                {player.starterConfidence}% · Predicted minutes (таамаг минут) {player.predictedMinutes} · Risk
                                                (эрсдэл) {player.risk}%
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {analysis.recommendedLineup.warnings?.length ? (
                                    <div className="warning-box" style={{ marginTop: 14 }}>
                                        {analysis.recommendedLineup.warnings.map((warning: string) => (
                                            <div key={warning}>• {warning}</div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </Card>
                    <Card title={t.captainModel} subtitle={t.captainSub} helpHref="/docs#decision">
                        {captainPick ? (
                            <>
                                <div className="captain-primary">
                                    <div className="captain-mark">©</div>
                                    <div className="captain-primary-name">
                                        <small>№1 санал</small>
                                        <strong>{captainPick.name}</strong>
                                        <span>{captainPick.team} · {captainPick.position}</span>
                                    </div>
                                    <div className="captain-primary-score">
                                        <strong>{captainPick.expectedPoints.toFixed(1)} ↑</strong>
                                        <small>Expected Points</small>
                                    </div>
                                </div>
                                <div className="captain-signals">
                                    <span>Starter ↑ <b>{captainPick.starterConfidence}%</b></span>
                                    <span>Minutes ↑ <b>{captainPick.predictedMinutes}</b></span>
                                    <span>Risk ↓ <b>{captainPick.risk}%</b></span>
                                    {captainPick.fixture ? <span>FDR ↓ <b>{captainPick.fixture.nextDifficulty}</b></span> : null}
                                </div>
                                {viceCaptainPick ? (
                                    <div className="vice-captain-line">
                                        <span>VC</span>
                                        <div><small>Vice Captain (Дэд ахлагч)</small><strong>{viceCaptainPick.name}</strong></div>
                                        <b>{viceCaptainPick.expectedPoints.toFixed(1)} expected</b>
                                    </div>
                                ) : null}
                                <div className="captain-shortlist">
                                    {captain.slice(1, 5).map((player: ModelPlayer, index: number) => (
                                        <div key={player.id}>
                                            <span>{index + 2}</span>
                                            <div><strong>{player.name}</strong><small>{player.team} · {player.starterConfidence}% starter</small></div>
                                            <b>{player.expectedPoints.toFixed(1)}</b>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="muted">{t.noData}</p>
                        )}
                    </Card>
                </section>

                <section className="grid grid-2">
                    <Card title={t.transferEngine} subtitle={t.transferSub} helpHref="/docs#decision">
                        {transfers.length ? (
                            transfers.map((x: Any, i: number) => (
                                <div className="transfer-card" key={i} style={{ marginBottom: 12 }}>
                                    <div className="row-title">
                                        {x.out} → {x.in}
                                    </div>
                                    <div className="row-meta">
                                        {t.expected}: +{x.expectedGain} · {t.cost}: {x.costChange}m · {t.hit}: {x.hitCost}
                                    </div>
                                    <div className="tabs" style={{ marginTop: 10 }}>
                                        {x.reasons.map((r: string) => (
                                            <span className="tab" key={r}>
                                                {transferReason(r, lang)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="muted">{t.noSafeTransfer}</p>
                        )}
                    </Card>
                    <Card title={t.chipPlanner} subtitle={t.chipSub} helpHref="/docs#chips">
                        <div className="chip-planner-list">
                            {chips.map((c: Any) => (
                                <div className="chip-plan-row" key={c.chip}>
                                    <div className="chip-symbol">
                                        {c.chip === 'Wildcard' ? 'W' : c.chip === 'Free Hit' ? 'FH' : c.chip === 'Bench Boost' ? 'BB' : 'TC'}
                                    </div>
                                    <div className="chip-plan-copy">
                                        <div><strong>{c.chip}</strong><span className="badge green">{chipAction(c.action, lang)}</span></div>
                                        <p>{chipReason(c.chip, isPreSeason, lang)}</p>
                                    </div>
                                    <div className="chip-confidence">
                                        <strong>{c.confidence}%</strong>
                                        <small>Confidence ↑</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="chip-rule-note">Chip-ийг зөвхөн Double Gameweek биш, fixture, багийн бэлэн байдал, лигийн зөрүү болон ирээдүйн боломжтой хамт үнэлнэ.</div>
                    </Card>
                </section>

                <Card id="league" title={t.leagueIntelligence} subtitle={t.leagueSub} helpHref="/docs#league">
                    <button className="btn secondary" disabled={loading} onClick={runLeague}>
                        {loading ? t.loading : t.runLeagueAnalysis}
                    </button>
                    {league?.message && <p className="muted">{t.noIdLeague}</p>}
                    {league?.error && <p className="bad">{league.error}</p>}
                    {league?.strategy && (
                        <div className="grid grid-3" style={{ marginTop: 16 }}>
                            <Metric label={t.strategy} value={strategyLabel(league.strategy, lang)} />
                            <Metric label={t.managersAbove} value={league.managersAbove?.length || 0} />
                            <Metric label={t.gap} value={league.pointsBehindLeader ?? '—'} />
                        </div>
                    )}
                    {league?.managersAbove?.length ? (
                        <div className="grid grid-2" style={{ marginTop: 16 }}>
                            {league.managersAbove.slice(0, 12).map((m: Any) => (
                                <div className="manager-card" key={m.entry}>
                                    <div className="rank">{m.rank}</div>
                                    <div>
                                        <b>{m.teamName}</b>
                                        <div className="row-meta">
                                            {m.playerName} · {m.total} {t.points}
                                        </div>
                                    </div>
                                    <div className="score">+{m.gap}</div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </Card>

                <section id="drafts" className="grid grid-2">
                    <Card
                        title={t.topTargets}
                        subtitle="Бүх байрлалаас хамгийн өндөр үнэлгээтэй shortlist (товч жагсаалт)"
                        helpHref="/docs#targets"
                    >
                        <div className="target-table-head">
                            <span>Тоглогч</span>
                            <span>
                                <TermTip description="Дараагийн өрсөлдөгч болон тоглолтын хүндрэлийн мэдээлэл.">Fixture</TermTip>
                            </span>
                            <span>
                                <TermTip description="Гарааны бүрэлдэхүүнд эхлэх магадлал.">Starter</TermTip>
                            </span>
                            <span>
                                <TermTip description="Дараагийн Gameweek-ийн хүлээгдэж буй таамаг оноо.">Expected</TermTip>
                            </span>
                        </div>
                        <div className="target-list">
                            {top.length ? (
                                top.map((player: ModelPlayer, index: number) => (
                                    <TargetRow player={player} rank={index + 1} key={player.id} lang={lang} />
                                ))
                            ) : (
                                <div className="skeleton" />
                            )}
                        </div>
                        <div className="metric-direction-legend">
                            <span className="direction-good">Expected Points ↑ их = сайн</span>
                            <span className="direction-good">Starter ↑ их = сайн</span>
                            <span className="direction-low">FDR ↓ бага = сайн</span>
                            <span className="direction-low">Risk ↓ бага = сайн</span>
                        </div>
                    </Card>
                    <Card
                        title={t.positionTargets}
                        subtitle="Position (байрлал) бүрээр харьцуулсан шилдэг сонголтууд"
                        helpHref="/docs#targets"
                    >
                        <div className="position-target-grid">
                            {['GKP', 'DEF', 'MID', 'FWD'].map((position) => (
                                <PositionTargetGroup
                                    position={position}
                                    players={topTargets[position] || []}
                                    key={position}
                                    lang={lang}
                                />
                            ))}
                        </div>
                    </Card>
                </section>

                <Card title={t.draftTeams} subtitle={t.draftTeamsSub} helpHref="/docs#drafts">
                    {boot?.drafts?.length ? (
                        boot.drafts.map((d: Any) => <DraftCard draft={d} key={d.mode} lang={lang} />)
                    ) : (
                        <div className="skeleton" />
                    )}
                </Card>
            </main>
        </>
    );
}

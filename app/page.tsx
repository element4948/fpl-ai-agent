'use client';

import { Card } from '@/components/Card';
import { DataQualityBadge, FixtureTrendBadge } from '@/components/PlayerBadges';
import { DraftCompareTable } from '@/components/DraftCompareTable';
import { PlayerDetailButton, PlayerDetailModal } from '@/components/PlayerDetail';
import { MoreSection } from '@/components/MoreSection';
import { SeasonRoadmapCard } from '@/components/SeasonRoadmapCard';
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
import {
    evaluateForecast,
    loadCalibrationResults,
    saveForecast,
} from '@/lib/calibration';
import type { CalibrationResult, ModelPlayer, ModelReadiness, UserSettings } from '@/types/fpl';
import { positionMetricChecks, positionSelectionReasons } from '@/lib/position-model';
import {
    clearDecisionCache,
    readDashboardCache,
    readDecisionCache,
    writeDashboardCache,
    writeDecisionCache,
} from '@/lib/dashboard-cache';
import { useEffect, useState } from 'react';

type Any = any;


// Dashboard/decision client caches moved to lib/dashboard-cache.ts.


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
                        {p.fixture.nextDifficulty}/5 (1 хялбар, 5 хүнд) · Next 5 average (дараагийн 5-ын дундаж) {p.fixture.averageDifficulty}/5 ·{' '}
                        <FixtureTrendBadge fixture={p.fixture} />
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

function DraftPlayerTile({ player, role, audit }: { player: ModelPlayer; role: 'starter' | 'bench'; audit?: Any }) {
    const starterTone =
        player.starterConfidence >= 75 ? 'draft-confidence-good' : player.starterConfidence >= 55 ? 'draft-confidence-medium' : 'draft-confidence-low';
    const selectionReasons = [
        player.starterConfidence >= 75 ? 'Гарааны магадлал өндөр' : null,
        player.expectedPoints >= 5 ? `${player.expectedPoints.toFixed(1)} xP — онооны боломж өндөр` : null,
        ...positionSelectionReasons(player),
        player.fixture && player.fixture.averageDifficulty <= 2.8 ? 'Дараагийн 5 тоглолт таатай' : null,
        player.price <= 4.5 && player.starterConfidence >= 55 ? 'Үнэ цэнтэй төсвийн сонголт' : null,
        player.expectedGoalInvolvements > 0 ? 'xG/xA үндсэн үзүүлэлттэй' : null,
        player.roleAssessment?.role === 'backup' ? 'Зөвхөн сэлгээний хаалгач' : null,
    ].filter((reason): reason is string => Boolean(reason));
    const unreliable = player.starterConfidence < 55 || player.predictedMinutes < 45;
    const evidenceSources = player.evidence?.sources || [];
    const sourceChecks = [
        evidenceSources.some((source) => source.id === 'official-fpl' && source.status === 'available'),
        evidenceSources.some((source) => source.id === 'official-fpl-fixtures' && source.status === 'available'),
        evidenceSources.some((source) => source.id === 'official-fpl-history' && source.status !== 'missing'),
        Boolean(player.newsCheckedAt),
        Boolean(player.roleAssessment || player.externalNews?.some((signal) => signal.verification === 'confirmed' || signal.verification === 'corroborated')),
        Boolean(player.apiFootball),
    ];
    const passedSources = sourceChecks.filter(Boolean).length;
    const metricChecks = positionMetricChecks(player);
    const passedMetrics = audit?.passedMetrics ?? metricChecks.filter(Boolean).length;
    const totalMetrics = audit?.totalMetrics ?? metricChecks.length;
    const alternative = audit?.alternative;
    const alternativeReason = alternative
        ? alternative.blocker === 'budget'
            ? 'төсөв хүрэхгүй'
            : alternative.blocker === 'club-limit'
              ? 'клубийн 3 тоглогчийн хязгаар'
              : alternative.blocker === 'global-squad-balance'
                ? 'нийт squad-ийн хослол илүү'
                : 'одоогийн сонголтын model score өндөр'
        : '';

    return (
        <div className={`draft-player-tile ${starterTone}`}>
            <div className="draft-player-topline">
                <strong>{player.name}</strong>
                <span>£{player.price.toFixed(1)}m</span>
            </div>

            <div className="draft-player-team">
                {player.team} · {player.position}
            </div>
            <div className="draft-player-glance">
                <span className={`draft-player-role ${role === 'bench' ? 'bench-role' : 'starter-role'}`}>
                    {role === 'starter' ? 'Starting XI' : unreliable ? 'Bench only' : 'Bench cover'}
                </span>
            </div>
            {player.signals?.length ? (
                <div className="player-signal" title={player.signals.map((signal) => signal.message).join(' · ')}>
                    ! Official signal
                </div>
            ) : null}

            <div className="draft-core-metrics">
                <span title="Дараагийн Gameweek-ийн таамаг оноо">
                    <small>Expected</small>
                    <b>{player.expectedPoints.toFixed(1)} ↑</b>
                </span>
                <span title="Гарааны бүрэлдэхүүнд эхлэх магадлал">
                    <small>Starter</small>
                    <b>{player.starterConfidence}% ↑</b>
                </span>
                <span title="Injury, rotation, minutes болон news эрсдэл">
                    <small>Risk</small>
                    <b>{player.risk}% ↓</b>
                </span>
            </div>
            <div className="draft-selection-audit">
                <span>
                    <small>Эх сурвалж</small>
                    <b>{passedSources}/6</b>
                </span>
                <span>
                    <small>{player.position} шалгуур</small>
                    <b>{passedMetrics}/{totalMetrics}</b>
                </span>
                <span className="draft-candidate-rank">
                    <small>Нийт <b>#{audit?.rank || '—'}/{audit?.totalCandidates || '—'}</b></small>
                    <small>Final gate <b>#{audit?.eligibleRank || '—'}/{audit?.eligibleCandidates || '—'}</b></small>
                </span>
            </div>
            <div className="draft-why-compact">
                ✓ {(selectionReasons.length ? selectionReasons : ['Нотолгоо хязгаарлагдмал'])[0]}
            </div>
            {alternative ? (
                <div
                    className="draft-alternative-compact"
                    title={`${alternative.name}: үнэ ${alternative.priceDelta >= 0 ? '+' : ''}£${alternative.priceDelta.toFixed(1)}m · next 5 ${alternative.nextFiveDelta >= 0 ? '+' : ''}${alternative.nextFiveDelta.toFixed(1)} xP · ${alternativeReason}`}
                >
                    Дараагийн хувилбар: <b>{alternative.name}</b> · {alternative.nextFiveDelta >= 0 ? '+' : ''}{alternative.nextFiveDelta.toFixed(1)} xP · {alternativeReason}
                </div>
            ) : null}
            {unreliable ? (
                <div className="draft-player-reject">
                    ! Starter баталгаагүй — гараанд бүү тооц
                </div>
            ) : null}
            {player.fixture ? (
                <>
                    <div className={player.fixtureImpact >= 0 ? 'draft-why-compact' : 'draft-player-reject'}>
                        Fixture нөлөө {player.fixtureImpact >= 0 ? '+' : ''}{player.fixtureImpact.toFixed(2)} xP · FDR бага байх тусам сайн
                    </div>
                    <div className="draft-fixture-run" aria-label="Дараагийн 5 тоглолт">
                        {player.fixture.fixtures.slice(0, 5).map((fixture, index) => (
                            <span
                                className={`draft-fixture-pill fdr-bg-${Math.round(fixture.difficulty)}`}
                                key={`${fixture.opponent}-${fixture.event}-${index}`}
                            >
                                <b>{fixture.opponentName}</b>
                                <small>{fixture.isHome ? 'H' : 'A'} · {fixture.difficulty}</small>
                            </span>
                        ))}
                    </div>
                    <div className="draft-fixture-run-summary">
                        <span>Next 5 avg {player.fixture.averageDifficulty}/5 ↓</span>
                        <FixtureTrendBadge fixture={player.fixture} />
                    </div>
                </>
            ) : (
                <div className="draft-fixture">
                    <span>Fixture тодорхойгүй</span>
                </div>
            )}
            <details className="draft-player-details">
                <summary>Дэлгэрэнгүй статистик ба нотолгоо</summary>
                <div className="draft-selection-reasons">
                    {selectionReasons.length
                        ? selectionReasons.slice(0, 5).map((reason) => <span key={reason}>✓ {reason}</span>)
                        : <span>△ Нотолгоо хязгаарлагдмал</span>}
                </div>
                <div className="draft-player-metrics">
                    <span>Minutes <b>{player.predictedMinutes}</b></span>
                    <span>Evidence <b>{player.evidence?.coverageScore || 0}%</b></span>
                    <span>G/A <b>{player.goalsScored}/{player.assists}</b></span>
                    {player.position === 'GKP' || player.position === 'DEF' ? (
                        <span>CS <b>{player.cleanSheets}</b></span>
                    ) : null}
                    {player.position === 'DEF' ? (
                        <span>DefCon/90 <b>{player.defensiveContributionPer90.toFixed(1)}</b></span>
                    ) : null}
                    <span>
                        Set piece{' '}
                        <b>
                            {player.setPieceRoles?.penalties === 1
                                ? 'PEN'
                                : player.setPieceRoles?.directFreeKicks === 1
                                  ? 'FK'
                                  : player.setPieceRoles?.corners === 1
                                    ? 'COR'
                                    : '—'}
                        </b>
                    </span>
                    <DataQualityBadge quality={player.dataQuality} />
                </div>
                {player.roleAssessment ? (
                    <div className="draft-role-warning">
                        <strong>Role: {player.roleAssessment.role}</strong>
                        <p>{player.roleAssessment.note}</p>
                        <a href={player.roleAssessment.sourceUrl} target="_blank" rel="noreferrer">
                            {player.roleAssessment.sourceLabel} · {player.roleAssessment.checkedAt}
                        </a>
                        {player.roleAssessment.corroboratingSources?.map((source) => (
                            <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                                {source.tier}: {source.label}
                            </a>
                        ))}
                        {player.roleAssessment.expiresAt ? (
                            <small>Дахин шалгах хугацаа: {player.roleAssessment.expiresAt}</small>
                        ) : null}
                    </div>
                ) : null}
                {player.externalNews?.length ? (
                    <div className="draft-role-warning">
                        <strong>Сүүлийн 8 хоногийн external signals</strong>
                        {player.externalNews.slice(0, 3).map((signal) => (
                            <a href={signal.url} target="_blank" rel="noreferrer" key={`${signal.url}-${signal.headline}`}>
                                {signal.verification} · {signal.tier} · {signal.category}: {signal.headline}
                            </a>
                        ))}
                    </div>
                ) : null}
            </details>
            <PlayerDetailButton playerId={player.id} />
        </div>
    );
}

function TargetRow({ player, rank }: { player: ModelPlayer; rank: number }) {
    const starterTone = player.starterConfidence >= 75 ? 'green' : player.starterConfidence < 55 ? 'red' : '';

    return (
        <div className="target-row">
            <span className="target-rank">{rank}</span>

            <div className="target-identity">
                <div className="row-title">
                    <strong>{player.name}</strong>
                    <span className="badge">{player.position}</span>
                </div>
                <div className="row-meta">
                    {player.team} · £{player.price.toFixed(1)}m
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
            <div className="notice risk-monitor-explainer">
                <b>Энэ хэсэг юу харуулах вэ?</b> Injury, гарааны магадлал, минут, rotation, transfer/news болон data coverage-ийг нэгтгэнэ.
                <b> Limited data</b> гэдэг нь тоглогч муу гэсэн үг биш; шинэ улирлын баталгаатай минут, role эсвэл олон эх сурвалжийн мэдээлэл хараахан хүрэлцээгүй гэсэн үг.
            </div>
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
                {players.slice(0, 3).map((player, index) => (
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
                            <div className="position-fixture-run">
                                {player.fixture?.fixtures.slice(0, 5).map((fixture, fixtureIndex) => (
                                    <span
                                        className={`fdr fdr-${Math.round(fixture.difficulty)}`}
                                        title={`GW${fixture.event || '?'} · ${fixture.isHome ? 'талбайдаа' : 'айлд'} · FDR ${fixture.difficulty}/5`}
                                        key={`${fixture.event}-${fixture.opponent}-${fixtureIndex}`}
                                    >
                                        {fixture.opponentName} {fixture.isHome ? 'H' : 'A'} · {fixture.difficulty}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DraftCard({ draft, lang, onUse }: { draft: Any; lang: 'mn' | 'en'; onUse?: (draft: Any) => void }) {
    const t = dict[lang];
    const totalCost = draft.validation?.totalCost || 0;
    const remainingBudget = Number(Math.max(0, 100 - totalCost).toFixed(1));
    const playerCount = draft.players?.length || 0;
    const positions = ['GKP', 'DEF', 'MID', 'FWD'];
    const finalReady = draft.validation.valid && draft.trust?.status === 'verified';
    const positionAudit = positions.map((position) => {
        const players = (draft.players || []).filter((player: ModelPlayer) => player.position === position);
        const checks = players.flatMap((player: ModelPlayer) => positionMetricChecks(player));
        return { position, players: players.length, passed: checks.filter(Boolean).length, total: checks.length };
    });

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
                    <span className={`draft-trust-${draft.trust?.status || 'insufficient'}`}>
                        <small>Trust</small>
                        <b>{draft.trust?.score || 0}%</b>
                    </span>
                    <span className={`draft-flex-${draft.flexibility?.status || 'rigid'}`}>
                        <small>Flexibility</small>
                        <b>{draft.flexibility?.score || 0}%</b>
                    </span>
                    <span className={finalReady ? 'draft-valid' : 'draft-invalid'}>
                        {finalReady
                            ? '✓ Final-ready'
                            : draft.validation.valid
                              ? '△ Rules valid · not final'
                              : `! ${t.check}`}
                    </span>
                </div>
            </summary>

            <div className="draft-team-body">
                <details className="draft-meta-disclosure">
                    <summary>Шалгалт, algorithm ба төсвийн дэлгэрэнгүй</summary>
                    <div className="draft-meta-body">
                <div className="draft-audit-strip">
                    <span><small>News scan</small><b>{draft.trust?.newsCheckedPlayers || 0}/15</b></span>
                    <span title="Саналд бодитоор орсон төрлийн data stream. Энэ нь 6 тусдаа сайт бүх тоглогчийг баталсан гэсэн үг биш."><small>Available streams</small><b>{draft.trust?.sourceCount || 0}/6</b></span>
                    {positionAudit.map((audit) => (
                        <span key={audit.position}>
                            <small>{audit.position} · {audit.players} player</small>
                            <b>{audit.passed}/{audit.total}</b>
                        </span>
                    ))}
                </div>
                <div className="notice draft-algorithm-summary">
                    <b>Dream Team сонголт:</b>{' '}
                    1) availability, role, мэдээний strict gate →{' '}
                    2) нэг удаа тооцсон appearance-adjusted xP + 3/5/8 GW projection →{' '}
                    3) £100m, 2/5/5/3, клубээс ≤3 →{' '}
                    4) бүх formation-оос хамгийн сайн XI + captain/vice + сэлгээ орох магадлал + bank/flexibility.
                    Эх сурвалжийн coverage нь итгэлцлийн gate болохоос performance bonus биш.
                </div>
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
                    {onUse ? (
                        <button type="button" className="btn secondary" disabled={!finalReady} onClick={() => onUse(draft)}>
                            {finalReady ? 'Энэ final draft-ийг миний баг болгох' : 'Final verification хүлээгдэж байна'}
                        </button>
                    ) : null}
                </div>
                {draft.formationAlternatives?.length ? (
                    <div className="tabs" style={{ marginBottom: 12 }}>
                        {draft.formationAlternatives.map((option: Any, index: number) => (
                            <span className={`tab ${index === 0 ? 'good-tab' : ''}`} key={option.formation}>
                                {option.formation} · {index === 0 ? 'сонгосон' : `−${option.gap.toFixed(2)} model pts`}
                            </span>
                        ))}
                    </div>
                ) : null}

                {!draft.validation.valid && draft.validation.errors?.length ? (
                    <div className="warning-box draft-warning">
                        <strong>Багийг баталгаажуулахаас өмнө шалгах зүйлс</strong>
                        {draft.validation.errors.map((error: string) => (
                            <div key={error}>• {error}</div>
                        ))}
                    </div>
                ) : null}

                {draft.trust ? (
                    <div className={`draft-trust-panel draft-trust-${draft.trust.status}`}>
                        <div className="draft-trust-main">
                            <span>Draft Trust Score</span>
                            <strong>{draft.trust.score}%</strong>
                            <b>
                                {draft.trust.status === 'verified'
                                    ? 'Verified'
                                    : draft.trust.status === 'provisional'
                                      ? 'Provisional — дахин шалгана'
                                      : 'Insufficient — баталгаатай санал биш'}
                            </b>
                        </div>
                        <div className="draft-source-coverage">
                            <span title="Official FPL player/fixture/history, API-Football, official/reliable news-ээс энэ draft-д бодитоор өгөгдөл өгсөн stream"><b>{draft.trust.sourceCount}/6</b> data streams present</span>
                            <span><b>{draft.trust.goodDataPlayers}</b> good data</span>
                            <span><b>{draft.trust.limitedDataPlayers}</b> limited</span>
                            <span><b>{draft.trust.unknownDataPlayers}</b> unknown</span>
                            <span><b>{draft.trust.newsCheckedPlayers || 0}/15</b> recent news checked</span>
                        </div>
                        {draft.trust.blockers?.length ? (
                            <div className="draft-trust-blockers">
                                {draft.trust.blockers.map((blocker: string) => <span key={blocker}>! {blocker}</span>)}
                            </div>
                        ) : null}
                        {draft.trust.warnings?.length ? (
                            <div className="draft-trust-warnings">
                                {draft.trust.warnings.map((warning: string) => <span key={warning}>△ {warning}</span>)}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {draft.flexibility ? (
                    <div className={`draft-flex-panel draft-flex-${draft.flexibility.status}`}>
                        <div className="draft-flex-title">
                            <div>
                                <span>GW1 Squad Flexibility</span>
                                <strong>{draft.flexibility.score}/100</strong>
                            </div>
                            <b>
                                {draft.flexibility.status === 'flexible'
                                    ? 'Flexible — шилжилт хийхэд бэлэн'
                                    : draft.flexibility.status === 'balanced'
                                      ? 'Balanced — боломжийн'
                                      : 'Rigid — forced transfer эрсдэлтэй'}
                            </b>
                        </div>
                        <div className="draft-flex-metrics">
                            <span><small>Bank</small><b>£{draft.flexibility.bank.toFixed(1)}m</b><i>Target £{draft.flexibility.targetBank.toFixed(1)}m</i></span>
                            <span><small>Starting XI</small><b>£{draft.flexibility.startingCost.toFixed(1)}m</b><i>Гарааны төсөв</i></span>
                            <span><small>Lean bench</small><b>£{draft.flexibility.benchCost.toFixed(1)}m</b><i>Usable floor £{draft.flexibility.benchBudgetTarget.toFixed(1)}m</i></span>
                            <span><small>Price points</small><b>{draft.flexibility.pricePointCount}</b><i>Солих үнийн шат</i></span>
                            <span><small>Emergency cover</small><b>{draft.flexibility.emergencyBenchPlayers ?? 0}/4</b><i>Хямд · минут авах боломжтой</i></span>
                            <span><small>Upgrade paths</small><b>{draft.flexibility.upgradePaths}</b><i>£0.5m дотор</i></span>
                            <span><small>Next 5 ready</small><b>{draft.flexibility.fixtureReadyPlayers}/15</b><i>FDR avg ≤3.3</i></span>
                        </div>
                        {draft.flexibility.warnings?.length ? (
                            <div className="draft-flex-warnings">
                                {draft.flexibility.warnings.map((warning: string) => <span key={warning}>△ {warning}</span>)}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                    </div>
                </details>

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
                                            <DraftPlayerTile player={player} role="starter" audit={draft.selectionAudit?.[player.id]} key={player.id} />
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
                                    <DraftPlayerTile player={player} role="bench" audit={draft.selectionAudit?.[player.id]} />
                                </div>
                            ))}
                        </div>

                        <details className="draft-legend">
                            <summary>Үзүүлэлтүүдийг тайлбарлах</summary>
                            <h4>Үзүүлэлтийг унших</h4>
                            <p><b>Starter ↑</b> — их байх тусам сайн.</p>
                            <p><b>Minutes ↑</b> — их байх тусам тоглох боломж өндөр.</p>
                            <p><b>FDR ↓</b> — бага байх тусам сайн. 1 хялбар, 5 хүнд.</p>
                            <p><b>Next 5 average ↓</b> — бага байх тусам хуваарь таатай.</p>
                            <p><b>Risk ↓</b> — бага байх тусам сайн.</p>
                        </details>
                    </aside>
                </div>

                <details className="draft-reasons">
                    <summary>Багийг сонгосон нэмэлт шалтгаан</summary>
                    {draft.explanation?.map((item: string) => <span key={item}>✓ {item}</span>)}
                </details>
            </div>
        </details>
    );
}


function pickTrust(player: Any, degraded: boolean, lang: 'mn' | 'en'): { text: string; cls: string } | null {
    if (!player) return null;
    if (degraded) return { text: lang === 'mn' ? 'Баталгаажаагүй' : 'Unverified', cls: 'yellow' };
    const dq = player.dataQuality;
    const newsChecked = Boolean(player.newsCheckedAt);
    if (dq === 'good' && newsChecked) return { text: lang === 'mn' ? 'Баталгаатай' : 'Verified', cls: 'good' };
    if (dq === 'unknown') return { text: lang === 'mn' ? 'Өгөгдөл дутуу' : 'Data limited', cls: 'yellow' };
    return { text: lang === 'mn' ? 'Урьдчилсан' : 'Provisional', cls: 'yellow' };
}

function TrustChip({ trust }: { trust: { text: string; cls: string } | null }) {
    if (!trust) return null;
    return (
        <span
            className={trust.cls}
            style={{ fontSize: 11, fontWeight: 600, opacity: 0.9, display: 'inline-block', marginTop: 4 }}
        >
            ● {trust.text}
        </span>
    );
}

function formatCountdown(ms: number, lang: 'mn' | 'en'): string {
    if (ms <= 0) return lang === 'mn' ? 'Deadline өнгөрсөн' : 'Deadline passed';
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

export default function Home() {
    const [settings, setSettings] = useState<UserSettings>(defaultSettings);
    const [saved, setSaved] = useState(false);
    const [boot, setBoot] = useState<Any>(null);
    const [analysis, setAnalysis] = useState<Any>(null);
    const [league, setLeague] = useState<Any>(null);
    const [decision, setDecision] = useState<Any>(null);
    const [decisionError, setDecisionError] = useState<string | null>(null);
    const [notify, setNotify] = useState<{ loading: boolean; message: string; ok: boolean | null }>({ loading: false, message: '', ok: null });
    const [fixtureStatus, setFixtureStatus] = useState<Any>(null);
    const [calibrationResults, setCalibrationResults] = useState<CalibrationResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [cloud, setCloud] = useState({ configured: false, authenticated: false, loading: true, error: '' });
    const [loginPassword, setLoginPassword] = useState('');
    const [now, setNow] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    const lang = settings.lang || 'mn';
    const t = dict[lang];

    useEffect(() => {
        const loaded = loadSettings();
        setSettings(loaded);
        const cachedDecision = readDecisionCache(loaded);
        if (cachedDecision?.actionPlan) setDecision(cachedDecision);
    }, []);
    useEffect(() => {
        let cancelled = false;
        async function loadCloudProfile() {
            try {
                const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
                const session = await sessionResponse.json();
                if (cancelled) return;
                setCloud({ ...session, loading: false, error: '' });
                if (!session.authenticated) return;
                const profileResponse = await fetch('/api/profile', { cache: 'no-store' });
                const profile = await profileResponse.json();
                if (!profileResponse.ok || cancelled) return;
                if (!profile.settings) {
                    await fetch('/api/profile', {
                        method: 'PUT',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ settings: loadSettings() }),
                    });
                    return;
                }
                const synced = { ...defaultSettings, ...profile.settings };
                setSettings(synced);
                saveSettings(synced);
                const cachedDecision = readDecisionCache(synced);
                if (cachedDecision?.actionPlan) setDecision(cachedDecision);
            } catch {
                if (!cancelled) setCloud((current) => ({ ...current, loading: false, error: 'Cloud sync шалгаж чадсангүй.' }));
            }
        }
        void loadCloudProfile();
        return () => { cancelled = true; };
    }, []);
    useEffect(() => {
        let cancelled = false;
        async function loadDashboard() {
            try {
                const cached = readDashboardCache();
                if (cached && !cancelled) setBoot(cached);

                const fastResponse = await fetch('/api/bootstrap?fast=1');
                const fastData = await fastResponse.json();
                if (!cancelled && !cached) {
                    setBoot(fastData);
                }

                const verifiedResponse = await fetch('/api/bootstrap');
                const verifiedData = await verifiedResponse.json();
                if (cancelled) return;
                setBoot(verifiedData);
                writeDashboardCache(verifiedData);

                // Do not duplicate the expensive verification calls during the
                // first render. Decision analysis starts after the verified
                // dashboard response has warmed the server-side fetch cache.
                const activeSettings = loadSettings();
                if (!readDecisionCache(activeSettings)?.actionPlan) {
                    await runDecision(activeSettings);
                }
                // Auto-analyze the configured team so the recommended XI, squad
                // and transfer suggestions appear without a manual button click.
                if (activeSettings.entryId) {
                    await runAnalyze(activeSettings);
                }
                if (activeSettings.entryId && activeSettings.leagueId) {
                    await runLeague(activeSettings);
                }
            } catch (error) {
                if (!cancelled) {
                    setBoot({ error: error instanceof Error ? error.message : 'Dashboard load failed' });
                }
            }
        }
        void loadDashboard();
        return () => {
            cancelled = true;
        };
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, []);
    useEffect(() => {
        let cancelled = false;
        fetch('/api/fixture-status')
            .then((response) => response.json())
            .then((data) => {
                if (!cancelled) setFixtureStatus(data);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        setCalibrationResults(loadCalibrationResults());
    }, []);
    useEffect(() => {
        if (!boot) return;
        saveForecast(
            boot.nextEvent?.id,
            boot.nextEvent?.deadline_time,
            boot.topPlayers || [],
        );
        if (boot.calibration?.eventId && boot.calibration?.actuals) {
            setCalibrationResults(
                evaluateForecast(
                    boot.calibration.eventId,
                    boot.calibration.actuals,
                ),
            );
        }
    }, [boot]);

    // Live deadline countdown (ticks every 30s; minute resolution is enough).
    useEffect(() => {
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const isPreSeason = boot?.isPreSeason ?? true;
    const statusTitle = isPreSeason ? t.preSeason : t.live;
    const deadline = boot?.nextEvent?.deadline_time ? new Date(boot.nextEvent.deadline_time).toLocaleString() : t.notPublished;
    const deadlineMs = boot?.nextEvent?.deadline_time ? new Date(boot.nextEvent.deadline_time).getTime() : null;
    const countdown = deadlineMs != null && now != null ? formatCountdown(deadlineMs - now, lang) : null;
    const deadlineUrgent = deadlineMs != null && now != null && deadlineMs - now > 0 && deadlineMs - now < 6 * 3600 * 1000;
    const dataDegraded = Boolean(boot?.dataStatus?.degraded || boot?.degraded);
    const transferPlans: Any[] = analysis?.transferPlans || decision?.transferPlans || [];
    const recommendedPlan: Any = transferPlans.find((plan: Any) => plan?.recommended) || null;
    const captainTrust = pickTrust(decision?.captain, dataDegraded, lang);
    const viceTrust = pickTrust(decision?.viceCaptain, dataDegraded, lang);
    const transferInTrust = pickTrust(decision?.transfer?.inPlayer, dataDegraded, lang);

    async function copyPicks() {
        const lines: string[] = [];
        if (decision?.captain) lines.push(`Captain: ${decision.captain.name}`);
        if (decision?.viceCaptain) lines.push(`Vice: ${decision.viceCaptain.name}`);
        if (recommendedPlan?.moves?.length) {
            for (const move of recommendedPlan.moves) lines.push(`Transfer: ${move.out} → ${move.in}`);
        } else if (decision?.transfer) {
            lines.push(`Transfer: ${decision.transfer.out} → ${decision.transfer.in}`);
        }
        try {
            await navigator.clipboard.writeText(lines.length ? lines.join('\n') : 'No picks yet');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable */
        }
    }

    async function runDecision(activeSettings: UserSettings = settings) {
        setLoading(true);
        setDecisionError(null);
        try {
            const res = await fetch('/api/decision', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    entryId: activeSettings.entryId,
                    riskProfile: activeSettings.riskProfile,
                    goal: activeSettings.goal,
                    freeTransfers: activeSettings.freeTransfers ?? 1,
                    plannedSquadIds: activeSettings.plannedSquadIds || [],
                }),
            });
            const data = await res.json();
            // A `{ error }` payload (FPL outage / timeout) is truthy — if we stored
            // it as the decision the whole panel breaks: "—" cards, an empty summary
            // bar, and a permanent "loading" status. Treat it as an explicit error
            // state instead and keep any previously good decision on screen.
            if (!data || data.error || !data.actionPlan) {
                setDecisionError(data?.error || 'no-decision');
            } else {
                setDecision(data);
                setDecisionError(null);
                writeDecisionCache(activeSettings, data);
            }
        } catch {
            setDecisionError('network');
        } finally {
            setLoading(false);
        }
    }

    async function sendLatestNews() {
        setNotify({ loading: true, message: '', ok: null });
        try {
            const res = await fetch('/api/notify/refresh', { method: 'POST' });
            const data = await res.json();
            if (res.status === 401) {
                setNotify({ loading: false, ok: false, message: 'Telegram мэдэгдэл илгээхийн тулд эхлээд эзэмшигчээр нэвтэрнэ үү.' });
            } else if (data.skipped === 'telegram-not-configured') {
                setNotify({ loading: false, ok: false, message: 'Telegram тохируулагдаагүй байна (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID-г Vercel env дээр нэмнэ үү).' });
            } else if (data.skipped === 'cooldown') {
                setNotify({ loading: false, ok: false, message: 'Түр хүлээгээд дахин оролдоно уу (30 секунд).' });
            } else if (data.ok) {
                const newBit = data.newSinceLast > 0 ? `${data.newSinceLast} шинэ зүйл` : 'шинэ зүйл алга';
                const resent = data.resentPrevious ? ' · өмнөх мэдэгдэл давтан илгээв' : '';
                setNotify({ loading: false, ok: true, message: `✅ Telegram руу илгээлээ (${newBit}${resent}).` });
            } else {
                setNotify({ loading: false, ok: false, message: `Илгээж чадсангүй${data.error ? `: ${data.error}` : ''}. Дараа дахин оролдоно уу.` });
            }
        } catch {
            setNotify({ loading: false, ok: false, message: 'Сүлжээний алдаа. Дараа дахин оролдоно уу.' });
        }
    }

    async function runAnalyze(activeSettings: UserSettings = settings) {
        if (!activeSettings.entryId) return;
        setLoading(true);
        setAnalysis(null);
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entryId: activeSettings.entryId, freeTransfers: activeSettings.freeTransfers ?? 1 }),
        });
        setAnalysis(await res.json());
        setLoading(false);
    }

    async function runLeague(activeSettings: UserSettings = settings) {
        if (!activeSettings.entryId || !activeSettings.leagueId) return;
        setLoading(true);
        setLeague(null);
        const res = await fetch('/api/league', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entryId: activeSettings.entryId, leagueId: activeSettings.leagueId }),
        });
        setLeague(await res.json());
        setLoading(false);
    }

    function updateSettings(next: Partial<UserSettings>) {
        setSettings((s) => ({ ...s, ...next }));
        setSaved(false);
    }

    async function saveCloudSettings(nextSettings: UserSettings) {
        if (!cloud.authenticated) return;
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ settings: nextSettings }),
        });
        if (!response.ok) throw new Error('Cloud хадгалалт амжилтгүй боллоо.');
    }

    async function persist() {
        saveSettings(settings);
        try {
            await saveCloudSettings(settings);
            setSaved(true);
            setCloud((current) => ({ ...current, error: '' }));
        } catch (error) {
            setCloud((current) => ({ ...current, error: error instanceof Error ? error.message : 'Cloud хадгалалт амжилтгүй.' }));
        }
        void runDecision(settings);
        // Re-analyze the configured team whenever settings are saved (e.g. after
        // entering or changing the Entry ID).
        void runAnalyze(settings);
        void runLeague(settings);
        setTimeout(() => setSaved(false), 1600);
    }

    async function login() {
        setCloud((current) => ({ ...current, loading: true, error: '' }));
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: loginPassword }),
        });
        const result = await response.json();
        if (!response.ok) {
            setCloud((current) => ({ ...current, loading: false, error: result.error || 'Нэвтрэхэд алдаа гарлаа.' }));
            return;
        }
        const profileResponse = await fetch('/api/profile', { cache: 'no-store' });
        const profile = await profileResponse.json();
        const synced = profile.settings
            ? { ...defaultSettings, ...profile.settings }
            : settings;
        if (!profile.settings) await saveCloudSettings(synced);
        setSettings(synced);
        saveSettings(synced);
        setLoginPassword('');
        setCloud({ configured: true, authenticated: true, loading: false, error: '' });
        void runDecision(synced);
    }

    async function logout() {
        await fetch('/api/session', { method: 'DELETE' });
        setCloud((current) => ({ ...current, authenticated: false, error: '' }));
    }

    async function resetProfile() {
        if (!window.confirm('Cloud болон энэ browser дээрх хувийн тохиргоог бүрэн reset хийх үү?')) return;
        if (cloud.authenticated) await fetch('/api/profile', { method: 'DELETE' });
        localStorage.removeItem('fpl-ai-settings');
        clearDecisionCache();
        setSettings(defaultSettings);
        setDecision(null);
        setSaved(false);
    }

    function usePlannedDraft(draft: Any) {
        const plannedSquadIds = (draft.players || []).map((player: ModelPlayer) => player.id);
        const nextSettings = { ...settings, plannedSquadIds };
        setSettings(nextSettings);
        saveSettings(nextSettings);
        void saveCloudSettings(nextSettings).catch(() => {
            setCloud((current) => ({ ...current, error: 'Planned squad cloud-д хадгалагдсангүй.' }));
        });
        setSaved(true);
        setAnalysis({
            mode: 'planned-draft',
            summary: {
                overallRank: 'Pre-season',
                gwRank: '—',
                value: draft.validation?.totalCost || 0,
                bank: Math.max(0, 100 - (draft.validation?.totalCost || 0)).toFixed(1),
            },
            validation: draft.validation,
            trust: draft.trust,
            recommendedLineup: {
                formation: draft.formation,
                startingXI: draft.startingXI,
                bench: draft.bench,
                warnings: draft.trust?.status === 'verified'
                    ? []
                    : ['Pre-season planned squad: Entry API public болох хүртэл энэ хувилбарыг analysis-д ашиглана.'],
            },
            roadmap: boot?.roadmap,
        });
        void runDecision(nextSettings);
    }

    const top = boot?.topPlayers?.slice(0, 6) || [];
    const captain = analysis?.captainShortlist || boot?.captainShortlist || [];
    const transfers = analysis?.transferSuggestions || decision?.transferSuggestions || [];
    const chips = analysis?.chips || boot?.chips || [];
    const topTargets = boot?.topTargets || {};
    const primaryChip = decision?.chips?.[0] || chips[0];
    const captainPick = captain?.[0] || decision?.captain;
    const viceCaptainPick = captain?.[1] || decision?.viceCaptain;
    const latestCalibration = calibrationResults.at(-1);
    const readiness: ModelReadiness | undefined = boot?.readiness
        ? {
              ...boot.readiness,
              calibration: Math.min(100, 10 + calibrationResults.length * 14),
          }
        : undefined;
    const roadmap = analysis?.roadmap || decision?.roadmap || boot?.roadmap;

    return (
        <>
            <Navbar lang={lang} onLang={() => updateSettings({ lang: lang === 'mn' ? 'en' : 'mn' })} />
            <PlayerDetailModal />
            <main id="top" className="dashboard-shell">
                <section className="hero">
                    <div className="hero-panel">
                        <div className="hero-product-line">
                            <span className="eyebrow">⚽ AI Agent</span>
                            <span className="version-badge">AI Brain v2</span>
                            <a className="help-button" href="/docs#player-evaluation" aria-label="AI Brain v2 тайлбар">?</a>
                        </div>
                        <h1>{t.heroTitle}</h1>
                        <p className="lead">Captain, transfer, chip болон хамгийн боломжит багийг нэг дор санал болгоно.</p>
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
                            <div><span>{t.nextDeadline}</span><b className={deadlineUrgent ? 'yellow' : ''} title={deadline}>{countdown ? `⏳ ${countdown}` : deadline}</b></div>
                            <div>
                                <span>Fixture data</span>
                                <b className={(fixtureStatus?.fixtureReady ?? boot?.fixtureReady) ? 'good' : 'yellow'}>
                                    {(fixtureStatus?.fixtureReady ?? boot?.fixtureReady) ? 'Official FPL · Ready' : 'Loading…'}
                                </b>
                            </div>
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

                {dataDegraded ? (
                    <div
                        className="bad"
                        role="alert"
                        style={{ padding: 12, borderRadius: 8, margin: '0 0 12px', border: '1px solid #b9553d' }}
                    >
                        ⚠{' '}
                        {lang === 'mn'
                            ? 'Зарим өгөгдөл дутуу байна (fixtures эсвэл мэдээ). Санал болголтыг баталгаатай гэж бүү үз — хэсэг хугацааны дараа дахин ачаална уу.'
                            : 'Some data is currently unavailable (fixtures or news). Treat recommendations as provisional and refresh shortly.'}
                    </div>
                ) : null}

                <Card id="decision" title={t.thisWeekDecision} subtitle={t.decisionSub} helpHref="/docs#decision">
                    <div className="decision-status-line">
                        <span className={`decision-dot ${loading ? '' : decision?.actionPlan?.decisionStatus === 'ready' ? 'ready' : decisionError ? 'error' : ''}`} />
                        <strong>
                            {loading
                                ? t.loading
                                : decision?.actionPlan
                                  ? decisionStatusLabel(decision.actionPlan.decisionStatus, lang)
                                  : decisionError
                                    ? lang === 'mn' ? 'Дата түр боломжгүй' : 'Data temporarily unavailable'
                                    : lang === 'mn' ? 'Шийдвэр хүлээгдэж байна' : 'Awaiting decision'}
                        </strong>
                        <span>{decision?.actionPlan ? decisionStrategyLabel(decision.strategy, lang) : '—'}</span>
                    </div>

                    <div className="decision-glance-grid">
                        <div className="decision-glance primary">
                            <span>©</span>
                            <small>Captain (Ахлагч)</small>
                            <strong>{decision?.captain?.name || '—'}</strong>
                            <p>{decision?.captain ? `${decision.captain.expectedPoints.toFixed(1)} expected ↑ · ${decision.captain.starterConfidence}% starter` : 'Мэдээлэл хүлээж байна'}</p>
                            <TrustChip trust={captainTrust} />
                        </div>
                        <div className="decision-glance">
                            <span>⇄</span>
                            <small>Transfer (Солилцоо)</small>
                            <strong>{recommendedPlan?.moves?.length ? recommendedPlan.moves.map((m: Any) => `${m.out} → ${m.in}`).join(', ') : decision?.transfer ? `${decision.transfer.out} → ${decision.transfer.in}` : decision ? decisionActionLabel(decision.action, lang) : '—'}</strong>
                            <p>{recommendedPlan ? `${recommendedPlan.label}${recommendedPlan.netGain > 0 ? ` · +${recommendedPlan.netGain} net` : ''}` : decision?.transfer ? `+${decision.transfer.expectedGain} expected gain` : 'No-hit шийдвэр'}</p>
                            <TrustChip trust={transferInTrust} />
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
                            <TrustChip trust={viceTrust} />
                        </div>
                    </div>

                    {loading ? (
                        <p className="decision-summary">{t.loading}</p>
                    ) : decision?.summary ? (
                        <p className="decision-summary">{decisionSummaryLabel(decision.summary, lang)}</p>
                    ) : decisionError ? (
                        <p className="decision-summary decision-summary-error">
                            {lang === 'mn'
                                ? 'FPL өгөгдөл түр татагдсангүй. Дахин оролдоно уу — доорх “Decision гаргах” товчийг дарна уу.'
                                : 'Could not load FPL data just now. Press “Run decision” below to retry.'}
                        </p>
                    ) : null}

                    <div className="decision-footer">
                        <button className="btn" disabled={loading} onClick={() => runDecision()}>
                            {loading ? t.loading : t.runDecision}
                        </button>
                        <button className="btn" type="button" onClick={copyPicks} disabled={!decision}>
                            {copied ? (lang === 'mn' ? 'Хууллаа ✓' : 'Copied ✓') : lang === 'mn' ? 'Copy picks' : 'Copy picks'}
                        </button>
                        <a className="btn" href="https://fantasy.premierleague.com/my-team" target="_blank" rel="noreferrer">
                            {lang === 'mn' ? 'FPL нээх' : 'Open FPL'}
                        </a>
                        <details className="decision-details">
                            <summary>Дэлгэрэнгүй үндэслэл харах</summary>
                            {decision?.actionPlan ? <WeeklyActionPlan plan={decision.actionPlan} lang={lang} /> : null}
                            {decision?.captain ? <DecisionInsight player={decision.captain} lang={lang} /> : null}
                        </details>
                    </div>
                </Card>

                <SeasonRoadmapCard roadmap={roadmap} />

                <MoreSection
                    title="Системийн бэлэн байдал"
                    summary={`Data, дүрэм, risk ба calibration · ${boot?.playerCount ?? '…'} тоглогч`}
                >
                <section className="grid grid-3">
                    <Card title={t.dataFoundation} subtitle={t.dataText} helpHref="/docs#player-evaluation">
                        <div className="engine-status good-engine"><span>✓</span><strong>Official FPL API</strong><small>Үндсэн өгөгдлийн эх сурвалж</small></div>
                        <div className={`engine-status ${boot?.apiFootball?.matchedPlayers ? 'good-engine' : ''}`}>
                            <span>{boot?.apiFootball?.matchedPlayers ? '✓' : '△'}</span>
                            <strong>API-Football</strong>
                            <small>
                                {boot?.apiFootball?.enabled
                                    ? `${boot.apiFootball.identityMatched || 0} ID баталсан · ${boot.apiFootball.identityAmbiguous || 0} ambiguity reject · ${boot.apiFootball.fixturesChecked} lineup/stat · ${boot.apiFootball.friendlyFixturesChecked || 0} friendly · ${boot.apiFootball.internationalFixturesChecked || 0} international (${boot.apiFootball.internationalPlayersMatched || 0} player) · ${boot.apiFootball.oddsFixturesChecked || 0} odds`
                                    : 'Key тохируулаагүй'}
                            </small>
                        </div>
                        <div className={`engine-status ${boot?.newsVerification?.officialClubFeedsChecked ? 'good-engine' : ''}`}>
                            <span>{boot?.newsVerification?.officialClubFeedsChecked ? '✓' : '△'}</span>
                            <strong>Official Club News</strong>
                            <small>
                                {boot?.newsVerification
                                    ? `${boot.newsVerification.officialClubFeedsChecked}/${boot.newsVerification.officialClubFeedsAttempted} клуб feed · ${boot.newsVerification.officialClubCheckedPlayers} тоглогч шалгасан · ${boot.newsVerification.officialClubSignals} official signal`
                                    : 'Verified scan хүлээж байна'}
                            </small>
                        </div>
                        <div className={`engine-status ${boot?.historyVerification?.successfulPlayers ? 'good-engine' : ''}`}>
                            <span>{boot?.historyVerification?.successfulPlayers ? '✓' : '△'}</span>
                            <strong>Recent Minutes</strong>
                            <small>
                                {boot?.historyVerification
                                    ? `${boot.historyVerification.successfulPlayers}/${boot.historyVerification.requestedPlayers} тоглогч · сүүлийн 5 тоглолтын starts/minutes`
                                    : 'Verified scan хүлээж байна'}
                            </small>
                        </div>
                        <div className="engine-facts">
                            <div><span>Players</span><b>{boot?.playerCount ?? '...'}</b></div>
                            <div><span>Teams</span><b>{boot?.teamCount ?? '...'}</b></div>
                            <div><span>Fixtures</span><b>{fixtureStatus?.fixtureCount ?? boot?.fixtureCount ?? '...'}</b></div>
                        </div>
                        <p className="engine-footnote">Player, team, price, fixture болон status мэдээлэл 15 минутын cache ашиглана.</p>
                    </Card>
                    <Card title={t.ruleEngine} subtitle={t.ruleText} helpHref="/docs#drafts">
                        <div className="rule-checklist">
                            <div><span>✓</span><p><b>£100.0m</b><small>Нийт төсвийн хязгаар</small></p></div>
                            <div><span>✓</span><p><b>£0.5m buffer</b><small>GW1 upgrade flexibility</small></p></div>
                            <div><span>✓</span><p><b>15 players</b><small>2 GKP · 5 DEF · 5 MID · 3 FWD</small></p></div>
                            <div><span>✓</span><p><b>Max 3</b><small>Нэг клубээс авах дээд тоо</small></p></div>
                            <div><span>✓</span><p><b>Valid XI</b><small>Зөв formation ба найдвартай гараа</small></p></div>
                            <div><span>✓</span><p><b>Max 5 FT</b><small>Ашиггүй үед transfer хадгална</small></p></div>
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

                <Card
                    title="Model Readiness & Calibration (загварын бэлэн байдал)"
                    subtitle="Таамгаар 80% гэж бичихгүй. Data coverage болон дууссан Gameweek-ийн бодит үр дүнгээр хэмжинэ."
                    helpHref="/docs#status"
                >
                    <div className="readiness-grid">
                        {readiness
                            ? ([
                                  ['FPL rules', readiness.rules, 'Төсөв, байрлал, клубийн хязгаар'],
                                  ['Squad optimizer', readiness.squadOptimization, '15 тоглогч, formation, bench'],
                                  ['Official data', readiness.officialData, 'Official FPL API coverage'],
                                  ['Position models', readiness.positionModels, 'GKP/DEF/MID/FWD тусгай үнэлгээ'],
                                  ['Starter & minutes', readiness.starterMinutes, 'Live гараа, минут нэмэгдэхэд өснө'],
                                  ['Injury & availability', readiness.injuryAvailability, 'Official warning ба шинэ мэдээ'],
                                  ['Transfer news', readiness.transferNews, 'Олон trusted эх сурвалжаар батлагдахад өснө'],
                                  ['Friendly & international', readiness.friendlyInternational, 'Structured минут/lineup дутуу'],
                                  ['Multi-source verification', readiness.multiSourceVerification, 'Official + reliable давхар баталгаа'],
                                  ['Prediction calibration', readiness.calibration, 'Gameweek дуусах бүр forecast-оор хэмжинэ'],
                                  ['Multi-GW planning', readiness.multiGameweekPlanning, 'Next 1/3/5/8 GW ба blank/double'],
                              ] as Array<[string, number, string]>).map(([label, score, note]) => (
                                  <div className="readiness-row" key={label} title={note}>
                                      <span>{label}<small>{note}</small></span>
                                      <div><i style={{ width: `${score}%` }} /></div>
                                      <b className={score >= 80 ? 'good' : score >= 60 ? 'yellow' : 'bad'}>
                                          {score}%
                                      </b>
                                  </div>
                              ))
                            : <div className="skeleton" />}
                    </div>
                    {readiness?.sources?.length ? (
                        <details className="readiness-sources">
                            <summary>
                                Эх сурвалжийн бодит coverage · {readiness.sources.filter((source) => source.status === 'available').length}/{readiness.sources.length} бүрэн
                            </summary>
                            <div className="readiness-source-list">
                                {readiness.sources.map((source) => (
                                    <span key={source.id} className={`source-${source.status}`}>
                                        {source.status === 'available' ? '✓' : source.status === 'partial' ? '△' : '✗'} {source.label} · {source.coverage}%
                                    </span>
                                ))}
                            </div>
                        </details>
                    ) : null}
                    <div className="calibration-summary">
                        <strong>
                            {latestCalibration
                                ? `GW${latestCalibration.eventId}: MAE ${latestCalibration.mae} · ±2 оноонд ${latestCalibration.withinTwo}%`
                                : 'Calibration эхлэхэд live Gameweek-ийн нэг бүтэн forecast шаардлагатай.'}
                        </strong>
                        <span>
                            {calibrationResults.length
                                ? `${calibrationResults.length} Gameweek хэмжсэн · Bias ${latestCalibration?.bias ?? 0}`
                                : 'Таамгийг deadline-аас өмнө хадгалаад, Gameweek дууссаны дараа бодит оноотой автоматаар харьцуулна.'}
                        </span>
                    </div>
                </Card>

                <RiskMonitor items={boot?.riskMonitor || []} />
                </MoreSection>

                <MoreSection id="settings" title={t.settings} summary={settings.entryId ? `Entry ${settings.entryId} холбогдсон` : 'Entry ID, League ID, хэл болон strategy'}>
                <Card title={t.settings} subtitle={t.optionalIds} helpHref="/docs#start">
                    <div className={`cloud-sync-card ${cloud.authenticated ? 'cloud-connected' : ''}`}>
                        <div>
                            <strong>Cloud sync</strong>
                            <span>
                                {cloud.loading
                                    ? 'Төлөв шалгаж байна…'
                                    : cloud.authenticated
                                      ? '✓ Нэвтэрсэн · settings болон planned squad бүх browser дээр ижил'
                                      : cloud.configured
                                        ? 'Өөрийн нууц үгээр нэвтэрч төхөөрөмжүүдээ холбоно.'
                                        : 'Cloud storage-ийн environment variables тохируулаагүй.'}
                            </span>
                        </div>
                        {cloud.configured && !cloud.authenticated ? (
                            <div className="cloud-login">
                                <input
                                    type="password"
                                    value={loginPassword}
                                    placeholder="Нууц үг"
                                    onChange={(event) => setLoginPassword(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') void login(); }}
                                />
                                <button className="btn" type="button" disabled={cloud.loading || !loginPassword} onClick={() => void login()}>
                                    Нэвтрэх
                                </button>
                            </div>
                        ) : null}
                        {cloud.authenticated ? (
                            <div className="cloud-actions">
                                <button className="ghost" type="button" onClick={() => void logout()}>Гарах</button>
                                <button className="ghost danger" type="button" onClick={() => void resetProfile()}>Reset</button>
                            </div>
                        ) : null}
                    </div>
                    {cloud.error ? <p className="bad">{cloud.error}</p> : null}
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
                        <label className="field">
                            <span>Хадгалсан free transfer (0–5)</span>
                            <input
                                type="number"
                                min={0}
                                max={5}
                                value={settings.freeTransfers ?? 1}
                                onChange={(e) => updateSettings({
                                    freeTransfers: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                                })}
                            />
                            <small>Public Entry API энэ тоог өгдөггүй тул FPL-ээсээ шалгаж шинэчилнэ.</small>
                        </label>
                        <div className="field">
                            <span>&nbsp;</span>
                            <button className="btn" onClick={persist}>
                                {saved ? t.saved : t.save}
                            </button>
                        </div>
                    </div>
                </Card>
                </MoreSection>

                <section id="team" className="grid grid-2">
                    <Card title={t.navTeam} subtitle={t.liveTeamSub} helpHref="/docs#team">
                        <div className="team-actions">
                            <button className="btn" disabled={loading} onClick={() => runAnalyze()}>
                                {loading ? t.loading : t.runTeamAnalysis}
                            </button>
                            <button
                                className="btn btn-telegram"
                                type="button"
                                disabled={notify.loading}
                                onClick={sendLatestNews}
                                title="Хамгийн сүүлийн мэдээг Telegram руу илгээх (өмнөхийг давтаж, шинийг нэмж шалгана)"
                            >
                                {notify.loading ? 'Илгээж байна…' : '📲 Сүүлийн мэдээ авах'}
                            </button>
                        </div>
                        {notify.message ? (
                            <p className={`notify-status ${notify.ok === false ? 'bad' : notify.ok ? 'good' : ''}`}>{notify.message}</p>
                        ) : null}

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

                        {decision?.entryAvailability ? (
                            <div className="notice" style={{ marginTop: 14 }}>
                                <b>Entry ID төлөв:</b> {decision.entryAvailability}
                            </div>
                        ) : null}

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
                                    {captainPick.fixture ? <span>Next 5 avg ↓ <b>{captainPick.fixture.averageDifficulty}</b></span> : null}
                                </div>
                                {captainPick.fixture?.fixtures?.length ? (
                                    <div className="position-fixture-run captain-fixture-run">
                                        {captainPick.fixture.fixtures.slice(0, 5).map((fixture: any, index: number) => (
                                            <span className={`fdr fdr-${Math.round(fixture.difficulty)}`} key={`${fixture.event}-${fixture.opponent}-${index}`}>
                                                {fixture.opponentName} {fixture.isHome ? 'H' : 'A'} · {fixture.difficulty}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
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

                <MoreSection id="league" title={t.leagueIntelligence} summary="Rank gap, өрсөлдөгчид болон mini-league strategy">
                <Card title={t.leagueIntelligence} subtitle={t.leagueSub} helpHref="/docs#league">
                    <button className="btn secondary" disabled={loading} onClick={() => runLeague()}>
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
                </MoreSection>

                <MoreSection title="Player shortlist" summary="Top Targets болон байрлал тус бүрийн шилдэг сонголтууд">
                <section className="target-sections">
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
                                    <TargetRow player={player} rank={index + 1} key={player.id} />
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
                </MoreSection>

                <Card id="drafts" title={t.draftTeams} subtitle="Хувилбаруудыг зэрэгцүүлэн харьцуулж, доор дэлгэрэнгүйг нь нээнэ" helpHref="/docs#drafts">
                    {boot?.verificationPending ? (
                        <div className="notice" style={{ marginBottom: 14 }}>
                            Best draft түрүүлж гарлаа. Бусад хувилбар болон news/API-Football баталгаажуулалт ард шинэчлэгдэж байна.
                        </div>
                    ) : null}
                    {boot?.drafts?.length ? (
                        <>
                            <DraftCompareTable drafts={boot.drafts} lang={lang} />
                            {boot.drafts.map((d: Any) => <DraftCard draft={d} key={d.mode} lang={lang} onUse={usePlannedDraft} />)}
                        </>
                    ) : (
                        <div className="skeleton" />
                    )}
                </Card>
            </main>
        </>
    );
}

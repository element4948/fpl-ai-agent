'use client';

import { Card } from '@/components/Card';
import { Metric } from '@/components/Metric';
import { Navbar } from '@/components/Navbar';
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
                </div>
                <div className="row-meta">
                    {p.team} · {p.position} · £{p.price}m · Starter confidence (гарааны магадлал) {p.starterConfidence}% · Predicted minutes
                    (таамаг минут) {p.predictedMinutes} · {t.confidence} {p.confidence}
                </div>
                {p.fixture ? (
                    <div className="row-meta fixture-meta">
                        Fixture (тоглолт): {p.fixture.nextOpponent} · {p.fixture.nextIsHome ? 'H (талбайдаа)' : 'A (айлд)'} · FDR{' '}
                        {p.fixture.nextDifficulty}/5 (1 хялбар, 5 хүнд) · Next 5 average (дараагийн 5-ын дундаж) {p.fixture.averageDifficulty}/5
                    </div>
                ) : null}
                <div className="bar">
                    <span style={{ ['--w' as string]: `${width}%` }} />
                </div>
            </div>
            <div className="score">{p.expectedPoints.toFixed(1)}</div>
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

function DraftCard({ draft, lang }: { draft: Any; lang: 'mn' | 'en' }) {
    const t = dict[lang];

    const totalCost = draft.validation?.totalCost || 0;

    const remainingBudget = Number(Math.max(0, 100 - totalCost).toFixed(1));

    const playerCount = draft.players?.length || 0;

    return (
        <Card>
            <div className="section-heading">
                <div>
                    <h3>{draftModeLabel(draft.mode, lang)}</h3>

                    <p>
                        £{totalCost.toFixed(1)}m used
                        {' · '}£{remainingBudget.toFixed(1)}m remaining
                        {' · '}
                        {playerCount}/15 players
                    </p>
                </div>

                <span className={draft.validation.valid ? 'status good-tab' : 'status warning-tab'}>
                    {draft.validation.valid ? t.allGood : t.check}
                </span>
            </div>

            {!draft.validation.valid && draft.validation.errors?.length ? (
                <div className="warning-box">
                    {draft.validation.errors.map((error: string) => (
                        <div key={error}>• {error}</div>
                    ))}
                </div>
            ) : null}

            <div className="draft-explanation">
                {draft.explanation?.map((item: string) => (
                    <div key={item}>✓ {item}</div>
                ))}
            </div>
            <div className="notice" style={{ marginBottom: 12 }}>
                <strong>Formation (Гарааны байрлал): {draft.formation || '—'}</strong>

                <div style={{ marginTop: 6 }}>Starting XI (Гарааны 11): {draft.startingXI?.length || 0}/11</div>
                <div style={{ marginTop: 6 }}>
                    FDR (тоглолтын хүндрэлийн үнэлгээ): 1 = хамгийн хялбар, 5 = хамгийн хүнд. Next 5 average (дараагийн 5-ын
                    дундаж) бага байх тусам хуваарь илүү таатай.
                </div>
            </div>

            <h4>Starting XI (Гарааны 11)</h4>

            <div className="draft-list">
                {draft.startingXI?.map((player: ModelPlayer) => (
                    <div className="draft-player" key={player.id}>
                        <strong>{player.name}</strong>

                        <span>
                            {player.position}
                            {' · '}
                            {player.team}
                            {' · '}£{player.price.toFixed(1)}m{' · '}
                            Starter confidence (гарааны магадлал) {player.starterConfidence}% · Predicted minutes (таамаг минут){' '}
                            {player.predictedMinutes} · Risk (эрсдэл) {player.risk}%
                        </span>

                        {player.fixture ? (
                            <small>
                                Next: {player.fixture.nextOpponent}
                                {' · '}
                                {player.fixture.nextIsHome ? 'H' : 'A'}
                                {' · '}
                                FDR {player.fixture.nextDifficulty}/5
                                {' · '}
                                Next 5 average {player.fixture.averageDifficulty}/5
                            </small>
                        ) : null}
                    </div>
                ))}
            </div>

            <h4 style={{ marginTop: 18 }}>Bench (Сэлгээ)</h4>

            <div className="draft-list">
                {draft.bench?.map((player: ModelPlayer, index: number) => (
                    <div className="draft-player" key={player.id}>
                        <strong>
                            {index + 1}. {player.name}
                        </strong>

                        <span>
                            {player.position}
                            {' · '}
                            {player.team}
                            {' · '}£{player.price.toFixed(1)}m{' · '}
                            Starter confidence (гарааны магадлал) {player.starterConfidence}% · Predicted minutes (таамаг минут){' '}
                            {player.predictedMinutes} · Risk (эрсдэл) {player.risk}%
                        </span>
                    </div>
                ))}
            </div>
        </Card>
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

    return (
        <>
            <Navbar lang={lang} onLang={() => updateSettings({ lang: lang === 'mn' ? 'en' : 'mn' })} />
            <main id="top">
                <section className="hero">
                    <div className="hero-panel">
                        <span className="eyebrow">⚽ AI Agent · AI Brain v2 (Starter + Formation Intelligence)</span>
                        <h1>{t.heroTitle}</h1>
                        <p className="lead">{t.heroLead}</p>
                        <div className="actions">
                            <a className="button-link" href="#drafts">
                                {t.navDrafts}
                            </a>
                            <a className="button-link secondary" href="#settings">
                                {t.navSettings}
                            </a>
                        </div>
                        <div className="pill-row">
                            <span className="pill">{t.noHitDefault}</span>
                            <span className="pill">{t.budgetGuard}</span>
                            <span className="pill">{t.riskScore}</span>
                            <span className="pill">{t.chipHoldLogic}</span>
                        </div>
                    </div>
                    <Card title={t.seasonStatus} subtitle={t.optionalIds}>
                        <div className="grid grid-2">
                            <Metric label={t.mode} value={statusTitle} tone={isPreSeason ? '' : 'good'} />
                            <Metric label={t.nextDeadline} value={deadline} />
                        </div>
                        {!settings.entryId && (
                            <div className="notice" style={{ marginTop: 14 }}>
                                {t.noId} {t.addLater}
                            </div>
                        )}
                        {boot?.error ? <p className="bad">{boot.error}</p> : null}
                    </Card>
                </section>

                <Card title={t.thisWeekDecision} subtitle={t.decisionSub}>
                    <div className="grid grid-4">
                        <Metric label={t.strategy} value={decision ? decisionStrategyLabel(decision.strategy, lang) : '...'} tone="good" />
                        <Metric label={t.mode} value={decision ? decisionActionLabel(decision.action, lang) : '...'} />
                        <Metric label={t.recommendedCaptain} value={decision?.captain?.name || '—'} />
                        <Metric label={t.recommendedViceCaptain} value={decision?.viceCaptain?.name || '—'} />
                    </div>
                    <div className="grid grid-2" style={{ marginTop: 12 }}>
                        <Metric
                            label={t.decisionStatus}
                            value={decision?.actionPlan ? decisionStatusLabel(decision.actionPlan.decisionStatus, lang) : '—'}
                            tone={decision?.actionPlan?.decisionStatus === 'ready' ? 'good' : ''}
                        />
                        <Metric
                            label={t.recommendedChip}
                            value={decision?.chips?.[0]?.chip ? `${decision.chips[0].chip}: ${chipAction(decision.chips[0].action, lang)}` : '—'}
                        />
                    </div>
                    <p className="muted" style={{ marginTop: 14 }}>
                        {decision ? decisionSummaryLabel(decision.summary, lang) : t.loading}
                    </p>
                    {decision?.actionPlan ? <WeeklyActionPlan plan={decision.actionPlan} lang={lang} /> : null}
                    {decision?.captain ? <DecisionInsight player={decision.captain} lang={lang} /> : null}
                    {decision?.transfer ? (
                        <div className="transfer-card" style={{ marginTop: 14 }}>
                            <div className="row-title">
                                {t.recommendedTransfer}: {decision.transfer.out} → {decision.transfer.in}
                            </div>
                            <div className="row-meta">
                                {t.expected}: +{decision.transfer.expectedGain} · {t.cost}: {decision.transfer.costChange}m · {t.hit}:{' '}
                                {decision.transfer.hitCost}
                            </div>
                            <div className="tabs" style={{ marginTop: 10 }}>
                                {decision.transfer.reasons.map((r: string) => (
                                    <span className="tab" key={r}>
                                        {transferReason(r, lang)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div className="actions" style={{ marginTop: 16 }}>
                        <button className="btn" disabled={loading} onClick={runDecision}>
                            {loading ? t.loading : t.runDecision}
                        </button>
                    </div>
                </Card>

                <section className="grid grid-3">
                    <Card title={t.dataFoundation} subtitle={t.dataText}>
                        <Metric label={t.playersLoaded} value={boot?.playerCount ?? '...'} />
                        <p className="muted">{t.officialApi}</p>
                    </Card>
                    <Card title={t.ruleEngine} subtitle={t.ruleText}>
                        <Metric label={t.budget} value="£100.0m" />
                        <Metric label={t.clubLimit} value="Max 3" />
                    </Card>
                    <Card title={t.riskEngine} subtitle={t.riskText}>
                        <Metric label={t.output} value={`${t.confidence} + ${t.risk}`} tone="good" />
                    </Card>
                </section>

                <Card id="settings" title={t.settings} subtitle={t.optionalIds}>
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
                    <Card title={t.navTeam} subtitle={t.liveTeamSub}>
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
                    <Card title={t.captainModel} subtitle={t.captainSub}>
                        {captain?.length ? (
                            captain.slice(0, 6).map((p: Any, i: number) => <PlayerRow key={p.id} p={p} index={i + 1} lang={lang} />)
                        ) : (
                            <p className="muted">{t.noData}</p>
                        )}
                    </Card>
                </section>

                <section className="grid grid-2">
                    <Card title={t.transferEngine} subtitle={t.transferSub}>
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
                    <Card title={t.chipPlanner} subtitle={t.chipSub}>
                        <div className="grid grid-2">
                            {chips.map((c: Any) => (
                                <div className="chip-card" key={c.chip}>
                                    <span className="badge green">{chipAction(c.action, lang)}</span>
                                    <h3>{c.chip}</h3>
                                    <p className="muted">{chipReason(c.chip, isPreSeason, lang)}</p>
                                    <Metric label={t.confidence} value={`${c.confidence}%`} />
                                </div>
                            ))}
                        </div>
                    </Card>
                </section>

                <Card id="league" title={t.leagueIntelligence} subtitle={t.leagueSub}>
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
                    <Card title={t.topTargets} subtitle={t.topTargetsSub}>
                        {top.length ? (
                            top.map((p: ModelPlayer, i: number) => <PlayerRow p={p} index={i + 1} key={p.id} lang={lang} />)
                        ) : (
                            <div className="skeleton" />
                        )}
                    </Card>
                    <Card title={t.positionTargets} subtitle={t.positionTargetsSub}>
                        <div className="split">
                            {['GKP', 'DEF', 'MID', 'FWD'].map((pos) => (
                                <div key={pos}>
                                    <h3>{pos}</h3>
                                    {(topTargets[pos] || []).slice(0, 4).map((p: ModelPlayer) => (
                                        <div className="player-chip" key={p.id} style={{ marginBottom: 8 }}>
                                            <b>{p.name}</b>
                                            <div className="row-meta">
                                                {p.team} · £{p.price}m · {t.risk} {p.risk}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </Card>
                </section>

                <Card title={t.draftTeams} subtitle={t.draftTeamsSub}>
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

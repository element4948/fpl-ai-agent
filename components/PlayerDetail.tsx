'use client';

import { useEffect, useState } from 'react';
import type { ModelPlayer } from '@/types/fpl';
import { CalibrationBadge, DataQualityBadge, FixtureTrendBadge } from '@/components/PlayerBadges';

type Any = any;

function openPlayerDetail(playerId: number) {
    window.dispatchEvent(new CustomEvent('open-player-detail', { detail: playerId }));
}

export function PlayerDetailButton({ playerId }: { playerId: number }) {
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

export function PlayerDetailModal() {
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

                        <div className="player-underlying-grid">
                            <div><small>xG</small><strong>{player.expectedGoals.toFixed(2)}</strong></div>
                            <div><small>xA</small><strong>{player.expectedAssists.toFixed(2)}</strong></div>
                            <div><small>xGI</small><strong>{player.expectedGoalInvolvements.toFixed(2)}</strong></div>
                            <div><small>ICT</small><strong>{player.ictIndex.toFixed(1)}</strong></div>
                            <div><small>Evidence coverage</small><strong>{player.evidence?.coverageScore || 0}%</strong></div>
                        </div>

                        <div className="player-detail-quality">
                            <DataQualityBadge quality={recent.dataQuality} />
                            <CalibrationBadge player={player} />
                            <span>Сүүлийн {recent.sampleSize} тоглолтын бодит мэдээлэлд тулгуурлав.</span>
                        </div>
                        {player.calibration ? (
                            <div className="notice calibration-explanation">
                                {player.position} байрлалын {player.calibration.sampleSize} бодит үр дүн, {player.calibration.events} дууссан Gameweek дээр
                                хэмжсэн correction Expected Points-ийг {player.calibration.beforeExpectedPoints.toFixed(2)}-оос {player.expectedPoints.toFixed(2)} болгож
                                ({player.calibration.expectedPointsDelta >= 0 ? '+' : ''}{player.calibration.expectedPointsDelta.toFixed(2)} xP) өөрчилсөн. Энэ нь тоглогчийг гараанд гарна гэж
                                батлахгүй; starter, minutes, injury болон fixture шалгуур тусдаа хэвээр.
                            </div>
                        ) : null}
                        {player.evidence?.missingMetrics?.length ? (
                            <div className="evidence-missing">
                                <b>Одоогоор дутуу:</b> {player.evidence.missingMetrics.join(', ')}
                            </div>
                        ) : null}

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
                            <FixtureTrendBadge fixture={player.fixture} />
                            <p>FDR бага байх тусам хялбар. Expected points, Starter confidence өндөр байх тусам сайн.</p>
                        </div>
                    </>
                ) : null}
            </section>
        </div>
    );
}

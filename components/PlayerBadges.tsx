import type { ModelPlayer } from '@/types/fpl';

export function DataQualityBadge({ quality }: { quality: ModelPlayer['dataQuality'] }) {
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

export function DataFreshnessBadge({ player }: { player: ModelPlayer }) {
    const freshness = player.dataFreshness;
    if (!freshness) return null;
    const labels = {
        fresh: 'Fresh',
        aging: 'Aging',
        stale: 'Stale',
        missing: 'Missing',
    } as const;
    const sourceSummary = freshness.sources
        .map((source) => `${source.label}: ${labels[source.status]}${source.ageHours == null ? '' : ` (${source.ageHours}h)`}`)
        .join(' · ');
    const warning = freshness.stalePositiveEvidence
        ? ' · Хуучирсан first-choice мэдээлэл starter баталгаа болон Draft boost-д ашиглагдаагүй.'
        : '';
    return (
        <span
            className={`data-quality data-quality-${freshness.status === 'fresh' ? 'good' : freshness.status === 'aging' ? 'limited' : 'unknown'}`}
            title={`${freshness.score}/100 freshness · ${sourceSummary}${warning}`}
        >
            {labels[freshness.status]} {freshness.score}%
        </span>
    );
}

export function FixtureTrendBadge({ fixture }: { fixture?: ModelPlayer['fixture'] }) {
    if (!fixture || fixture.trend === 'unknown') return null;
    const label =
        fixture.trend === 'improving'
            ? '↗ Хуваарь хялбаршиж байна'
            : fixture.trend === 'hardening'
              ? '↘ Хуваарь хүндэрч байна'
              : '→ Хуваарь тогтвортой';
    return <span className={`fixture-trend fixture-trend-${fixture.trend}`}>{label}</span>;
}

export function CalibrationBadge({ player, compact = false }: { player: ModelPlayer; compact?: boolean }) {
    const calibration = player.calibration;
    if (!calibration || calibration.multiplier === 1) return null;
    const direction = calibration.multiplier > 1 ? '↑' : '↓';
    const title = [
        `${player.position} байрлалын дууссан Gameweek-ийн calibration`,
        `${calibration.events} Gameweek`,
        `${calibration.sampleSize} тоглогчийн үр дүн`,
        `${calibration.beforeExpectedPoints.toFixed(2)} xP → ${player.expectedPoints.toFixed(2)} xP (${calibration.expectedPointsDelta >= 0 ? '+' : ''}${calibration.expectedPointsDelta.toFixed(2)})`,
        `Нийт тоглогчдын xP rank #${calibration.beforeOverallRank} → #${calibration.afterOverallRank}/${calibration.rankingPoolSize}`,
        calibration.estimatedRange ? `Estimated multiplier range ${calibration.estimatedRange.low.toFixed(3)}–${calibration.estimatedRange.high.toFixed(3)}` : 'Uncertainty range цугларч байна',
        `Expected Points-д ×${calibration.multiplier.toFixed(3)} correction хэрэглэсэн`,
    ].join(' · ');
    return (
        <span className="calibration-badge" title={title}>
            {compact ? 'CAL' : `${calibration.beforeExpectedPoints.toFixed(1)}→${player.expectedPoints.toFixed(1)} xP`} · rank #{calibration.beforeOverallRank}→#{calibration.afterOverallRank} · ×{calibration.multiplier.toFixed(3)} {direction}
        </span>
    );
}

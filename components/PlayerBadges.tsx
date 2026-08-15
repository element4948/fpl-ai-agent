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
        `Expected Points-д ×${calibration.multiplier.toFixed(3)} correction хэрэглэсэн`,
    ].join(' · ');
    return (
        <span className="calibration-badge" title={title}>
            {compact ? 'CAL' : `${player.position} calibration`} ×{calibration.multiplier.toFixed(3)} {direction}
        </span>
    );
}

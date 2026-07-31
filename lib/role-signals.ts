import type {
  FplPlayer,
  PlayerRoleAssessment,
  StarterLabel,
} from '@/types/fpl';
import type { StarterProjection } from '@/lib/starter';

type VerifiedRoleSignal = PlayerRoleAssessment & {
  playerName: string;
  maximumStarterConfidence?: number;
  maximumPredictedMinutes?: number;
  starterLabel?: StarterLabel;
};

/*
 * Official FPL exposes last season's minutes but not whether those minutes
 * belong to the player's current club. Dated official role claims live here
 * so a transfer cannot be mistaken for current-club starter evidence.
 */
const VERIFIED_ROLE_SIGNALS: VerifiedRoleSignal[] = [
  {
    playerName: 'Dubravka',
    role: 'backup',
    confidence: 90,
    note:
      'Өнгөрсөн улирлын 35 гараа Burnley-д байсан. Spurs-д шинээр ирсэн бөгөөд клубийн хамгийн сүүлийн тодорхой мэдээлэл Vicario-г number one гэж нэрлэсэн тул тэр минутыg Spurs-ийн гарааны баталгаа гэж ашиглахгүй.',
    sourceLabel: 'Tottenham Hotspur — goalkeeper team news',
    sourceUrl:
      'https://www.tottenhamhotspur.com/news/1069202/team-news-vicario-available-again-roberto-to-decide-who-starts-in-goal',
    checkedAt: '2026-07-30',
    maximumStarterConfidence: 28,
    maximumPredictedMinutes: 22,
    starterLabel: 'bench',
  },
];

export function applyVerifiedRoleSignal(
  player: Pick<FplPlayer, 'web_name'>,
  projection: StarterProjection,
): {
  projection: StarterProjection;
  assessment?: PlayerRoleAssessment;
} {
  const signal = VERIFIED_ROLE_SIGNALS.find(
    (item) =>
      item.playerName.toLocaleLowerCase() ===
      player.web_name.toLocaleLowerCase(),
  );

  if (!signal) return { projection };

  return {
    projection: {
      ...projection,
      confidence:
        signal.maximumStarterConfidence == null
          ? projection.confidence
          : Math.min(projection.confidence, signal.maximumStarterConfidence),
      predictedMinutes:
        signal.maximumPredictedMinutes == null
          ? projection.predictedMinutes
          : Math.min(projection.predictedMinutes, signal.maximumPredictedMinutes),
      label: signal.starterLabel || projection.label,
      dataQuality: 'limited',
    },
    assessment: {
      role: signal.role,
      confidence: signal.confidence,
      note: signal.note,
      sourceLabel: signal.sourceLabel,
      sourceUrl: signal.sourceUrl,
      checkedAt: signal.checkedAt,
    },
  };
}

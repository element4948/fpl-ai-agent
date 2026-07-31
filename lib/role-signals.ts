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
    playerName: 'Vicario',
    role: 'competition',
    confidence: 92,
    note:
      'Spurs-ийн 2026-07-25-ны мэдээгээр бэртэлтэй, pre-season tour-д яваагүй. Мөн олон эх сурвалж transfer яриа идэвхтэй гэж мэдээлсэн тул GW1-ийн баталгаатай гараа гэж үзэхгүй.',
    sourceLabel: 'Tottenham Hotspur — 25 Jul 2026 team news',
    sourceUrl:
      'https://www.tottenhamhotspur.com/news/1079669/team-news-robertos-latest-on-deki-kudus-and-vicario-from-new-zealand',
    checkedAt: '2026-07-31',
    expiresAt: '2026-08-08',
    corroboratingSources: [
      {
        label: 'Football Insider — club-to-club talks reported 28 Jul 2026',
        url:
          'https://www.footballinsider247.com/tottenham-hotspur/transfers/sources-guglielmo-vicario-in-talks-to-join-new-club-after-tottenham-green-light',
        tier: 'secondary',
      },
      {
        label: 'Fabrizio Romano report relayed 23 Jul 2026',
        url:
          'https://readtottenham.com/2026/07/23/fabrizio-romano-confirms-vicario-will-leave-tottenham-inter-juventus/',
        tier: 'reliable-reporter',
      },
    ],
    maximumStarterConfidence: 35,
    maximumPredictedMinutes: 35,
    starterLabel: 'rotation',
  },
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

  if (signal.expiresAt && Date.now() > Date.parse(`${signal.expiresAt}T23:59:59Z`)) {
    return { projection };
  }

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
      expiresAt: signal.expiresAt,
      corroboratingSources: signal.corroboratingSources,
    },
  };
}

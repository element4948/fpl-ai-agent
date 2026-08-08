import type { SeasonRoadmap } from '@/types/fpl';

export function chipPlanner({
  hasEntry,
  isPreSeason,
  gap = 0,
  roadmap,
}: {
  hasEntry: boolean;
  isPreSeason: boolean;
  gap?: number;
  roadmap?: SeasonRoadmap;
}) {
  if (isPreSeason) {
    return [
      { chip: 'Wildcard', action: 'Hold', confidence: 95, reason: '2026/27 has two chip sets. Preserve the first-half Wildcard until squad weakness and fixture swings are clear; the first set expires before GW19.' },
      { chip: 'Triple Captain', action: 'Hold', confidence: 98, reason: 'Do not plan TC before confirmed fixtures and captain candidates.' },
      { chip: 'Bench Boost', action: 'Hold', confidence: 96, reason: 'Needs bench value and fixture density.' },
      { chip: 'Free Hit', action: 'Hold', confidence: 99, reason: 'Free Hit cannot be used in GW1. Save the first-half chip for a confirmed blank or disruption before its GW19 expiry.' },
    ];
  }
  const weeks = roadmap?.weeks ?? [];
  const blankWeek = weeks.find((week) => week.blankPlayers >= 4);

  // Triple Captain EV = the extra 1x on top of the normal 2x, i.e. the captain's
  // projected points that week. Pick the peak week.
  const tcWeek = weeks.reduce<(typeof weeks)[number] | null>((best, week) => {
    const ev = week.captain?.projectedPoints ?? 0;
    return ev > (best?.captain?.projectedPoints ?? 0) ? week : best;
  }, null);
  const tcEv = tcWeek?.captain?.projectedPoints ?? 0;

  // Bench Boost EV = bench points that week (they normally score nothing).
  const bbWeek = weeks.reduce<(typeof weeks)[number] | null>((best, week) => {
    return week.benchProjectedPoints > (best?.benchProjectedPoints ?? -1) ? week : best;
  }, null);
  const bbEv = bbWeek?.benchProjectedPoints ?? 0;

  const round = (value: number) => Number(value.toFixed(1));

  return [
    { chip: 'Wildcard', action: gap > 80 ? 'Consider later' : 'Hold', confidence: hasEntry ? 72 : 50, reason: 'Needs squad weakness, fixture swing, and league gap confirmation.' },
    {
      chip: 'Triple Captain',
      ev: round(tcEv),
      action: tcWeek?.captain && tcEv >= 8 ? `Target GW${tcWeek.eventId}` : tcWeek?.captain ? `Monitor GW${tcWeek.eventId}` : 'Hold',
      confidence: tcEv >= 10 ? 80 : tcEv >= 8 ? 68 : 82,
      reason: tcWeek?.captain
        ? `Peak in GW${tcWeek.eventId}: ${tcWeek.captain.name} projects ${round(tcEv)} pts → ~+${round(tcEv)} extra from Triple Captain. Confirm minutes/opponent first.`
        : 'Wait for an elite captain in a strong or double fixture.',
    },
    {
      chip: 'Bench Boost',
      ev: round(bbEv),
      action: bbWeek && bbEv >= 15 ? `Target GW${bbWeek.eventId}` : bbWeek && bbEv >= 10 ? `Monitor GW${bbWeek.eventId}` : 'Hold',
      confidence: bbEv >= 20 ? 80 : bbEv >= 15 ? 68 : 72,
      reason: bbWeek
        ? `Best bench in GW${bbWeek.eventId} projects ${round(bbEv)} pts (${bbWeek.doublePlayers} double-GW players). Bench Boost adds roughly that many points.`
        : 'Use only when the bench has strong fixtures and minutes.',
    },
    {
      chip: 'Free Hit',
      action: blankWeek ? `Monitor GW${blankWeek.eventId}` : 'Hold',
      confidence: blankWeek ? 72 : 88,
      reason: blankWeek ? `${blankWeek.blankPlayers} current squad players blank in GW${blankWeek.eventId}.` : 'Save for a blank gameweek or emergency.',
    },
  ];
}

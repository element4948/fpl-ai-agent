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
  const blankWeek = roadmap?.weeks.find((week) => week.blankPlayers >= 4);
  const doubleWeek = roadmap?.weeks.find((week) => week.doublePlayers >= 6);
  return [
    { chip: 'Wildcard', action: gap > 80 ? 'Consider later' : 'Hold', confidence: hasEntry ? 72 : 50, reason: 'Needs squad weakness, fixture swing, and league gap confirmation.' },
    { chip: 'Triple Captain', action: doubleWeek?.captain ? `Monitor GW${doubleWeek.eventId}` : 'Hold', confidence: doubleWeek ? 68 : 82, reason: doubleWeek ? `${doubleWeek.captain?.name || 'Captain'} has a Double Gameweek; confirm minutes and opponents before use.` : 'Wait for elite captain + strong fixture or double fixture context.' },
    { chip: 'Bench Boost', action: doubleWeek ? `Monitor GW${doubleWeek.eventId}` : 'Hold', confidence: doubleWeek ? 65 : 75, reason: doubleWeek ? `${doubleWeek.doublePlayers} squad players currently have two fixtures.` : 'Use only when bench has strong fixtures and minutes.' },
    { chip: 'Free Hit', action: blankWeek ? `Monitor GW${blankWeek.eventId}` : 'Hold', confidence: blankWeek ? 72 : 88, reason: blankWeek ? `${blankWeek.blankPlayers} current squad players blank in GW${blankWeek.eventId}.` : 'Save for blank gameweek or emergency.' },
  ];
}

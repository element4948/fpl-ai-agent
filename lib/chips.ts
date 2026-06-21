export function chipPlanner({ hasEntry, isPreSeason, gap = 0 }: { hasEntry: boolean; isPreSeason: boolean; gap?: number }) {
  if (isPreSeason) {
    return [
      { chip: 'Wildcard', action: 'Hold', confidence: 95, reason: 'Wait for prices, fixtures, injuries, and GW1 information.' },
      { chip: 'Triple Captain', action: 'Hold', confidence: 98, reason: 'Do not plan TC before confirmed fixtures and captain candidates.' },
      { chip: 'Bench Boost', action: 'Hold', confidence: 96, reason: 'Needs bench value and fixture density.' },
      { chip: 'Free Hit', action: 'Hold', confidence: 99, reason: 'Best saved for blank/chaotic gameweeks.' },
    ];
  }
  return [
    { chip: 'Wildcard', action: gap > 80 ? 'Consider later' : 'Hold', confidence: hasEntry ? 72 : 50, reason: 'Needs squad weakness, fixture swing, and league gap confirmation.' },
    { chip: 'Triple Captain', action: 'Hold', confidence: 82, reason: 'Wait for elite captain + strong fixture or double fixture context.' },
    { chip: 'Bench Boost', action: 'Hold', confidence: 75, reason: 'Use only when bench has strong fixtures and minutes.' },
    { chip: 'Free Hit', action: 'Hold', confidence: 88, reason: 'Save for blank gameweek or emergency.' },
  ];
}

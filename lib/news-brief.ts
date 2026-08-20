import type { ExternalNewsSignal, ModelPlayer, NewsConflict } from '@/types/fpl';

export function buildCriticalNewsBrief(
  players: ModelPlayer[],
  prioritySquad: ModelPlayer[],
  conflicts: NewsConflict[] = [],
) {
  const squadIds = new Set(prioritySquad.map((player) => player.id));
  const priority = (signal: ExternalNewsSignal) =>
    (signal.severity === 'high' ? 100 : signal.severity === 'medium' ? 60 : 10) +
    (signal.verification === 'confirmed' ? 35 : signal.verification === 'corroborated' ? 25 : signal.verification === 'single-source' ? 10 : 0) +
    (signal.category === 'press-conference' ? 8 : 0);
  const updates = players.flatMap((player) => (player.externalNews || [])
    .filter((signal) => signal.category !== 'other' && (
      signal.severity !== 'low' || signal.verification === 'confirmed' || signal.verification === 'corroborated'
    ))
    .map((signal) => ({
      playerId: player.id,
      playerName: player.name,
      inPrioritySquad: squadIds.has(player.id),
      category: signal.category,
      severity: signal.severity,
      verification: signal.verification,
      headline: signal.headline,
      source: signal.source,
      sources: signal.clusteredSources || [signal.source],
      sourceCount: signal.clusteredSourceCount || 1,
      url: signal.url,
      publishedAt: signal.publishedAt,
      priority: priority(signal) + (squadIds.has(player.id) ? 40 : 0),
    })))
    .sort((a, b) => b.priority - a.priority || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 8);
  return {
    criticalCount: updates.filter((item) => item.severity === 'high' || item.severity === 'medium').length,
    updates,
    conflicts: conflicts
      .filter((conflict) => !squadIds.size || squadIds.has(conflict.playerId))
      .slice(0, 5),
  };
}

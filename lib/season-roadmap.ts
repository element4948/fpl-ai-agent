import { selectBestLineup } from '@/lib/lineup';
import { isReliableStarter } from '@/lib/starter';
import type { ModelPlayer, SeasonRoadmap } from '@/types/fpl';

function eventIds(players: ModelPlayer[]) {
  return [...new Set(
    players.flatMap((player) =>
      (player.fixture?.fixtures || [])
        .map((fixture) => fixture.event)
        .filter((event): event is number => event != null),
    ),
  )].sort((a, b) => a - b).slice(0, 8);
}

function eventProjection(player: ModelPlayer, eventId: number) {
  const fixtures = (player.fixture?.fixtures || []).filter(
    (fixture) => fixture.event === eventId,
  );
  return Number(fixtures.reduce((sum, fixture) => {
    const difficultyAdjustment =
      (3 - fixture.difficulty) * (player.position === 'GKP' || player.position === 'DEF' ? 0.48 : 0.56);
    const venueAdjustment = fixture.isHome ? 0.16 : -0.12;
    return sum + Math.max(0.4, player.expectedPoints + difficultyAdjustment + venueAdjustment);
  }, 0).toFixed(2));
}

function captainRoadmapScore(player: ModelPlayer) {
  const setPieceBonus =
    (player.setPieceRoles.penalties === 1 ? 0.8 : 0) +
    (player.setPieceRoles.directFreeKicks === 1 ? 0.25 : 0);
  return (
    player.expectedPoints * 1.55 +
    player.starterConfidence * 0.025 +
    player.predictedMinutes * 0.018 +
    setPieceBonus -
    player.risk * 0.045
  );
}

export function buildSeasonRoadmap(
  squad: ModelPlayer[],
  allPlayers: ModelPlayer[],
): SeasonRoadmap {
  const events = eventIds(allPlayers);
  const squadIds = new Set(squad.map((player) => player.id));
  const weeks = events.map((eventId) => {
    const eventSquad = squad.map((player) => ({
      ...player,
      expectedPoints: eventProjection(player, eventId),
    }));
    const lineup = selectBestLineup(eventSquad);
    const projectedPoints = Number(
      lineup.startingXI.reduce((sum, player) => sum + player.expectedPoints, 0).toFixed(1),
    );
    const captainCandidates = [...lineup.startingXI]
      .filter((player) => player.position !== 'GKP')
      .sort((a, b) => captainRoadmapScore(b) - captainRoadmapScore(a));
    const captainPlayer = captainCandidates[0];
    const captainAlternatives = captainCandidates.slice(1, 4).map((player) => ({
      id: player.id,
      name: player.name,
      projectedPoints: player.expectedPoints,
      gap: Number(((captainPlayer?.expectedPoints || 0) - player.expectedPoints).toFixed(2)),
    }));
    const blankPlayers = eventSquad.filter((player) => player.expectedPoints === 0).length;
    const doublePlayers = squad.filter(
      (player) => (player.fixture?.fixtures || []).filter((fixture) => fixture.event === eventId).length > 1,
    ).length;
    const transferWatch = allPlayers
      .filter((player) => !squadIds.has(player.id) && isReliableStarter(player))
      .map((player) => ({ player, projectedPoints: eventProjection(player, eventId) }))
      .filter((item) => item.projectedPoints > 0)
      .sort((a, b) => b.projectedPoints - a.projectedPoints)
      .slice(0, 3)
      .map(({ player, projectedPoints: points }) => ({
        id: player.id,
        name: player.name,
        team: player.team,
        projectedPoints: points,
      }));
    const action = blankPlayers >= 4 || doublePlayers >= 6
      ? 'consider-chip' as const
      : transferWatch[0]?.projectedPoints > (lineup.bench[0]?.expectedPoints || 0) + 2
        ? 'monitor-transfer' as const
        : 'hold' as const;
    const note = blankPlayers >= 4
      ? `${blankPlayers} squad players blank байна. Free Hit/Wildcard нөхцөлийг deadline ойртоход шалгана.`
      : doublePlayers >= 6
        ? `${doublePlayers} squad players Double Gameweek-тэй. Captain/Bench Boost боломжийг шалгана.`
        : action === 'monitor-transfer'
          ? 'Fixture swing байна. Transfer хийхээс өмнө минут, мэдээ, free transfer-ээ дахин шалгана.'
          : 'Одоогийн бүтэц хангалттай. Тодорхой gain гарахгүй бол transfer хадгална.';

    return {
      eventId,
      projectedPoints,
      formation: lineup.formation,
      captain: captainPlayer
        ? { id: captainPlayer.id, name: captainPlayer.name, projectedPoints: captainPlayer.expectedPoints }
        : null,
      captainAlternatives,
      transferWatch,
      doublePlayers,
      blankPlayers,
      action,
      note,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    horizon: weeks.length,
    weeks,
    limitations: [
      'Roadmap нь шинэ injury, transfer, rotation болон fixture өөрчлөгдөх бүрд дахин тооцогдоно.',
      'Chip санал нь deadline-ийн өмнөх баталгаажуулалтгүйгээр final биш.',
    ],
  };
}

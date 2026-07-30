import type { FplPlayer, PlayerSignal } from '@/types/fpl';

export function buildOfficialSignals(player: FplPlayer): PlayerSignal[] {
  const signals: PlayerSignal[] = [];
  const chance = player.chance_of_playing_next_round;
  const status = player.status || 'a';

  if (status === 'i' || status === 'u' || status === 's') {
    signals.push({
      type: status === 'i' ? 'injury' : 'availability',
      severity: 'high',
      message:
        status === 'i'
          ? 'Official FPL lists the player as injured.'
          : status === 's'
            ? 'Official FPL lists the player as suspended.'
            : 'Official FPL lists the player as unavailable.',
      source: 'Official FPL',
    });
  } else if (status === 'd' || (chance != null && chance < 75)) {
    signals.push({
      type: 'availability',
      severity: chance != null && chance <= 25 ? 'high' : 'medium',
      message:
        chance == null
          ? 'Official FPL flags the player as doubtful.'
          : `Official chance of playing next round: ${chance}%.`,
      source: 'Official FPL',
    });
  }

  if (player.news?.trim()) {
    signals.push({
      type: 'news',
      severity: status === 'a' ? 'medium' : 'high',
      message: player.news.trim(),
      source: 'Official FPL',
    });
  }

  const transfersIn = player.transfers_in_event || 0;
  const transfersOut = player.transfers_out_event || 0;
  if (transfersOut > Math.max(5000, transfersIn * 2)) {
    signals.push({
      type: 'transfer',
      severity: 'low',
      message: 'Net transfers out are unusually high. Check the latest team news.',
      source: 'Official FPL',
    });
  }

  return signals;
}

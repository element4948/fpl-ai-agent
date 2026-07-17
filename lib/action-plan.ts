import type { ModelPlayer } from '@/types/fpl';

type TransferSuggestion = {
  out: string;
  in: string;
  expectedGain: number;
  hitCost: number;
};

export type WeeklyActionPlan = {
  doNow: string[];
  checkBeforeDeadline: string[];
  avoid: string[];
  decisionStatus: 'ready' | 'review' | 'wait';
};

export function buildWeeklyActionPlan(input: {
  isPreSeason: boolean;
  captain: ModelPlayer | null;
  viceCaptain: ModelPlayer | null;
  transfer: TransferSuggestion | null;
  freeTransfers: number;
}): WeeklyActionPlan {
  const { isPreSeason, captain, viceCaptain, transfer, freeTransfers } = input;

  if (isPreSeason) {
    return {
      decisionStatus: 'review',
      doNow: [
        'buildInitialSquad',
        'compareDraftVariants',
        'saveEntryIdLater',
      ],
      checkBeforeDeadline: [
        'confirmPlayerAvailability',
        'reviewLateTransfers',
        'refreshFinalDraft',
      ],
      avoid: [
        'avoidEarlyChipPlan',
        'avoidSingleSourceDecision',
      ],
    };
  }

  const doNow: string[] = [];
  const checkBeforeDeadline: string[] = [
    'confirmPlayerAvailability',
    'reviewPressConference',
    'refreshFinalDecision',
  ];
  const avoid: string[] = ['avoidEmotionalTransfer', 'avoidUnnecessaryHit'];

  if (captain) doNow.push('setRecommendedCaptain');
  if (viceCaptain) doNow.push('setRecommendedViceCaptain');

  if (transfer && transfer.hitCost === 0 && freeTransfers > 0) {
    doNow.push('reviewRecommendedTransfer');
  } else {
    doNow.push('holdTransfer');
  }

  const highRiskCaptain = (captain?.riskBreakdown?.total ?? captain?.risk ?? 0) >= 45;
  const lowConfidenceCaptain = (captain?.confidence ?? 0) < 70;
  const status = highRiskCaptain || lowConfidenceCaptain ? 'wait' : transfer ? 'ready' : 'review';

  return {
    decisionStatus: status,
    doNow,
    checkBeforeDeadline,
    avoid,
  };
}

export type Lang = 'mn' | 'en';

export const dict = {
  mn: {
    navDashboard: 'Нүүр', navSettings: 'Тохиргоо', navTeam: 'Миний баг', navLeague: 'Лиг', navDrafts: 'Draft багууд',
    decisionEngine: 'Decision Engine', decisionSub: 'Энэ долоо хоногийн гол шийдвэрийг нэг дор гаргана.', thisWeekDecision: 'Энэ долоо хоногийн шийдвэр', recommendedCaptain: 'Санал болгож буй captain', recommendedTransfer: 'Санал болгож буй transfer', recommendedChip: 'Chip зөвлөгөө', runDecision: 'Decision гаргах', decisionScore: 'Decision score', buildDraftAction: 'Pre-season draft бүрдүүлэх', makeTransferAction: 'Transfer хийх боломжтой', holdTransferAction: 'Transfer хадгалах', preSeasonBuild: 'Pre-season баг бүрдүүлэх', aggressiveChase: 'Aggressive chase', balancedChase: 'Balanced chase', protectRank: 'Байраа хамгаалах', balancedControl: 'Balanced control', decisionSummaryPre: 'Pre-season: value, minutes, confidence, risk дээр үндэслэж эхний squad бүрдүүлнэ. Chip төлөвлөх болоогүй.', decisionSummaryTransfer: 'Энэ GW: model no-hit transfer санал болгож байна. Deadline-аас өмнө reason-ийг шалга.', decisionSummaryHold: 'Энэ GW: safe no-hit transfer хангалттай ашигтай биш. Captain сонголт дээр төвлөрөөд transfer хадгалах нь дээр.',
    heroTitle: 'FPL шийдвэрээ дата дээр үндэслэж гарга.',
    heroLead: 'Pre-season үед Entry ID шаардахгүй draft, risk, captain, transfer model ажиллана. FPL нээгдээд Entry ID/League ID ормогц live analysis асна.',
    preSeason: '2026/27 Pre-Season Mode', live: 'Live Season Mode', optionalIds: 'Entry ID / League ID одоогоор optional.',
    seasonStatus: 'Улирлын төлөв', nextDeadline: 'Дараагийн deadline', notPublished: 'Одоогоор зарлагдаагүй',
    bestDraft: 'Best Draft', alternativeDraft: 'Alternative Draft', differentialDraft: 'Differential Draft', safeDraft: 'Safe Draft',
    topTargets: 'Top Targets', riskMonitor: 'Risk Monitor', captainModel: 'Captain Model', transferEngine: 'Transfer Engine', chipPlanner: 'Chip Planner',
    settings: 'Тохиргоо', save: 'Хадгалах', saved: 'Хадгаллаа', entryId: 'FPL Entry ID', leagueId: 'League ID', riskProfile: 'Risk Profile', goal: 'Зорилго', language: 'Хэл',
    safe: 'Safe', balanced: 'Balanced', aggressive: 'Aggressive', overall: 'Overall Rank', league: 'Mini League түрүүлэх', both: 'Аль аль нь',
    noId: 'ID байхгүй тул pre-season demo mode ажиллаж байна.', addLater: 'FPL нээгдсэний дараа Settings дээр ID-гаа нэмээрэй.',
    squadRules: 'Squad Rules', budget: 'Budget', clubLimit: 'Club limit', valid: 'Valid', invalid: 'Invalid',
    expected: 'Expected', confidence: 'Confidence', risk: 'Risk', ownership: 'Ownership', price: 'Price', minutes: 'Minutes', form: 'Form',
    captainShortlist: 'Captain shortlist', transferSuggestions: 'Transfer suggestions', noSafeTransfer: 'Одоогоор hit авахгүйгээр safe transfer санал алга.',
    leagueIntelligence: 'League Intelligence', managersAbove: 'Миний дээр байгаа manager', gap: 'Gap', strategy: 'Strategy',
    waitingFixtures: 'Fixture болон 2026/27 official schedule бүрэн нээгдэхийг хүлээж байна.',
    dataFoundation: 'Data Foundation', dataText: 'Official FPL API дээр price, ownership, form, injuries, suspension, team/player stats татна. Friendly, national team, press/news signal нь дараагийн external connector layer.',
    ruleEngine: 'Rule Engine', ruleText: 'Budget, squad structure, max 3 per club, free transfer first, no-hit default, chips planning-г тусдаа шалгана.',
    riskEngine: 'Risk Engine', riskText: 'Injury/news/status/minutes/rotation/ownership дээр confidence ба risk оноо гаргана.',
    noData: 'Дата олдсонгүй эсвэл FPL API түр unavailable байна.',
    noHitDefault: 'No-hit default', budgetGuard: 'Budget guard', riskScore: 'Risk score', chipHoldLogic: 'Chip hold logic', mode: 'Mode', playersLoaded: 'Уншсан тоглогч', officialApi: 'Official FPL bootstrap-static API.', output: 'Гаралт',
    liveTeamSub: 'Entry ID байвал live team уншина. ID байхгүй бол model output харуулна.', runTeamAnalysis: 'Баг анализ хийх', loading: 'Уншиж байна...', gwRank: 'GW Rank', teamValue: 'Team Value', bank: 'Bank', captainSub: 'Fixture layer-ийг fixture баталгаажсаны дараа нэмнэ.',
    transferSub: 'Default policy: оноо хасахгүй. Budget, position, club limit шалгана.', cost: 'Cost', hit: 'Hit', chipSub: 'Зөвхөн double gameweek биш: gap, rival chips, fixtures, form, risk бүгдийг тооцох бүтэцтэй.',
    leagueSub: 'Зөвхөн leader биш — чиний дээр байгаа бүх manager-ийг analyze хийх бүтэцтэй.', runLeagueAnalysis: 'Лиг анализ хийх', points: 'оноо', positionTargets: 'Position Targets', positionTargetsSub: 'Position бүрийн model-оор эрэмбэлсэн target тоглогчид.', topTargetsSub: 'Price, ownership, form, minutes, confidence, risk-ийг хослуулсан эхний target ranking.', draftTeams: 'Draft Teams', draftTeamsSub: 'Best, Alternative, Differential, Safe draft хувилбарууд rule validation-тай.',
    addLaterPlaceholder: 'Дараа нэмнэ', allGood: 'Хэвийн', check: 'Шалгах',
    chipWildcardPre: 'Үнэ, fixture, injury, GW1 мэдээлэл баталгаажихыг хүлээнэ.', chipTcPre: 'Fixture болон captain candidate баталгаажаагүй үед TC төлөвлөхгүй.', chipBbPre: 'Bench value болон fixture density хэрэгтэй.', chipFhPre: 'Blank/chaotic gameweek-д хадгалах нь зөв.',
    chipWildcardLive: 'Squad weakness, fixture swing, league gap баталгаажсаны дараа шийднэ.', chipTcLive: 'Elite captain + хүчтэй fixture эсвэл double fixture context хүлээнэ.', chipBbLive: 'Bench тоглогчид minutes болон fixture сайн үед л хэрэглэнэ.', chipFhLive: 'Blank gameweek эсвэл emergency үед хадгална.',
    hold: 'Hold', considerLater: 'Дараа бодолцох',
    draftBest1: 'Projected points өндөр', draftBest2: 'Price/value/risk хамтад нь ашигласан', draftBest3: 'Үндсэн санал болгож буй draft',
    draftAlt1: 'Value-first бүтэц', draftAlt2: 'Үнэний өөр хуваарилалт', draftAlt3: 'Best Draft-ийн backup хувилбар',
    draftDiff1: 'Ownership багатай тоглогч руу bias-тай', draftDiff2: 'Mini-league gap нөхөхөд ашигтай', draftDiff3: 'Safe draft-аас илүү эрсдэлтэй',
    draftSafe1: 'Minutes болон availability bias-тай', draftSafe2: 'Injury/news risk багатай', draftSafe3: 'Early season-д тохиромжтой default',
    fplUnavailable: 'FPL API түр unavailable байна.', noIdLeague: 'Entry ID эсвэл League ID байхгүй тул live league analysis ажиллахгүй. Одоогоор pre-season mode хэвийн.', noIdTeam: 'Entry ID байхгүй тул live team analysis ажиллахгүй. Одоогоор pre-season model ашиглана.'
  },
  en: {
    navDashboard: 'Dashboard', navSettings: 'Settings', navTeam: 'My Team', navLeague: 'League', navDrafts: 'Drafts',
    decisionEngine: 'Decision Engine', decisionSub: 'One place for the main weekly decision.', thisWeekDecision: 'This Gameweek Decision', recommendedCaptain: 'Recommended captain', recommendedTransfer: 'Recommended transfer', recommendedChip: 'Chip advice', runDecision: 'Run decision', decisionScore: 'Decision score', buildDraftAction: 'Build pre-season draft', makeTransferAction: 'Transfer available', holdTransferAction: 'Hold transfer', preSeasonBuild: 'Pre-season build', aggressiveChase: 'Aggressive chase', balancedChase: 'Balanced chase', protectRank: 'Protect rank', balancedControl: 'Balanced control', decisionSummaryPre: 'Pre-season: build the first squad from value, minutes, confidence and risk. Do not plan chips yet.', decisionSummaryTransfer: 'This GW: the model found a no-hit transfer. Check the reason before the deadline.', decisionSummaryHold: 'This GW: no safe no-hit transfer is clearly profitable. Focus on captain and save transfer if possible.',
    heroTitle: 'Make FPL decisions with data.',
    heroLead: 'Pre-season mode works without Entry ID. Once FPL opens, add Entry ID/League ID to unlock live team and league intelligence.',
    preSeason: '2026/27 Pre-Season Mode', live: 'Live Season Mode', optionalIds: 'Entry ID / League ID are optional for now.',
    seasonStatus: 'Season status', nextDeadline: 'Next deadline', notPublished: 'Not published yet',
    bestDraft: 'Best Draft', alternativeDraft: 'Alternative Draft', differentialDraft: 'Differential Draft', safeDraft: 'Safe Draft',
    topTargets: 'Top Targets', riskMonitor: 'Risk Monitor', captainModel: 'Captain Model', transferEngine: 'Transfer Engine', chipPlanner: 'Chip Planner',
    settings: 'Settings', save: 'Save', saved: 'Saved', entryId: 'FPL Entry ID', leagueId: 'League ID', riskProfile: 'Risk Profile', goal: 'Goal', language: 'Language',
    safe: 'Safe', balanced: 'Balanced', aggressive: 'Aggressive', overall: 'Overall Rank', league: 'Mini League Win', both: 'Both',
    noId: 'No IDs yet, so pre-season demo mode is active.', addLater: 'Add your IDs in Settings after FPL opens.',
    squadRules: 'Squad Rules', budget: 'Budget', clubLimit: 'Club limit', valid: 'Valid', invalid: 'Invalid',
    expected: 'Expected', confidence: 'Confidence', risk: 'Risk', ownership: 'Ownership', price: 'Price', minutes: 'Minutes', form: 'Form',
    captainShortlist: 'Captain shortlist', transferSuggestions: 'Transfer suggestions', noSafeTransfer: 'No useful safe transfer without a hit yet.',
    leagueIntelligence: 'League Intelligence', managersAbove: 'Managers above me', gap: 'Gap', strategy: 'Strategy',
    waitingFixtures: 'Waiting for the full 2026/27 fixture and official schedule.',
    dataFoundation: 'Data Foundation', dataText: 'Official FPL API pulls prices, ownership, form, injuries, suspension, and player/team stats. Friendly, national team and press/news signals belong to the next external connector layer.',
    ruleEngine: 'Rule Engine', ruleText: 'Budget, squad structure, max 3 per club, free transfer first, no-hit default, and chip planning are checked separately.',
    riskEngine: 'Risk Engine', riskText: 'Injury/news/status/minutes/rotation/ownership generate confidence and risk scores.',
    noData: 'No data found or FPL API is temporarily unavailable.',
    noHitDefault: 'No-hit default', budgetGuard: 'Budget guard', riskScore: 'Risk score', chipHoldLogic: 'Chip hold logic', mode: 'Mode', playersLoaded: 'Players loaded', officialApi: 'Official FPL bootstrap-static API.', output: 'Output',
    liveTeamSub: 'Live team uses Entry ID when available. Without ID it shows model output.', runTeamAnalysis: 'Run team analysis', loading: 'Loading...', gwRank: 'GW Rank', teamValue: 'Team Value', bank: 'Bank', captainSub: 'Fixture layer can be added after fixtures are confirmed.',
    transferSub: 'Default policy: no points hit. Budget, position and club limit checked.', cost: 'Cost', hit: 'Hit', chipSub: 'Not only double gameweek: gap, rival chips, fixtures, form and risk will be considered.',
    leagueSub: 'Not leader-only — this is structured to analyze every manager above you.', runLeagueAnalysis: 'Run league analysis', points: 'pts', positionTargets: 'Position Targets', positionTargetsSub: 'Top model players grouped by position.', topTargetsSub: 'Price, ownership, form, minutes, confidence, and risk combined.', draftTeams: 'Draft Teams', draftTeamsSub: 'Best, Alternative, Differential, and Safe draft variants with rule validation.',
    addLaterPlaceholder: 'Add later', allGood: 'Valid', check: 'Check',
    chipWildcardPre: 'Wait for prices, fixtures, injuries, and GW1 information.', chipTcPre: 'Do not plan TC before confirmed fixtures and captain candidates.', chipBbPre: 'Needs bench value and fixture density.', chipFhPre: 'Best saved for blank/chaotic gameweeks.',
    chipWildcardLive: 'Needs squad weakness, fixture swing, and league gap confirmation.', chipTcLive: 'Wait for elite captain + strong fixture or double fixture context.', chipBbLive: 'Use only when bench has strong fixtures and minutes.', chipFhLive: 'Save for blank gameweek or emergency.',
    hold: 'Hold', considerLater: 'Consider later',
    draftBest1: 'Highest projected points bias', draftBest2: 'Uses price/value/risk together', draftBest3: 'Main recommended draft',
    draftAlt1: 'Value-first structure', draftAlt2: 'Different price distribution', draftAlt3: 'Backup to Best Draft',
    draftDiff1: 'Lower ownership bias', draftDiff2: 'Useful when chasing mini-league gaps', draftDiff3: 'Higher risk than Safe draft',
    draftSafe1: 'Minutes and availability bias', draftSafe2: 'Avoids injury/news risk', draftSafe3: 'Good default for early season',
    fplUnavailable: 'FPL API is temporarily unavailable.', noIdLeague: 'Entry ID or League ID is missing, so live league analysis is disabled. Pre-season mode is still active.', noIdTeam: 'Entry ID is missing, so live team analysis is disabled. Pre-season model will be used.'
  }
} as const;

export function draftModeLabel(mode: string, lang: Lang) {
  const t = dict[lang];
  if (mode === 'Alternative') return t.alternativeDraft;
  if (mode === 'Differential') return t.differentialDraft;
  if (mode === 'Safe') return t.safeDraft;
  return t.bestDraft;
}

export function draftExplanation(mode: string, lang: Lang) {
  const t = dict[lang];
  if (mode === 'Alternative') return [t.draftAlt1, t.draftAlt2, t.draftAlt3];
  if (mode === 'Differential') return [t.draftDiff1, t.draftDiff2, t.draftDiff3];
  if (mode === 'Safe') return [t.draftSafe1, t.draftSafe2, t.draftSafe3];
  return [t.draftBest1, t.draftBest2, t.draftBest3];
}

export function chipReason(chip: string, isPreSeason: boolean, lang: Lang) {
  const t = dict[lang];
  if (chip === 'Triple Captain') return isPreSeason ? t.chipTcPre : t.chipTcLive;
  if (chip === 'Bench Boost') return isPreSeason ? t.chipBbPre : t.chipBbLive;
  if (chip === 'Free Hit') return isPreSeason ? t.chipFhPre : t.chipFhLive;
  return isPreSeason ? t.chipWildcardPre : t.chipWildcardLive;
}

export function chipAction(action: string, lang: Lang) {
  const t = dict[lang];
  return action === 'Consider later' ? t.considerLater : t.hold;
}

export function transferReason(reason: string, lang: Lang) {
  if (lang === 'en') return reason;
  const map: Record<string, string> = {
    'Higher projected points': 'Projected points өндөр',
    'Better confidence/minutes profile': 'Confidence/minutes profile илүү сайн',
    'Lower injury/rotation/news risk': 'Injury/rotation/news risk бага',
    'Better value score': 'Value score илүү сайн',
    'Model prefers incoming player': 'Model incoming player-ийг илүүд үзсэн',
  };
  return map[reason] || reason;
}

export function strategyLabel(strategy: string, lang: Lang) {
  if (lang === 'en') return strategy;
  const map: Record<string, string> = {
    'Pre-season scouting': 'Pre-season scouting',
    'Aggressive differential chase': 'Aggressive differential chase',
    'Balanced aggressive': 'Balanced aggressive',
    'Controlled chase': 'Controlled chase',
    'Protect lead': 'Байраа хамгаалах',
  };
  return map[strategy] || strategy;
}


export function decisionActionLabel(action: string, lang: Lang) {
  const t = dict[lang];
  if (action === 'buildDraft') return t.buildDraftAction;
  if (action === 'makeTransfer') return t.makeTransferAction;
  return t.holdTransferAction;
}

export function decisionStrategyLabel(strategy: string, lang: Lang) {
  const t = dict[lang];
  const map: Record<string, string> = {
    preSeasonBuild: t.preSeasonBuild,
    aggressiveChase: t.aggressiveChase,
    balancedChase: t.balancedChase,
    protectRank: t.protectRank,
    balancedControl: t.balancedControl,
  };
  return map[strategy] || strategy;
}

export function decisionSummaryLabel(summary: string, lang: Lang) {
  const t = dict[lang];
  if (summary.startsWith('Pre-season')) return t.decisionSummaryPre;
  if (summary.startsWith('This week: one no-hit')) return t.decisionSummaryTransfer;
  if (summary.startsWith('This week: no safe')) return t.decisionSummaryHold;
  return summary;
}

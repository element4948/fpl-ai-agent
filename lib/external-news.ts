import type { ExternalNewsSignal, ModelPlayer, NewsConflict } from '@/types/fpl';

const MAX_CANDIDATES_PER_POSITION = 6;
const MAX_VERIFICATION_CANDIDATES = 48;

const OFFICIAL_CLUB_DOMAINS: Record<string, string> = {
  ARS: 'arsenal.com', AVL: 'avfc.co.uk', BOU: 'afcb.co.uk', BRE: 'brentfordfc.com',
  BHA: 'brightonandhovealbion.com', BUR: 'burnleyfootballclub.com', CHE: 'chelseafc.com',
  CRY: 'cpfc.co.uk', EVE: 'evertonfc.com', FUL: 'fulhamfc.com', LEE: 'leedsunited.com',
  LIV: 'liverpoolfc.com', MCI: 'mancity.com', MUN: 'manutd.com', NEW: 'newcastleunited.com',
  NFO: 'nottinghamforest.co.uk', SUN: 'safc.com', TOT: 'tottenhamhotspur.com',
  WHU: 'whufc.com', WOL: 'wolves.co.uk',
};

export type ExternalNewsScan = {
  signals: Map<number, ExternalNewsSignal[]>;
  checkedIds: Set<number>;
  checkedAt: string;
  officialClubCheckedIds: Set<number>;
  officialClubFeedsChecked: number;
  officialClubFeedsAttempted: number;
  officialClubSignals: number;
  conflicts: NewsConflict[];
  // False when the news feed itself failed (timeouts / rate limiting), so a
  // failed scan is not mistaken for "scanned, everyone is fit".
  ok: boolean;
};

type FeedArticle = {
  headline: string;
  url: string;
  publishedAt: string;
  source: string;
  sourceUrl: string;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function value(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeXml(match?.[1]?.trim() || '');
}

function sourceValue(item: string) {
  const match = item.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/i);
  return {
    url: decodeXml(match?.[1] || ''),
    name: decodeXml(match?.[2]?.trim() || ''),
  };
}

const OFFICIAL_SOURCE_DOMAINS = [
  'premierleague.com',
  'arsenal.com', 'avfc.co.uk', 'afcb.co.uk', 'brentfordfc.com',
  'brightonandhovealbion.com', 'chelseafc.com', 'cpfc.co.uk',
  'evertonfc.com', 'fulhamfc.com', 'liverpoolfc.com', 'mancity.com',
  'manutd.com', 'nufc.co.uk', 'safc.com', 'tottenhamhotspur.com',
  'ccfc.co.uk', 'hullcitytigers.com', 'itfc.co.uk', 'leedsunited.com',
  'nottinghamforest.co.uk',
  'newcastleunited.com',
  'whufc.com', 'wolves.co.uk', 'burnleyfootballclub.com',
  'lcfc.com', 'southamptonfc.com', 'wba.co.uk', 'watfordfc.com',
  'sufc.co.uk', 'swanseacity.com', 'thefa.com', 'uefa.com', 'fifa.com',
];

function normalizedHostname(value: string) {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostnameMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function sourceTier(source: string, sourceUrl: string): ExternalNewsSignal['tier'] {
  const hostname = normalizedHostname(sourceUrl);
  if (hostname && OFFICIAL_SOURCE_DOMAINS.some((domain) => hostnameMatches(hostname, domain))) {
    return 'official';
  }
  const text = source.trim().toLowerCase();
  if (
    text.includes('bbc') ||
    text.includes('sky sports') ||
    text.includes('the athletic') ||
    text.includes('guardian') ||
    text.includes('reuters') ||
    text.includes('fabrizio romano') ||
    text.includes('associated press') ||
    text.includes('ap news') ||
    text.includes('pa media') ||
    text.includes('espn') ||
    text.includes('independent') ||
    text.includes('telegraph')
  ) return 'reliable';
  return 'secondary';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-name match instead of raw substring. `"son".includes` matched
 * "Johnson"/"reason" and slashed the wrong player's projection; requiring the
 * name to sit on word boundaries (unicode-aware) removes those false positives
 * while still matching "Bernardo Silva ruled out".
 */
export function headlineMentionsName(headline: string, name: string): boolean {
  if (!headline || !name || name.trim().length < 3) return false;
  try {
    const re = new RegExp(`(^|[^\\p{L}])${escapeRegExp(name.trim())}([^\\p{L}]|$)`, 'iu');
    return re.test(headline);
  } catch {
    return headline.toLowerCase().includes(name.trim().toLowerCase());
  }
}

export function classifyHeadline(headline: string): Pick<ExternalNewsSignal, 'category' | 'severity'> {
  const text = headline.toLowerCase();
  if (/set to stay|expected to stay|will stay|stays? at|not for sale|rules out (a )?(move|transfer)|move ruled out/.test(text)) {
    return { category: 'transfer', severity: 'low' };
  }
  if (/back in training|returns? to training|returns? from injury|fit again|available for selection|declared fit/.test(text)) {
    return { category: 'availability', severity: 'low' };
  }
  if (/injur|ruled out|sidelined|misses|doubt/.test(text)) {
    return { category: 'injury', severity: /ruled out|sidelined|misses/.test(text) ? 'high' : 'medium' };
  }
  if (/set to leave|expected to leave|agrees terms|transfer talks|wants exit|leaves? (the )?club|joins? .+ on loan|loan move|completes? (a )?(move|transfer)/.test(text)) {
    return { category: 'transfer', severity: 'high' };
  }
  if (/dropped|left out|rotation|loses place|not first choice/.test(text)) {
    return { category: 'rotation', severity: 'medium' };
  }
  if (/international duty|national team|called up|world cup|qualifier/.test(text)) {
    return {
      category: 'international',
      severity: /injur|withdraw|doubt|90 minutes|120 minutes/.test(text)
        ? 'medium'
        : 'low',
    };
  }
  if (/friendly|pre-season|preseason/.test(text)) {
    return {
      category: 'friendly',
      severity: /injur|misses|withdraw|left out/.test(text) ? 'medium' : 'low',
    };
  }
  if (/fatigue|rested|late return|travel|jet lag|overload/.test(text)) {
    return { category: 'fatigue', severity: 'medium' };
  }
  if (/press conference|manager confirms|manager says|team news update/.test(text)) {
    return { category: 'press-conference', severity: 'low' };
  }
  return { category: 'other', severity: 'low' };
}

function maximumAge(category: ExternalNewsSignal['category']) {
  if (category === 'injury' || category === 'transfer') return 14 * 24 * 60 * 60 * 1000;
  if (category === 'rotation' || category === 'availability') return 4 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function sourceKey(signal: Pick<ExternalNewsSignal, 'source' | 'sourceUrl' | 'url'>) {
  try {
    return new URL(signal.sourceUrl || signal.url).hostname.replace(/^www\./, '');
  } catch {
    return signal.source.trim().toLowerCase();
  }
}

function claimKey(signal: Pick<ExternalNewsSignal, 'headline' | 'category' | 'severity'>) {
  const text = signal.headline.toLowerCase();
  if (signal.category === 'availability') return 'availability:fit';
  if (signal.category === 'injury') {
    if (/ruled out|sidelined|misses/.test(text)) return 'injury:out';
    if (/doubt|fitness test|late call/.test(text)) return 'injury:doubt';
    return `injury:${signal.severity}`;
  }
  if (signal.category === 'transfer') {
    if (/set to stay|expected to stay|will stay|stays? at|not for sale|rules out (a )?(move|transfer)|move ruled out/.test(text)) return 'transfer:stay';
    if (/completes? (a )?(move|transfer)|joins? .+ on loan|loan move|leaves? (the )?club/.test(text)) return 'transfer:move';
    if (/agrees terms|set to leave|expected to leave|wants exit/.test(text)) return 'transfer:exit';
    if (/transfer talks/.test(text)) return 'transfer:talks';
  }
  if (signal.category === 'rotation') return /dropped|left out|loses place|not first choice/.test(text)
    ? 'rotation:place-risk'
    : 'rotation:general';
  if (signal.category === 'fatigue') return 'fatigue:workload';
  if (signal.category === 'press-conference') return 'press-conference:update';
  if (signal.category === 'international') return `international:${signal.severity}`;
  if (signal.category === 'friendly') return `friendly:${signal.severity}`;
  return `other:${text.replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

function authorityScore(signal: ExternalNewsSignal) {
  return signal.tier === 'official' ? 3 : signal.tier === 'reliable' ? 2 : 1;
}

function isTrustedForConflict(signal: ExternalNewsSignal) {
  return signal.verification === 'confirmed' ||
    signal.verification === 'corroborated' ||
    (signal.tier === 'reliable' && signal.verification === 'single-source');
}

function preferredSignal(signals: ExternalNewsSignal[]) {
  return [...signals].sort((a, b) =>
    authorityScore(b) - authorityScore(a) ||
    (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0),
  )[0];
}

export function resolveSignalConflicts(
  player: Pick<ModelPlayer, 'id' | 'name'>,
  signals: ExternalNewsSignal[],
): { signals: ExternalNewsSignal[]; conflicts: NewsConflict[] } {
  const active = new Set(signals);
  const conflicts: NewsConflict[] = [];
  const pairs: Array<{
    topic: NewsConflict['topic'];
    positive: (signal: ExternalNewsSignal) => boolean;
    negative: (signal: ExternalNewsSignal) => boolean;
  }> = [
    {
      topic: 'availability',
      positive: (signal) => signal.category === 'availability',
      negative: (signal) => signal.category === 'injury' && signal.severity !== 'low',
    },
    {
      topic: 'transfer',
      positive: (signal) => claimKey(signal) === 'transfer:stay',
      negative: (signal) => signal.category === 'transfer' && signal.severity === 'high',
    },
  ];
  for (const pair of pairs) {
    const positive = signals.filter((signal) => pair.positive(signal) && isTrustedForConflict(signal));
    const negative = signals.filter((signal) => pair.negative(signal) && isTrustedForConflict(signal));
    if (!positive.length || !negative.length) continue;
    const positiveBest = preferredSignal(positive);
    const negativeBest = preferredSignal(negative);
    const winner = preferredSignal([positiveBest, negativeBest]);
    const losingSide = winner === positiveBest ? negative : positive;
    for (const loser of losingSide) active.delete(loser);
    const superseded = preferredSignal(losingSide);
    conflicts.push({
      playerId: player.id,
      playerName: player.name,
      topic: pair.topic,
      resolution: 'authoritative-signal',
      activeHeadline: winner.headline,
      activeSource: winner.source,
      supersededHeadline: superseded.headline,
      supersededSource: superseded.source,
    });
  }
  return { signals: signals.filter((signal) => active.has(signal)), conflicts };
}

export function clusterNewsSignals(signals: ExternalNewsSignal[]): ExternalNewsSignal[] {
  const groups = new Map<string, ExternalNewsSignal[]>();
  for (const signal of signals) {
    const key = claimKey(signal);
    groups.set(key, [...(groups.get(key) || []), signal]);
  }
  return [...groups.values()].map((group) => {
    const preferred = preferredSignal(group);
    const sources = [...new Set(group.map((signal) => signal.source).filter(Boolean))];
    return {
      ...preferred,
      corroboratingSourceCount: Math.max(
        preferred.corroboratingSourceCount,
        ...group.map((signal) => signal.corroboratingSourceCount),
      ),
      clusteredSourceCount: sources.length,
      clusteredSources: sources,
    };
  });
}

export function playerNewsAliases(
  player: Pick<ModelPlayer, 'id' | 'name' | 'fullName'>,
  teammates: Array<Pick<ModelPlayer, 'id' | 'name' | 'fullName'>> = [],
) {
  const aliases = new Set<string>();
  if (player.name.trim().length >= 3) aliases.add(player.name.trim());
  if (player.fullName?.trim()) aliases.add(player.fullName.trim());
  const expandedDisplay = player.name.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  if (expandedDisplay.length >= 3) aliases.add(expandedDisplay);
  const surname = player.fullName?.trim().split(/\s+/).at(-1);
  if (surname && surname.length >= 4) {
    const collisions = teammates.filter((candidate) =>
      candidate.fullName?.trim().split(/\s+/).at(-1)?.toLowerCase() === surname.toLowerCase(),
    );
    if (collisions.length <= 1) aliases.add(surname);
  }
  return [...aliases];
}

function articleMentionsPlayer(
  article: FeedArticle,
  player: ModelPlayer,
  teammates: ModelPlayer[],
) {
  return playerNewsAliases(player, teammates).some((alias) =>
    headlineMentionsName(article.headline, alias),
  );
}

export function verifySignals(
  signals: Omit<ExternalNewsSignal, 'verification' | 'corroboratingSourceCount'>[],
): ExternalNewsSignal[] {
  return signals.map((signal) => {
    const relatedSources = new Set(
      signals
        .filter((candidate) => claimKey(candidate) === claimKey(signal) && candidate.tier !== 'secondary')
        .map(sourceKey),
    );
    const corroboratingSourceCount = relatedSources.size;
    const verification = signal.tier === 'official'
      ? 'confirmed'
      : signal.tier === 'reliable' && corroboratingSourceCount >= 2
        ? 'corroborated'
        : signal.tier === 'reliable'
          ? 'single-source'
          : 'unverified';
    return { ...signal, verification, corroboratingSourceCount };
  });
}

async function fetchFeed(query: string): Promise<{ ok: boolean; articles: FeedArticle[] }> {
  try {
    const response = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`,
      {
        next: { revalidate: 1800 },
        signal: AbortSignal.timeout(3500),
      },
    );
    if (!response.ok) return { ok: false, articles: [] };
    const xml = await response.text();
    const articles = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
      const item = match[1];
      const source = sourceValue(item);
      return {
        headline: value(item, 'title'),
        url: value(item, 'link'),
        publishedAt: value(item, 'pubDate'),
        source: source.name,
        sourceUrl: source.url,
      };
    });
    return { ok: true, articles };
  } catch {
    return { ok: false, articles: [] };
  }
}

export async function getExternalNewsSignals(
  players: ModelPlayer[],
  preferredIds: number[] = [],
): Promise<ExternalNewsScan> {
  const preferred = new Set(preferredIds);
  const baseline = ['GKP', 'DEF', 'MID', 'FWD'].flatMap((position) =>
    players
      .filter((player) => player.position === position)
      .sort(
        (a, b) =>
          b.expectedPoints +
          b.valueScore +
          b.ownership * 0.02 -
          (a.expectedPoints + a.valueScore + a.ownership * 0.02),
      )
      .slice(0, MAX_CANDIDATES_PER_POSITION),
  );
  const candidates = [...players.filter((player) => preferred.has(player.id)), ...baseline]
    .filter((player, index, list) => list.findIndex((item) => item.id === player.id) === index)
    .slice(0, MAX_VERIFICATION_CANDIDATES);
  const playersByTeam = new Map<string, ModelPlayer[]>();
  for (const player of players) {
    playersByTeam.set(player.team, [...(playersByTeam.get(player.team) || []), player]);
  }
  const candidateTeams = [...new Set(candidates.map((player) => player.team))]
    .filter((team) => Boolean(OFFICIAL_CLUB_DOMAINS[team]));
  const [feedByPlayer, officialFeeds] = await Promise.all([
    Promise.all(
    candidates.map(async (player) => ({
      player,
      feed: await fetchFeed(
        `"${player.fullName || player.name}" "${player.teamName || player.team}" (injury OR transfer OR "team news" OR "press conference" OR "manager confirms" OR rotation OR "set to leave" OR friendly OR preseason OR "international duty" OR fatigue)`,
      ),
    })),
    ),
    Promise.all(candidateTeams.map(async (team) => ({
      team,
      feed: await fetchFeed(
        `site:${OFFICIAL_CLUB_DOMAINS[team]} (injury OR injured OR available OR fitness OR "team news" OR "press conference" OR transfer OR loan OR squad)`,
      ),
    }))),
  ]);
  const now = Date.now();
  const result = new Map<number, ExternalNewsSignal[]>();
  const individuallyCheckedIds = new Set<number>();
  const officialClubCheckedIds = new Set<number>();
  const officialArticlesByPlayer = new Map<number, FeedArticle[]>();
  const conflicts: NewsConflict[] = [];

  for (const { team, feed } of officialFeeds) {
    if (!feed.ok) continue;
    const teammates = playersByTeam.get(team) || [];
    const teamCandidates = candidates.filter((player) => player.team === team);
    for (const player of teamCandidates) {
      officialClubCheckedIds.add(player.id);
      const matches = feed.articles.filter((article) =>
        sourceTier(article.source, article.sourceUrl) === 'official' &&
        articleMentionsPlayer(article, player, teammates),
      );
      if (matches.length) officialArticlesByPlayer.set(player.id, matches);
    }
  }

  for (const { player, feed } of feedByPlayer) {
    if (feed.ok) {
      individuallyCheckedIds.add(player.id);
    }
    const articles = [...(officialArticlesByPlayer.get(player.id) || []), ...feed.articles]
      .filter((article, index, list) => list.findIndex((candidate) =>
        candidate.headline === article.headline && candidate.sourceUrl === article.sourceUrl,
      ) === index);
    if (player.name.trim().length < 3) continue;
    const teammates = playersByTeam.get(player.team) || [];
    const matching = articles
      .filter((article) => {
        const published = Date.parse(article.publishedAt);
        const classification = classifyHeadline(article.headline);
        return (
          articleMentionsPlayer(article, player, teammates) &&
          Number.isFinite(published) &&
          now - published <= maximumAge(classification.category)
        );
      })
      .slice(0, 6)
      .map((article): Omit<ExternalNewsSignal, 'verification' | 'corroboratingSourceCount'> => {
        const tier = sourceTier(article.source, article.sourceUrl);
        const classification = classifyHeadline(article.headline);
        return {
          ...article,
          tier,
          category: classification.category,
          severity:
            tier === 'secondary' && classification.severity === 'high'
              ? 'medium'
              : classification.severity,
        };
      });
    const verified = verifySignals(matching);
    const resolved = resolveSignalConflicts(player, verified);
    conflicts.push(...resolved.conflicts);
    if (resolved.signals.length) result.set(player.id, clusterNewsSignals(resolved.signals));
  }

  const checkedIds = new Set([...individuallyCheckedIds, ...officialClubCheckedIds]);
  const ok = candidates.length === 0 ? true : checkedIds.size / candidates.length >= 0.5;
  return {
    signals: result,
    // Per-player success prevents one failed feed from being misreported as a
    // successful check merely because other parallel requests worked.
    checkedIds: ok ? checkedIds : new Set<number>(),
    officialClubCheckedIds: ok ? officialClubCheckedIds : new Set<number>(),
    officialClubFeedsChecked: officialFeeds.filter(({ feed }) => feed.ok).length,
    officialClubFeedsAttempted: officialFeeds.length,
    officialClubSignals: [...result.values()].flat().filter((signal) => signal.tier === 'official').length,
    conflicts,
    checkedAt: new Date().toISOString(),
    ok,
  };
}

export function applyExternalNewsSignals(
  players: ModelPlayer[],
  scan: ExternalNewsScan,
) {
  return players.map((player) => {
    const externalNews = scan.signals.get(player.id) || [];
    const newsCheckedAt = scan.checkedIds.has(player.id) ? scan.checkedAt : undefined;
    const officialClubNewsCheckedAt = scan.officialClubCheckedIds.has(player.id)
      ? scan.checkedAt
      : undefined;
    const trustedHigh = externalNews.some(
      (signal) => signal.severity === 'high' && (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
    );
    const trustedMedium = externalNews.some(
      (signal) => signal.severity === 'medium' && (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
    );
    const singleReliableWarning = externalNews.some(
      (signal) => signal.tier === 'reliable' && signal.verification === 'single-source' && signal.severity !== 'low',
    );
    if (!externalNews.length) return newsCheckedAt
      ? { ...player, newsCheckedAt, officialClubNewsCheckedAt }
      : player;

    const projectionFactor = trustedHigh ? 0.45 : trustedMedium ? 0.72 : singleReliableWarning ? 0.9 : 1;
    // Keep every availability-dependent field consistent. Previously the
    // points/minutes were reduced while appearanceProbability stayed high,
    // allowing warned players back into captain, lineup and bench models.
    const appearanceProbability = Number(
      Math.max(0.03, Math.min(1, player.appearanceProbability * projectionFactor)).toFixed(3),
    );
    const expectedPoints = Number(
      (player.expectedPoints * projectionFactor).toFixed(2),
    );
    const risk = trustedHigh
      ? Math.max(player.risk, 62)
      : trustedMedium
        ? Math.max(player.risk, 42)
        : singleReliableWarning
          ? Math.max(player.risk, 28)
          : player.risk;
    const riskLevel = risk >= 60 ? 'high' as const : risk >= 30 ? 'medium' as const : 'low' as const;

    return {
      ...player,
      externalNews,
      newsCheckedAt,
      officialClubNewsCheckedAt,
      expectedPoints,
      appearanceProbability,
      projection: {
        ...player.projection,
        next1: Number((player.projection.next1 * projectionFactor).toFixed(2)),
        next3: Number((player.projection.next3 * projectionFactor).toFixed(2)),
        next5: Number((player.projection.next5 * projectionFactor).toFixed(2)),
        next8: Number((player.projection.next8 * projectionFactor).toFixed(2)),
        byEvent: player.projection.byEvent.map((item) => ({
          ...item,
          points: Number((item.points * projectionFactor).toFixed(2)),
        })),
      },
      valueScore: Number(
        (expectedPoints / Math.max(player.price, 1)).toFixed(2),
      ),
      confidence: trustedHigh
        ? Math.min(player.confidence, 45)
        : trustedMedium
          ? Math.min(player.confidence, 60)
          : player.confidence,
      starterConfidence: trustedHigh
        ? Math.min(player.starterConfidence, 38)
        : trustedMedium
          ? Math.min(player.starterConfidence, 55)
          : player.starterConfidence,
      predictedMinutes: trustedHigh
        ? Math.min(player.predictedMinutes, 40)
        : trustedMedium
          ? Math.min(player.predictedMinutes, 52)
          : player.predictedMinutes,
      risk,
      riskBreakdown: player.riskBreakdown ? {
        ...player.riskBreakdown,
        news: Math.max(player.riskBreakdown.news, risk),
        total: Math.max(player.riskBreakdown.total, risk),
        level: riskLevel,
      } : player.riskBreakdown,
    };
  });
}

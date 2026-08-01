import type { ExternalNewsSignal, ModelPlayer } from '@/types/fpl';

const MAX_CANDIDATES_PER_POSITION = 6;
const MAX_VERIFICATION_CANDIDATES = 48;

export type ExternalNewsScan = {
  signals: Map<number, ExternalNewsSignal[]>;
  checkedIds: Set<number>;
  checkedAt: string;
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

function sourceTier(source: string, sourceUrl: string): ExternalNewsSignal['tier'] {
  const text = `${source} ${sourceUrl}`.toLowerCase();
  if (
    text.includes('premierleague.com') ||
    [
      'arsenal.com', 'avfc.co.uk', 'afcb.co.uk', 'brentfordfc.com',
      'brightonandhovealbion.com', 'chelseafc.com', 'cpfc.co.uk',
      'evertonfc.com', 'fulhamfc.com', 'liverpoolfc.com', 'mancity.com',
      'manutd.com', 'nufc.co.uk', 'safc.com', 'tottenhamhotspur.com',
      'ccfc.co.uk', 'hullcitytigers.com', 'itfc.co.uk', 'leedsunited.com',
      'nottinghamforest.co.uk',
      'whufc.com', 'wolves.co.uk', 'burnleyfootballclub.com',
      'lcfc.com', 'southamptonfc.com', 'wba.co.uk', 'watfordfc.com',
      'sufc.co.uk', 'swanseacity.com', 'thefa.com', 'uefa.com', 'fifa.com',
    ].some((domain) => text.includes(domain))
  ) return 'official';
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

function classify(headline: string): Pick<ExternalNewsSignal, 'category' | 'severity'> {
  const text = headline.toLowerCase();
  if (/injur|ruled out|sidelined|misses|doubt/.test(text)) {
    return { category: 'injury', severity: /ruled out|sidelined|misses/.test(text) ? 'high' : 'medium' };
  }
  if (/set to leave|expected to leave|agrees terms|transfer talks|wants exit/.test(text)) {
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
  return { category: 'availability', severity: 'low' };
}

function maximumAge(category: ExternalNewsSignal['category']) {
  if (category === 'injury' || category === 'transfer') return 14 * 24 * 60 * 60 * 1000;
  if (category === 'rotation' || category === 'availability') return 4 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function sourceKey(signal: Pick<ExternalNewsSignal, 'source' | 'url'>) {
  try {
    return new URL(signal.url).hostname.replace(/^www\./, '');
  } catch {
    return signal.source.trim().toLowerCase();
  }
}

function verifySignals(
  signals: Omit<ExternalNewsSignal, 'verification' | 'corroboratingSourceCount'>[],
): ExternalNewsSignal[] {
  return signals.map((signal) => {
    const relatedSources = new Set(
      signals
        .filter((candidate) => candidate.category === signal.category && candidate.tier !== 'secondary')
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

async function fetchFeed(query: string) {
  try {
    const response = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`,
      {
        next: { revalidate: 1800 },
        signal: AbortSignal.timeout(3500),
      },
    );
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
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
  } catch {
    return [];
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
  const articlesByPlayer = await Promise.all(
    candidates.map(async (player) => ({
      player,
      articles: await fetchFeed(
        `"${player.name}" "${player.team}" (injury OR transfer OR "team news" OR rotation OR "set to leave" OR friendly OR preseason OR "international duty" OR fatigue)`,
      ),
    })),
  );
  const now = Date.now();
  const result = new Map<number, ExternalNewsSignal[]>();

  for (const { player, articles } of articlesByPlayer) {
    const name = player.name.toLowerCase();
    if (name.length < 4) continue;
    const matching = articles
      .filter((article) => {
        const published = Date.parse(article.publishedAt);
        const classification = classify(article.headline);
        return (
          article.headline.toLowerCase().includes(name) &&
          Number.isFinite(published) &&
          now - published <= maximumAge(classification.category)
        );
      })
      .slice(0, 4)
      .map((article): Omit<ExternalNewsSignal, 'verification' | 'corroboratingSourceCount'> => {
        const tier = sourceTier(article.source, article.sourceUrl);
        const classification = classify(article.headline);
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
    if (verified.length) result.set(player.id, verified);
  }

  return {
    signals: result,
    checkedIds: new Set(candidates.map((player) => player.id)),
    checkedAt: new Date().toISOString(),
  };
}

export function applyExternalNewsSignals(
  players: ModelPlayer[],
  scan: ExternalNewsScan,
) {
  return players.map((player) => {
    const externalNews = scan.signals.get(player.id) || [];
    const newsCheckedAt = scan.checkedIds.has(player.id) ? scan.checkedAt : undefined;
    const trustedHigh = externalNews.some(
      (signal) => signal.severity === 'high' && (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
    );
    const trustedMedium = externalNews.some(
      (signal) => signal.severity === 'medium' && (signal.verification === 'confirmed' || signal.verification === 'corroborated'),
    );
    const singleReliableWarning = externalNews.some(
      (signal) => signal.tier === 'reliable' && signal.verification === 'single-source' && signal.severity !== 'low',
    );
    if (!externalNews.length) return newsCheckedAt ? { ...player, newsCheckedAt } : player;

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

    return {
      ...player,
      externalNews,
      newsCheckedAt,
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
      risk: trustedHigh
        ? Math.max(player.risk, 62)
        : trustedMedium
          ? Math.max(player.risk, 42)
          : singleReliableWarning
            ? Math.max(player.risk, 28)
            : player.risk,
    };
  });
}

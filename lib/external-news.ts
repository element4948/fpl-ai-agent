import type { ExternalNewsSignal, ModelPlayer } from '@/types/fpl';

const MAX_CANDIDATES_PER_POSITION = 6;

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
    ].some((domain) => text.includes(domain))
  ) return 'official';
  if (
    text.includes('bbc') ||
    text.includes('sky sports') ||
    text.includes('the athletic') ||
    text.includes('guardian') ||
    text.includes('reuters') ||
    text.includes('fabrizio romano')
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
  return { category: 'availability', severity: 'low' };
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

export async function getExternalNewsSignals(players: ModelPlayer[]) {
  const candidates = ['GKP', 'DEF', 'MID', 'FWD'].flatMap((position) =>
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
  const articlesByPlayer = await Promise.all(
    candidates.map(async (player) => ({
      player,
      articles: await fetchFeed(
        `"${player.name}" "${player.team}" (injury OR transfer OR "team news" OR rotation OR "set to leave")`,
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
        return (
          article.headline.toLowerCase().includes(name) &&
          Number.isFinite(published) &&
          now - published <= 8 * 24 * 60 * 60 * 1000
        );
      })
      .slice(0, 4)
      .map((article): ExternalNewsSignal => {
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
    if (matching.length) result.set(player.id, matching);
  }

  return result;
}

export function applyExternalNewsSignals(
  players: ModelPlayer[],
  signals: Map<number, ExternalNewsSignal[]>,
) {
  return players.map((player) => {
    const externalNews = signals.get(player.id) || [];
    const trustedHigh = externalNews.some(
      (signal) => signal.severity === 'high' && signal.tier !== 'secondary',
    );
    const trustedMedium = externalNews.some(
      (signal) => signal.severity === 'medium' && signal.tier !== 'secondary',
    );
    if (!externalNews.length) return player;

    const projectionFactor = trustedHigh ? 0.45 : trustedMedium ? 0.72 : 1;
    const expectedPoints = Number(
      (player.expectedPoints * projectionFactor).toFixed(2),
    );

    return {
      ...player,
      externalNews,
      expectedPoints,
      projection: {
        ...player.projection,
        next1: Number((player.projection.next1 * projectionFactor).toFixed(2)),
        next3: Number((player.projection.next3 * projectionFactor).toFixed(2)),
        next5: Number((player.projection.next5 * projectionFactor).toFixed(2)),
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
          : player.risk,
    };
  });
}

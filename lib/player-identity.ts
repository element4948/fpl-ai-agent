export type IdentityCandidate = {
  id: number;
  name: string;
  fullName?: string;
};

export type IdentityMatch =
  | {
      status: 'matched';
      candidate: IdentityCandidate;
      confidence: number;
      method: 'exact-full-name' | 'exact-display-name' | 'team-name-score';
    }
  | {
      status: 'ambiguous' | 'unmatched';
      confidence: number;
      method: 'none';
    };

export function normalizePlayerName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string) {
  return normalizePlayerName(value).split(' ').filter(Boolean);
}

function scoreCandidate(apiName: string, candidate: IdentityCandidate) {
  const api = normalizePlayerName(apiName);
  const display = normalizePlayerName(candidate.name);
  const full = normalizePlayerName(candidate.fullName || '');
  if (!api || !display) return { score: 0, method: 'none' as const };
  if (full && api === full) return { score: 100, method: 'exact-full-name' as const };
  if (api === display) return { score: 98, method: 'exact-display-name' as const };

  const apiTokens = tokens(apiName);
  const candidateTokens = tokens(candidate.fullName || candidate.name);
  const displayTokens = tokens(candidate.name);
  if (!apiTokens.length || !candidateTokens.length) return { score: 0, method: 'none' as const };

  const apiLast = apiTokens.at(-1);
  const candidateLast = candidateTokens.at(-1);
  const lastNameMatch = Boolean(apiLast && candidateLast && apiLast === candidateLast);
  const firstNameMatch = apiTokens[0] === candidateTokens[0];
  const firstInitialMatch =
    !firstNameMatch &&
    ((apiTokens[0]?.length === 1 && candidateTokens[0]?.startsWith(apiTokens[0])) ||
      (candidateTokens[0]?.length === 1 && apiTokens[0]?.startsWith(candidateTokens[0])));
  const shared = new Set(apiTokens.filter((token) => candidateTokens.includes(token))).size;
  const overlap = shared / Math.max(apiTokens.length, candidateTokens.length);
  const displayTokenMatch = displayTokens.length > 0 && displayTokens.every((token) => apiTokens.includes(token));

  const score =
    (lastNameMatch ? 45 : 0) +
    (firstNameMatch ? 20 : 0) +
    (firstInitialMatch ? 12 : 0) +
    overlap * 35 +
    (displayTokenMatch ? 10 : 0);
  return { score: Math.min(97, Math.round(score)), method: 'team-name-score' as const };
}

/**
 * Candidates must already be restricted to the API player's current team.
 * A surname-only match is accepted only when unique and comfortably ahead of
 * the second candidate. Ambiguous identities are rejected rather than merged.
 */
export function matchPlayerIdentity(
  apiName: string,
  candidates: IdentityCandidate[],
): IdentityMatch {
  const ranked = candidates
    .map((candidate) => ({ candidate, ...scoreCandidate(apiName, candidate) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 70) {
    return { status: 'unmatched', confidence: best?.score || 0, method: 'none' };
  }
  const second = ranked[1];
  if (
    second &&
    best.score - second.score < 12 &&
    (best.score < 98 || second.score === best.score)
  ) {
    return { status: 'ambiguous', confidence: best.score, method: 'none' };
  }
  return {
    status: 'matched',
    candidate: best.candidate,
    confidence: best.score,
    method: best.method === 'none' ? 'team-name-score' : best.method,
  };
}

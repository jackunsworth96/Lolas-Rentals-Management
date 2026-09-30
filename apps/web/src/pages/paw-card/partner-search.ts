/**
 * Close-match search for Paw Card partners.
 * Exact text still ranks first. Nearby spellings, missing spaces, and
 * punctuation differences (Ver-de / verde, Lola's / lolas) also match.
 */

const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'of', 'at', 'in', 'on', 'for', 'to']);

export interface PartnerSearchFields {
  name?: string | null;
  description?: string | null;
  discount_headline?: string | null;
  category?: string | null;
}

/** Higher is a closer match. 0 means the partner should be hidden. */
export function partnerSearchScore(query: string, partner: PartnerSearchFields): number {
  const queryNorm = normalizeSearchText(query);
  if (!queryNorm) return 1;

  const queryCompact = queryNorm.replace(/ /g, '');
  const name = fieldQuality(queryNorm, queryCompact, partner.name, 'fuzzy');
  const headline = fieldQuality(queryNorm, queryCompact, partner.discount_headline, 'fuzzy');
  const category = fieldQuality(queryNorm, queryCompact, partner.category, 'fuzzy');
  const description = fieldQuality(queryNorm, queryCompact, partner.description, 'contains');

  return Math.max(
    name > 0 ? 300 + name : 0,
    headline > 0 ? 150 + headline : 0,
    category > 0 ? 80 + category : 0,
    description > 0 ? 40 + description : 0,
  );
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

type MatchMode = 'fuzzy' | 'contains';

function fieldQuality(
  queryNorm: string,
  queryCompact: string,
  raw: string | null | undefined,
  mode: MatchMode,
): number {
  const fieldNorm = normalizeSearchText(raw ?? '');
  if (!fieldNorm) return 0;

  const fieldCompact = fieldNorm.replace(/ /g, '');
  if (fieldNorm === queryNorm) return 100;
  if (fieldNorm.startsWith(queryNorm)) return 92;
  if (fieldNorm.includes(queryNorm)) return 84;
  if (queryCompact.length >= 3 && fieldCompact.includes(queryCompact)) return 78;

  const qTokens = meaningfulTokens(queryNorm);
  if (qTokens.length === 0) return 0;
  const fTokens = fieldNorm.split(' ').filter(Boolean);

  if (mode === 'contains') {
    return qTokens.every((token) => token.length >= 2 && fieldNorm.includes(token)) ? 64 : 0;
  }

  return Math.max(tokensQuality(qTokens, fTokens), joinedQuality(queryCompact, fTokens));
}

function meaningfulTokens(normalized: string): string[] {
  const tokens = normalized.split(' ').filter(Boolean);
  const kept = tokens.filter((token) => !STOP_WORDS.has(token));
  return kept.length > 0 ? kept : tokens;
}

type TokenKind = 'exact' | 'prefix' | 'contains' | 'edit';

interface TokenHit {
  index: number;
  distance: number;
  kind: TokenKind;
}

function tokensQuality(qTokens: string[], fTokens: string[]): number {
  const used = new Set<number>();
  let edits = 0;
  let fuzzy = false;

  for (const queryToken of qTokens) {
    const hit = bestTokenHit(queryToken, fTokens, used);
    if (!hit) return 0;
    used.add(hit.index);
    if (hit.kind === 'edit') {
      fuzzy = true;
      edits += hit.distance;
    }
  }

  if (!fuzzy) return 70;
  return Math.max(40, 62 - edits * 6);
}

function bestTokenHit(queryToken: string, tokens: string[], used: Set<number>): TokenHit | null {
  let best: TokenHit | null = null;

  for (let index = 0; index < tokens.length; index++) {
    if (used.has(index)) continue;
    const target = tokens[index] ?? '';
    const hit = tokenHit(queryToken, target, index);
    if (hit && (!best || hitBeats(hit, best))) best = hit;
  }

  return best;
}

function tokenHit(queryToken: string, target: string, index: number): TokenHit | null {
  if (target === queryToken) return { index, distance: 0, kind: 'exact' };
  if (queryToken.length >= 2 && target.startsWith(queryToken)) {
    return { index, distance: 0, kind: 'prefix' };
  }
  if (queryToken.length >= 3 && target.includes(queryToken)) {
    return { index, distance: 0, kind: 'contains' };
  }

  const limit = editLimit(queryToken.length);
  if (limit === 0 || Math.abs(target.length - queryToken.length) > limit) return null;

  const distance = boundedEditDistance(queryToken, target, limit);
  if (!isAllowedEdit(queryToken, target, distance)) return null;
  return { index, distance, kind: 'edit' };
}

function hitBeats(next: TokenHit, current: TokenHit): boolean {
  const rank: Record<TokenKind, number> = { exact: 3, prefix: 2, contains: 1, edit: 0 };
  if (rank[next.kind] !== rank[current.kind]) return rank[next.kind] > rank[current.kind];
  return next.distance < current.distance;
}

/** Typo across a space, e.g. "brunchspt" against "Brunch Spot". */
function joinedQuality(queryCompact: string, tokens: string[]): number {
  const limit = editLimit(queryCompact.length);
  if (limit === 0 || tokens.length === 0) return 0;

  let best = limit + 1;
  for (let start = 0; start < tokens.length; start++) {
    let joined = '';
    for (let end = start; end < tokens.length; end++) {
      joined += tokens[end];
      if (joined.length > queryCompact.length + limit) break;
      if (Math.abs(joined.length - queryCompact.length) > limit) continue;
      const distance = boundedEditDistance(queryCompact, joined, limit);
      if (distance === 0 || isAllowedEdit(queryCompact, joined, distance)) {
        if (distance < best) best = distance;
      }
    }
  }

  if (best > limit) return 0;
  if (best === 0) return 76;
  return Math.max(40, 58 - best * 6);
}

function editLimit(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

/**
 * Short words only allow a missing letter, an extra letter, or a swapped pair.
 * That keeps "haol" on Haole and "sruf" on Surf, without "food" matching "good".
 * A single wrong letter is allowed once the word is 6 characters or longer.
 */
function isAllowedEdit(query: string, target: string, distance: number): boolean {
  const limit = editLimit(query.length);
  if (distance <= 0 || distance > limit) return false;
  const lenDiff = Math.abs(query.length - target.length);
  if (lenDiff > distance) return false;
  if (lenDiff === distance) return true;
  if (distance === 1 && query.length === target.length && isAdjacentSwap(query, target)) return true;
  return query.length >= 6;
}

function isAdjacentSwap(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i >= a.length - 1) return false;
  if (a[i] !== b[i + 1] || a[i + 1] !== b[i]) return false;
  for (let k = i + 2; k < a.length; k++) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Edit distance with adjacent-letter swaps. Returns limit + 1 when the
 * distance is greater than `limit`.
 */
function boundedEditDistance(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (Math.abs(aLen - bLen) > limit) return limit + 1;

  let prev2 = new Array<number>(bLen + 1).fill(0);
  let prev = new Array<number>(bLen + 1).fill(0);
  let curr = new Array<number>(bLen + 1).fill(0);
  for (let j = 0; j <= bLen; j++) prev[j] = j;

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    let rowMin = i;
    const aChar = a[i - 1];
    const aPrev = a[i - 2];

    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b[j - 1] ? 0 : 1;
      let distance = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && aChar === b[j - 2] && aPrev === b[j - 1]) {
        distance = Math.min(distance, prev2[j - 2] + 1);
      }
      curr[j] = distance;
      if (distance < rowMin) rowMin = distance;
    }

    if (rowMin > limit) return limit + 1;

    const aged = prev2;
    prev2 = prev;
    prev = curr;
    curr = aged;
  }

  return prev[bLen] > limit ? limit + 1 : prev[bLen];
}

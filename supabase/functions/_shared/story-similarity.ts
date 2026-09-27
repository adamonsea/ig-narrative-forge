/**
 * Server-side story similarity + strict newsletter deduplication.
 *
 * Mirrors src/lib/titleSimilarity.ts so the pipeline and the UI agree on what
 * counts as "the same event". Email uses a stricter threshold than the feed:
 * a newsletter should never carry two takes on one event, but the feed itself
 * keeps genuinely new angles with distinct headlines.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
  'has', 'have', 'had', 'this', 'that', 'will', 'can', 'not', 'its',
  'been', 'were', 'after', 'before', 'into', 'over', 'than', 'about',
  'up', 'out', 'new', 'says', 'said', 'also', 'could', 'would', 'more',
]);

function normalizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function extractEntities(title: string): Set<string> {
  const tokens = title.split(/\s+/);
  const entities = new Set<string>();
  tokens.forEach((raw, index) => {
    const word = raw.replace(/[^A-Za-z'’-]/g, '');
    if (word.length < 3) return;
    if (!/^[A-Z]/.test(word)) return;
    if (index === 0) return;
    const lower = word.toLowerCase();
    if (STOP_WORDS.has(lower)) return;
    entities.add(lower);
  });
  return entities;
}

function extractNumbers(title: string): Set<string> {
  const matches = title.match(/\d[\d,.]*/g) || [];
  return new Set(matches.map((m) => m.replace(/[,.]$/, '').replace(/,/g, '')));
}

function setOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap++;
  return overlap / Math.min(a.size, b.size);
}

export interface SimilarityBreakdown {
  words: number;
  entities: number;
  numbers: number;
  score: number;
}

export function storySimilarity(titleA: string, titleB: string): SimilarityBreakdown {
  const words = setOverlapRatio(normalizeTitle(titleA), normalizeTitle(titleB));
  const entities = setOverlapRatio(extractEntities(titleA), extractEntities(titleB));
  const numbers = setOverlapRatio(extractNumbers(titleA), extractNumbers(titleB));
  const score = Math.min(1, words * 0.7 + entities * 0.2 + numbers * 0.1);
  return { words, entities, numbers, score };
}

/** Newsletter: strict. One event, one slot. */
export const EMAIL_DUPLICATE_THRESHOLD = 0.45;
/** Feed / publishing: generous, so developing stories with fresh angles survive. */
export const PUBLISH_DUPLICATE_THRESHOLD = 0.7;

export interface DedupeCandidate {
  headline: string;
  [key: string]: unknown;
}

/**
 * Keep the first (best ranked) story of each event group.
 * `existing` lets a later batch (fallback stories) be checked against picks
 * that were already made.
 */
export function dedupeByEvent<T extends DedupeCandidate>(
  candidates: T[],
  threshold = EMAIL_DUPLICATE_THRESHOLD,
  existing: T[] = []
): { kept: T[]; dropped: Array<{ candidate: T; matched: string; score: number }> } {
  const kept: T[] = [];
  const dropped: Array<{ candidate: T; matched: string; score: number }> = [];
  const compareAgainst = [...existing];

  for (const candidate of candidates) {
    let match: { title: string; score: number } | null = null;
    for (const chosen of compareAgainst) {
      const { score } = storySimilarity(candidate.headline, chosen.headline);
      if (score >= threshold && (!match || score > match.score)) {
        match = { title: chosen.headline, score };
      }
    }
    if (match) {
      dropped.push({ candidate, matched: match.title, score: match.score });
    } else {
      kept.push(candidate);
      compareAgainst.push(candidate);
    }
  }

  return { kept, dropped };
}

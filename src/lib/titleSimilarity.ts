/**
 * Title-similarity utilities for duplicate detection in Arrivals.
 *
 * Matching combines three signals so the same event reported by different
 * publications is caught, while genuinely different stories that happen to
 * share common words are not:
 *   1. word overlap (the original signal)
 *   2. shared proper nouns / named entities
 *   3. shared numbers (figures, dates, ages, amounts)
 * Candidates must also be published within a time window of each other.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
  'has', 'have', 'had', 'this', 'that', 'will', 'can', 'not', 'its',
  'been', 'were', 'after', 'before', 'into', 'over', 'than', 'about',
  'up', 'out', 'new', 'says', 'said', 'also', 'could', 'would', 'more',
]);

/** Normalize a title to a set of meaningful words */
function normalizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/** Proper nouns: capitalised words that aren't at the very start of the title */
function extractEntities(title: string): Set<string> {
  const tokens = title.split(/\s+/);
  const entities = new Set<string>();
  tokens.forEach((raw, index) => {
    const word = raw.replace(/[^A-Za-z'’-]/g, '');
    if (word.length < 3) return;
    if (!/^[A-Z]/.test(word)) return;
    // Skip the first word: nearly every headline starts capitalised.
    if (index === 0) return;
    const lower = word.toLowerCase();
    if (STOP_WORDS.has(lower)) return;
    entities.add(lower);
  });
  return entities;
}

/** Numbers appearing in a title (ages, amounts, dates, counts) */
function extractNumbers(title: string): Set<string> {
  const matches = title.match(/\d[\d,.]*/g) || [];
  return new Set(matches.map(m => m.replace(/[,.]$/, '').replace(/,/g, '')));
}

function setOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap++;
  return overlap / Math.min(a.size, b.size);
}

/** Calculate word-overlap similarity between two titles (0-1) */
export function titleSimilarity(titleA: string, titleB: string): number {
  return setOverlapRatio(normalizeTitle(titleA), normalizeTitle(titleB));
}

export interface SimilarityBreakdown {
  words: number;
  entities: number;
  numbers: number;
  score: number;
}

/**
 * Combined similarity across words, named entities and numbers.
 * Words carry the most weight; entities and numbers act as confirmation,
 * which is what separates "same event, different paper" from coincidence.
 */
export function storySimilarity(titleA: string, titleB: string): SimilarityBreakdown {
  const words = setOverlapRatio(normalizeTitle(titleA), normalizeTitle(titleB));
  const entities = setOverlapRatio(extractEntities(titleA), extractEntities(titleB));
  const numbers = setOverlapRatio(extractNumbers(titleA), extractNumbers(titleB));

  // Entities/numbers only lift the score when they exist in both titles.
  const score = Math.min(1, words * 0.7 + entities * 0.2 + numbers * 0.1);
  return { words, entities, numbers, score };
}

export interface DuplicateInfo {
  duplicateGroupId: string;
  isDuplicateLeader: boolean;
  similarCount: number;
  similarTitles: string[];
  /** All article ids in the group, oldest first (the leader is first) */
  memberIds: string[];
  leaderId: string;
}

export interface DuplicateOptions {
  /** Combined score required to treat two stories as the same event */
  threshold?: number;
  /** Only compare stories published within this many hours of each other */
  windowHours?: number;
}

/**
 * Groups articles reporting the same event.
 * Returns a Map from article ID -> DuplicateInfo.
 * Leader = oldest article in each group (first to report it).
 */
export function detectDuplicateGroups<T extends { id: string; title: string; created_at: string }>(
  articles: T[],
  options: number | DuplicateOptions = {}
): Map<string, DuplicateInfo> {
  const opts: DuplicateOptions = typeof options === 'number' ? { threshold: options } : options;
  const threshold = opts.threshold ?? 0.7;
  const windowMs = (opts.windowHours ?? 72) * 60 * 60 * 1000;

  const result = new Map<string, DuplicateInfo>();
  const assigned = new Set<number>();
  const times = articles.map(a => new Date(a.created_at).getTime());

  for (let i = 0; i < articles.length; i++) {
    if (assigned.has(i)) continue;

    const group: number[] = [i];
    assigned.add(i);

    for (let j = i + 1; j < articles.length; j++) {
      if (assigned.has(j)) continue;

      const gapOk =
        !Number.isFinite(times[i]) ||
        !Number.isFinite(times[j]) ||
        Math.abs(times[i] - times[j]) <= windowMs;
      if (!gapOk) continue;

      const { score, words } = storySimilarity(articles[i].title, articles[j].title);
      // Require real wording overlap as well as a passing combined score,
      // so entity/number agreement alone can never group unrelated stories.
      if (score >= threshold && words >= 0.5) {
        group.push(j);
        assigned.add(j);
      }
    }

    if (group.length < 2) continue;

    // Sort group by created_at ascending -> oldest = leader
    group.sort((a, b) => times[a] - times[b]);

    const memberIds = group.map(idx => articles[idx].id);
    const groupId = memberIds[0];

    for (let k = 0; k < group.length; k++) {
      const art = articles[group[k]];
      result.set(art.id, {
        duplicateGroupId: groupId,
        isDuplicateLeader: k === 0,
        similarCount: group.length - 1,
        similarTitles: group
          .filter((_, idx) => idx !== k)
          .map(idx => articles[idx].title),
        memberIds,
        leaderId: groupId,
      });
    }
  }

  return result;
}

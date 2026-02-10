/**
 * Title-similarity utilities for duplicate detection in Arrivals.
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

/** Calculate word-overlap similarity between two titles (0-1) */
export function titleSimilarity(titleA: string, titleB: string): number {
  const wordsA = normalizeTitle(titleA);
  const wordsB = normalizeTitle(titleB);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }

  return overlap / Math.min(wordsA.size, wordsB.size);
}

export interface DuplicateInfo {
  duplicateGroupId: string;
  isDuplicateLeader: boolean;
  similarCount: number;
  similarTitles: string[];
}

/**
 * Groups articles by title similarity (>= 0.7 threshold).
 * Returns a Map from article ID -> DuplicateInfo.
 * Leader = oldest article in each group.
 */
export function detectDuplicateGroups<T extends { id: string; title: string; created_at: string }>(
  articles: T[],
  threshold = 0.7
): Map<string, DuplicateInfo> {
  const result = new Map<string, DuplicateInfo>();
  const assigned = new Set<number>();

  for (let i = 0; i < articles.length; i++) {
    if (assigned.has(i)) continue;

    const group: number[] = [i];
    assigned.add(i);

    for (let j = i + 1; j < articles.length; j++) {
      if (assigned.has(j)) continue;
      const sim = titleSimilarity(articles[i].title, articles[j].title);
      if (sim >= threshold) {
        group.push(j);
        assigned.add(j);
      }
    }

    if (group.length < 2) continue;

    // Sort group by created_at ascending -> oldest = leader
    group.sort((a, b) =>
      new Date(articles[a].created_at).getTime() - new Date(articles[b].created_at).getTime()
    );

    const groupId = articles[group[0]].id;

    for (let k = 0; k < group.length; k++) {
      const art = articles[group[k]];
      result.set(art.id, {
        duplicateGroupId: groupId,
        isDuplicateLeader: k === 0,
        similarCount: group.length - 1,
        similarTitles: group
          .filter((_, idx) => idx !== k)
          .map(idx => articles[idx].title),
      });
    }
  }

  return result;
}

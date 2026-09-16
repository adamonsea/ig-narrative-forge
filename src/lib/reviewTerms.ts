/**
 * Shared guard for review vocabulary: the feed's own name and ordinary news
 * furniture must never be presented as unusual, rising or recurring.
 * Applied on read too, so reviews saved before the filter existed stay clean.
 */
export const GENERIC_REVIEW_TERMS = new Set([
  'police', 'council', 'councillor', 'councillors', 'borough', 'district', 'county', 'parish',
  'court', 'magistrates', 'crown', 'jailed', 'sentenced', 'charged', 'arrested', 'investigation',
  'hospital', 'ambulance', 'paramedics', 'nhs', 'firefighters', 'coastguard', 'lifeboat',
  'mayor', 'authority', 'government', 'parliament', 'election', 'labour', 'conservative',
  'liberal', 'democrats', 'reform', 'green', 'party', 'mp', 'mps',
  'news', 'update', 'updates', 'live', 'video', 'watch', 'photos', 'gallery', 'plans', 'plan',
  'warning', 'appeal', 'death', 'died', 'dead', 'crash', 'fire', 'road', 'roads', 'town',
  'area', 'street', 'centre', 'center', 'service', 'services', 'scheme', 'project', 'report',
  'meeting', 'decision', 'review', 'consultation', 'residents', 'community', 'local', 'public',
  'man', 'woman', 'men', 'women', 'people', 'family', 'boy', 'girl', 'teenager', 'driver',
  'week', 'weekend', 'month', 'year', 'today', 'tonight', 'east', 'west', 'north', 'south',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'christmas', 'summer', 'winter', 'spring', 'autumn', 'easter',
  'uk', 'britain', 'england', 'english', 'british',
  'bill', 'bills', 'act', 'reading', 'amendment', 'commons', 'lords', 'minister', 'ministers',
  'secretary', 'devolution', 'empowerment', 'committee',
  'best', 'top', 'new', 'here', 'what', 'when', 'where', 'more', 'after', 'over',
]);

/** Lowercase words with possessives and hyphens stripped. */
export const termWords = (term: string) =>
  term
    .toLowerCase()
    .replace(/[\u2019']s\b/g, '')
    .replace(/[\u2019']/g, '')
    .split(/[\s-]+/)
    .filter(Boolean);

/** Build a matcher for terms that are the feed's own name or plain furniture. */
export const makeTermGuard = (topicName?: string, region?: string) => {
  const own = new Set(
    `${topicName ?? ''} ${region ?? ''}`
      .split(/\W+/)
      .filter((w) => w.length > 3)
      .map((w) => w.toLowerCase())
  );
  return (term: string) => {
    const ws = termWords(term);
    if (ws.length === 0) return true;
    if (ws.some((w) => own.has(w))) return true;
    return ws.every((w) => GENERIC_REVIEW_TERMS.has(w));
  };
};

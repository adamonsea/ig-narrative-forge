/**
 * Central registry for feed card positions
 * 
 * This file defines all non-story card positions in the feed to prevent collisions
 * and make the system scalable. Each card type has either:
 * - Repeating positions: defined by interval and offset (position = interval * n + offset)
 * - Single positions: appears once at a specific index
 * 
 * COLLISION DETECTION: Before adding a new card type, use getPositionCollisions()
 * to verify no overlaps exist within the first 100 positions.
 */

export interface RepeatingCardPosition {
  type: 'repeating';
  interval: number;
  offset: number;
  description: string;
}

export interface SingleCardPosition {
  type: 'single';
  position: number;
  description: string;
}

/** Fixed leading positions, then a repeating pattern (interval * n + offset). */
export interface SequenceCardPosition {
  type: 'sequence';
  leading: number[];
  interval: number;
  offset: number;
  description: string;
}

export type CardPosition = RepeatingCardPosition | SingleCardPosition | SequenceCardPosition;

/**
 * Feed card position registry
 * 
 * Position allocation strategy:
 * - Use prime-adjacent intervals to minimize collisions
 * - Stagger offsets to spread cards evenly
 * - Single cards use positions that don't conflict with repeating patterns
 */
export const FEED_CARD_POSITIONS = {
  // Sentiment cards: positions 6, 12, 18, 24...
  sentiment: {
    type: 'repeating',
    interval: 6,
    offset: 0,
    description: 'Keyword sentiment analysis cards'
  } as RepeatingCardPosition,

  // Automated insight cards: positions 3, 10, 17, 24...
  automatedInsight: {
    type: 'repeating',
    interval: 7,
    offset: 3,
    description: 'Story momentum and social proof cards'
  } as RepeatingCardPosition,

  // Quiz cards: positions 5, 14, 23, 32...
  quiz: {
    type: 'repeating',
    interval: 9,
    offset: 5,
    description: 'Interactive quiz questions'
  } as RepeatingCardPosition,

  // Parliamentary insight cards (MAJOR votes only): positions 8, 21, 34...
  parliamentary: {
    type: 'repeating',
    interval: 13,
    offset: 8,
    description: 'Major MP voting records (rebellions, close votes, high relevance)'
  } as RepeatingCardPosition,

  // Parliamentary weekly digest: position 12 (once per feed load)
  parliamentaryDigest: {
    type: 'single',
    position: 12,
    description: 'This Week in Parliament digest card'
  } as SingleCardPosition,

  // Community pulse: positions 4, 19, 34...
  communityPulse: {
    type: 'repeating',
    interval: 15,
    offset: 4,
    description: 'Reddit community discussion highlights'
  } as RepeatingCardPosition,

  // Flashback "This time last month": single position
  flashback: {
    type: 'single',
    position: 16,
    description: 'Historical stories from ~30 days ago'
  } as SingleCardPosition,

  // PWA install prompt: single position
  pwaInstall: {
    type: 'single',
    position: 2,
    description: 'Add to home screen prompt'
  } as SingleCardPosition,

  // Email briefing sign-up: after stories 3, 13, then every 15 (28, 43, 58...)
  emailBriefing: {
    type: 'sequence',
    leading: [3],
    interval: 15,
    offset: 13,
    description: 'Email briefing sign-up prompt'
  } as SequenceCardPosition,
} as const;

/**
 * Check if a card should appear at a given story index
 */
export function shouldShowCard(
  cardType: keyof typeof FEED_CARD_POSITIONS,
  storyIndex: number
): boolean {
  const config = FEED_CARD_POSITIONS[cardType];
  
  if (config.type === 'single') {
    return storyIndex === config.position;
  }

  if (config.type === 'sequence' && config.leading.includes(storyIndex)) return true;
  
  // For repeating cards, check if index matches the pattern
  // storyIndex = interval * n + offset, where n >= 0
  if (storyIndex < config.offset) return false;
  return (storyIndex - config.offset) % config.interval === 0;
}

/**
 * Get the card index for repeating cards (which iteration this is)
 */
export function getCardIndex(
  cardType: keyof typeof FEED_CARD_POSITIONS,
  storyIndex: number
): number {
  const config = FEED_CARD_POSITIONS[cardType];
  
  if (config.type === 'single') return 0;
  if (config.type === 'sequence') {
    const lead = config.leading.indexOf(storyIndex);
    if (lead >= 0) return lead;
    return config.leading.length + Math.floor((storyIndex - config.offset) / config.interval);
  }
  
  return Math.floor((storyIndex - config.offset) / config.interval);
}

/**
 * Which appearance this is in the feed as actually rendered (story positions start at 1):
 * 0 for the first time the card shows, 1 for the second, and so on.
 */
export function getCardSlot(
  cardType: keyof typeof FEED_CARD_POSITIONS,
  storyIndex: number
): number {
  if (storyIndex <= 1) return 0;
  return getCardPositions(cardType, storyIndex - 1).filter((p) => p >= 1).length;
}

/**
 * Get all positions where a card type will appear (up to maxPosition)
 */
export function getCardPositions(
  cardType: keyof typeof FEED_CARD_POSITIONS,
  maxPosition: number = 100
): number[] {
  const config = FEED_CARD_POSITIONS[cardType];
  const positions: number[] = [];
  
  if (config.type === 'single') {
    if (config.position <= maxPosition) {
      positions.push(config.position);
    }
    return positions;
  }

  if (config.type === 'sequence') {
    positions.push(...config.leading.filter((p) => p > 0 && p <= maxPosition));
  }
  
  for (let i = config.offset; i <= maxPosition; i += config.interval) {
    if (i > 0) { // Skip position 0
      positions.push(i);
    }
  }
  
  return positions;
}

/**
 * Detect position collisions between card types
 * Returns array of collision objects with position and conflicting card types
 */
export function getPositionCollisions(maxPosition: number = 100): Array<{
  position: number;
  cardTypes: string[];
}> {
  const positionMap = new Map<number, string[]>();
  
  for (const [cardType, _config] of Object.entries(FEED_CARD_POSITIONS)) {
    const positions = getCardPositions(cardType as keyof typeof FEED_CARD_POSITIONS, maxPosition);
    
    for (const pos of positions) {
      const existing = positionMap.get(pos) || [];
      existing.push(cardType);
      positionMap.set(pos, existing);
    }
  }
  
  // Find positions with more than one card type
  const collisions: Array<{ position: number; cardTypes: string[] }> = [];
  
  for (const [position, cardTypes] of positionMap.entries()) {
    if (cardTypes.length > 1) {
      collisions.push({ position, cardTypes });
    }
  }
  
  return collisions.sort((a, b) => a.position - b.position);
}

/**
 * Log collision report to console (useful for debugging)
 */
export function logCollisionReport(maxPosition: number = 100): void {
  const collisions = getPositionCollisions(maxPosition);
  
  if (collisions.length === 0) {
    console.log('✅ No feed card position collisions detected');
    return;
  }
  
  console.warn(`⚠️ Feed card position collisions detected:`);
  for (const collision of collisions) {
    console.warn(`  Position ${collision.position}: ${collision.cardTypes.join(', ')}`);
  }
}

/**
 * Get a visual map of card positions (for debugging)
 */
export function getPositionMap(maxPosition: number = 50): string {
  const lines: string[] = ['Feed Card Position Map:', ''];
  
  for (const [cardType, config] of Object.entries(FEED_CARD_POSITIONS)) {
    const positions = getCardPositions(cardType as keyof typeof FEED_CARD_POSITIONS, maxPosition);
    const posStr = positions.length > 0 ? positions.join(', ') : 'none';
    lines.push(`${cardType}: ${posStr}`);
  }
  
  return lines.join('\n');
}

// ---------- What's on ----------

/** The What's on card set sits in the first screenful, after this story. */
export const WHATS_ON_FIRST_AFTER = 1;
/** Then no more often than every this-many stories. */
export const WHATS_ON_MIN_GAP = 15;

/**
 * Story positions the What's on card set follows (1 = after the first story):
 * after story 1, then at least 15 stories apart, never in a gap that any other
 * extra card can use — so it is never side by side with another extra card,
 * whichever extras a feed has switched on. The Desk's Live list uses the same rule.
 */
export function whatsOnPositions(maxPosition: number = 100): number[] {
  const taken = new Set<number>();
  for (const type of Object.keys(FEED_CARD_POSITIONS) as (keyof typeof FEED_CARD_POSITIONS)[]) {
    for (const p of getCardPositions(type, maxPosition + WHATS_ON_MIN_GAP)) taken.add(p);
  }
  const out: number[] = [];
  let next = WHATS_ON_FIRST_AFTER;
  while (next <= maxPosition) {
    while (taken.has(next)) next += 1;
    if (next > maxPosition) break;
    out.push(next);
    next += WHATS_ON_MIN_GAP;
  }
  return out;
}

/** Does the What's on card set follow this story position? */
export function isWhatsOnPosition(storyIndex: number): boolean {
  return storyIndex >= 1 && whatsOnPositions(storyIndex).includes(storyIndex);
}

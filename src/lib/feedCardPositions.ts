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

export type CardPosition = RepeatingCardPosition | SingleCardPosition;

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

  // Events accordion: positions 11, 22, 33...
  events: {
    type: 'repeating',
    interval: 11,
    offset: 0,
    description: 'Local events listing'
  } as RepeatingCardPosition,

  // Parliamentary insight cards (MAJOR votes only): positions 8, 21, 34...
  parliamentary: {
    type: 'repeating',
    interval: 13,
    offset: 8,
    description: 'Major MP voting records (rebellions, close votes, high relevance)'
  } as RepeatingCardPosition,

  // Parliamentary weekly digest (minor votes batched): position 25 (once per feed load)
  parliamentaryDigest: {
    type: 'single',
    position: 25,
    description: 'Weekly digest of routine MP votes'
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
  
  return Math.floor((storyIndex - config.offset) / config.interval);
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

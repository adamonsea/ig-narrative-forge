/**
 * Shared keyword matching utilities for scoring and highlighting
 * This ensures consistent keyword detection across the system
 */

export interface KeywordMatch {
  keyword: string;
  variation: string;
  count: number;
  isExact: boolean;
  positions: number[];
}

export interface KeywordMatchResult {
  matches: KeywordMatch[];
  allMatches: string[];
  score: number;
}

/**
 * Generate keyword variations for better matching
 * EMERGENCY FIX: Filter out problematic short keywords and improve matching
 */
export function generateKeywordVariations(keyword: string): string[] {
  // EMERGENCY FIX: Skip keywords that are too short (3 chars or less)
  if (keyword.length <= 3) {
    console.log(`⚠️ Skipping short keyword: "${keyword}" (too short for reliable matching)`);
    return []; // Return empty array for short keywords
  }
  
  const variations = [keyword];
  
  // Add plural/singular variations only for longer keywords
  if (keyword.endsWith('s') && keyword.length > 4) {
    variations.push(keyword.slice(0, -1)); // Remove 's'
  } else if (keyword.length > 3) {
    variations.push(keyword + 's'); // Add 's'
  }
  
  // Add common word variations (only for meaningful keywords)
  const synonymMap: { [key: string]: string[] } = {
    'film': ['movie', 'cinema', 'picture'],
    'movie': ['film', 'cinema', 'picture'],
    'children': ['kids', 'child', 'youth', 'young'],
    'kids': ['children', 'child', 'youth', 'young'],
    'family': ['families', 'parent', 'child'],
    'animation': ['animated', 'cartoon', 'anime'],
    'documentary': ['doc', 'docu', 'factual'],
    'ai': ['artificial intelligence', 'machine learning', 'ml', 'artificial-intelligence'],
    'agency': ['agencies', 'firm', 'company', 'studio'],
    'marketing': ['advertising', 'promotion', 'branding'],
    'creative': ['creativity', 'design', 'artistic']
  };
  
  if (synonymMap[keyword.toLowerCase()]) {
    variations.push(...synonymMap[keyword.toLowerCase()]);
  }
  
  return [...new Set(variations)]; // Remove duplicates
}

/**
 * Find all keyword matches in text using the same logic as scoring
 */
export function findKeywordMatches(
  text: string,
  keywords: string[]
): KeywordMatchResult {
  const fullText = text.toLowerCase();
  const matches: KeywordMatch[] = [];
  const allMatches: string[] = [];
  let totalScore = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (!normalizedKeyword) continue;

    const keywordVariations = generateKeywordVariations(normalizedKeyword);
    
    // EMERGENCY FIX: Skip if no valid variations (short keywords filtered out)
    if (keywordVariations.length === 0) continue;
    
    let keywordOccurrences = 0;
    let keywordScore = 0;
    const positions: number[] = [];

    for (const variation of keywordVariations) {
      // EMERGENCY FIX: ONLY use exact word boundary matching - no more partial matching
      const exactRegex = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      
      const exactMatches = Array.from(fullText.matchAll(exactRegex));
      const occurrences = exactMatches.length;
      
      if (occurrences > 0) {
        keywordOccurrences += occurrences;
        keywordScore += occurrences * 3; // Only exact matches now
        
        // Record positions and actual matched text
        exactMatches.forEach(match => {
          if (match.index !== undefined) {
            positions.push(match.index);
            allMatches.push(match[0]);
          }
        });
      }
    }

    if (keywordOccurrences > 0) {
      matches.push({
        keyword,
        variation: normalizedKeyword,
        count: keywordOccurrences,
        isExact: true, // Will be refined based on match type
        positions
      });
      totalScore += keywordScore;
    }
  }

  return {
    matches,
    allMatches,
    score: Math.min(Math.round(totalScore * 1.5), 100)
  };
}

/**
 * Create a regex pattern for highlighting that matches the same keywords as scoring
 * EMERGENCY FIX: Only use exact word boundary matching for highlighting
 */
export function createHighlightingRegex(keywords: string[]): RegExp | null {
  if (!keywords || keywords.length === 0) return null;

  const allVariations: string[] = [];
  
  for (const keyword of keywords) {
    const variations = generateKeywordVariations(keyword.toLowerCase().trim());
    allVariations.push(...variations);
  }

  if (allVariations.length === 0) return null;

  // EMERGENCY FIX: Only use exact word boundary matching - no partial matching
  const exactPattern = allVariations.map(v => `\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).join('|');
  
  // Use only exact matching for consistent highlighting
  return new RegExp(`(${exactPattern})`, 'gi');
}
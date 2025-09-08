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
 */
export function generateKeywordVariations(keyword: string): string[] {
  const variations = [keyword];
  
  // Add plural/singular variations
  if (keyword.endsWith('s') && keyword.length > 3) {
    variations.push(keyword.slice(0, -1)); // Remove 's'
  } else {
    variations.push(keyword + 's'); // Add 's'
  }
  
  // Add common word variations
  const synonymMap: { [key: string]: string[] } = {
    'film': ['movie', 'cinema', 'picture'],
    'movie': ['film', 'cinema', 'picture'],
    'children': ['kids', 'child', 'youth', 'young'],
    'kids': ['children', 'child', 'youth', 'young'],
    'family': ['families', 'parent', 'child'],
    'animation': ['animated', 'cartoon', 'anime'],
    'documentary': ['doc', 'docu', 'factual'],
    'ai': ['artificial intelligence', 'machine learning', 'ml'],
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
    let keywordOccurrences = 0;
    let keywordScore = 0;
    const positions: number[] = [];

    for (const variation of keywordVariations) {
      // Enhanced keyword matching - both exact and partial word matches
      const exactRegex = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const partialRegex = new RegExp(variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      
      const exactMatches = Array.from(fullText.matchAll(exactRegex));
      const partialMatches = Array.from(fullText.matchAll(partialRegex));
      
      // Prefer exact matches, but count partial matches with lower weight
      const primaryMatches = exactMatches.length > 0 ? exactMatches : partialMatches;
      const occurrences = exactMatches.length > 0 ? exactMatches.length : Math.ceil(partialMatches.length * 0.5);
      
      if (occurrences > 0) {
        keywordOccurrences += occurrences;
        keywordScore += occurrences * (exactMatches.length > 0 ? 3 : 1.5);
        
        // Record positions and actual matched text
        primaryMatches.forEach(match => {
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
 */
export function createHighlightingRegex(keywords: string[]): RegExp | null {
  if (!keywords || keywords.length === 0) return null;

  const allVariations: string[] = [];
  
  for (const keyword of keywords) {
    const variations = generateKeywordVariations(keyword.toLowerCase().trim());
    allVariations.push(...variations);
  }

  if (allVariations.length === 0) return null;

  // Create pattern that matches exact words first, then partial matches
  const exactPattern = allVariations.map(v => `\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).join('|');
  const partialPattern = allVariations.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  
  // Prioritize exact matches, but also catch partial matches
  return new RegExp(`(${exactPattern}|${partialPattern})`, 'gi');
}
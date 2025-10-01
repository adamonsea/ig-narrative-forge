// Hybrid content scoring system for topics
// Uses regional relevance for 'regional' topics and keyword scoring for 'keyword' topics

import { calculateRegionalRelevance, TopicRegionalConfig } from './region-config.ts';

export interface TopicConfig {
  id: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  negative_keywords?: string[];
  region?: string;
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
}

export interface ContentScore {
  relevance_score: number;
  method: 'regional' | 'keyword';
  details: {
    keyword_matches?: { keyword: string; count: number }[];
    regional_details?: any;
  };
}

/**
 * Calculate content relevance for a topic using hybrid approach
 */
export function calculateTopicRelevance(
  content: string,
  title: string,
  topicConfig: TopicConfig,
  sourceType: string = 'national',
  otherRegionalTopics: TopicRegionalConfig[] = [],
  sourceUrl?: string
): ContentScore {
  if (topicConfig.topic_type === 'regional' && topicConfig.region) {
    // Use user-defined regional configuration
    const regionalConfig: TopicRegionalConfig = {
      keywords: topicConfig.keywords,
      landmarks: topicConfig.landmarks,
      postcodes: topicConfig.postcodes,
      organizations: topicConfig.organizations,
      region_name: topicConfig.region
    };
    
    const regionalScore = calculateRegionalRelevance(
      content, 
      title, 
      regionalConfig,
      sourceType,
      otherRegionalTopics,
      sourceUrl
    );
    
    return {
      relevance_score: regionalScore,
      method: 'regional',
      details: {
        regional_details: {
          region: topicConfig.region,
          source_type: sourceType,
          user_defined: true
        }
      }
    };
  } else {
    // Use simple keyword-based scoring for general topics
    const keywordScore = calculateKeywordRelevance(content, title, topicConfig.keywords);
    
    return {
      relevance_score: keywordScore.score,
      method: 'keyword',
      details: {
        keyword_matches: keywordScore.matches
      }
    };
  }
}

/**
 * Enhanced keyword-based relevance scoring with better matching
 */
function calculateKeywordRelevance(
  content: string,
  title: string,
  keywords: string[]
): { score: number; matches: { keyword: string; count: number }[] } {
  if (!keywords || keywords.length === 0) {
    return { score: 0, matches: [] };
  }

  const fullText = `${title} ${content}`.toLowerCase();
  const matches: { keyword: string; count: number }[] = [];
  let totalScore = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (!normalizedKeyword) continue;

    // Generate keyword variations for better matching
    const keywordVariations = generateKeywordVariations(normalizedKeyword);
    let keywordScore = 0;
    let keywordOccurrences = 0;

    // EMERGENCY FIX: Skip if no valid variations (short keywords filtered out)
    if (keywordVariations.length === 0) continue;
    
    for (const variation of keywordVariations) {
      // EMERGENCY FIX: Use only exact word boundary matching for accurate keyword detection
      const exactRegex = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      
      const exactMatches = (fullText.match(exactRegex) || []).length;
      const occurrences = exactMatches;
      keywordOccurrences += occurrences;

      if (occurrences > 0) {
        // Context-aware scoring: title, first paragraph, and headings get bonus
        const titleText = title.toLowerCase();
        const firstParagraph = content.substring(0, 500).toLowerCase();
        
        const titleExactMatches = (titleText.match(exactRegex) || []).length;
        const firstParaMatches = (firstParagraph.match(exactRegex) || []).length;
        
        // Enhanced scoring system
        const titleScore = titleExactMatches * 15; // Higher weight for title
        const firstParaScore = Math.min(firstParaMatches * 8, 24); // Bonus for early mentions
        const contentScore = Math.min((occurrences - titleExactMatches - firstParaMatches) * 3, 15);
        
        keywordScore += titleScore + firstParaScore + contentScore;
      }
    }

    if (keywordOccurrences > 0) {
      matches.push({ keyword, count: keywordOccurrences });
      totalScore += keywordScore;
    }
  }

  // PLATFORM FIX: Much more generous scoring to reduce false negatives
  let normalizedScore = Math.min(Math.round(totalScore * 2.5), 100); // Increased multiplier
  
  // Higher bonus for multiple different keywords matching
  if (matches.length > 1) {
    normalizedScore = Math.min(normalizedScore + (matches.length - 1) * 10, 100);
  }
  
  // Additional bonus for any keyword match to be more permissive
  if (matches.length > 0) {
    normalizedScore = Math.max(normalizedScore, 15); // Minimum score for any keyword match
  }
  
  // Add debug logging to show what keywords were actually matched
  console.log('Keyword matching debug:', {
    keywords,
    matches: matches.map(m => ({ keyword: m.keyword, count: m.count })),
    score: normalizedScore,
    title: title.substring(0, 100) + '...'
  });
  
  return {
    score: normalizedScore,
    matches
  };
}

/**
 * Generate keyword variations for better matching
 */
function generateKeywordVariations(keyword: string): string[] {
  // Filter out short keywords that cause false positives
  if (keyword.length <= 3) {
    console.log(`⚠️ Skipping short keyword in scoring: "${keyword}" (too short for reliable matching)`);
    return [];
  }
  
  const variations: string[] = [keyword];
  const lowerKeyword = keyword.toLowerCase();
  
  // === TENSE VARIATIONS ===
  if (lowerKeyword.endsWith('ing')) {
    const base = lowerKeyword.slice(0, -3);
    variations.push(base + 'ed', base + 'e', base);
  } else if (!lowerKeyword.endsWith('ed')) {
    variations.push(lowerKeyword + 'ed', lowerKeyword + 'ing');
  }
  
  // === PLURAL/SINGULAR VARIATIONS ===
  if (lowerKeyword.endsWith('s') && keyword.length > 4) {
    variations.push(lowerKeyword.slice(0, -1));
  } else if (lowerKeyword.endsWith('y')) {
    variations.push(lowerKeyword.slice(0, -1) + 'ies');
  } else if (lowerKeyword.endsWith('ies')) {
    variations.push(lowerKeyword.slice(0, -3) + 'y');
  } else if (keyword.length > 3) {
    variations.push(lowerKeyword + 's', lowerKeyword + 'es');
  }
  
  // === REGIONAL SPELLING VARIATIONS ===
  if (lowerKeyword.includes('center')) {
    variations.push(keyword.replace(/center/i, 'centre'));
  }
  if (lowerKeyword.includes('centre')) {
    variations.push(keyword.replace(/centre/i, 'center'));
  }
  if (lowerKeyword.includes('ize')) {
    variations.push(keyword.replace(/ize/gi, 'ise'));
  }
  if (lowerKeyword.includes('ise')) {
    variations.push(keyword.replace(/ise/gi, 'ize'));
  }
  
  // === INDUSTRY-SPECIFIC MARKETING/MARCOMMS SYNONYMS ===
  const marketingSynonyms: Record<string, string[]> = {
    'marcomms': ['marketing communications', 'marketing comms', 'marketing', 'brand communications'],
    'content': ['content marketing', 'content creation', 'content strategy'],
    'branding': ['brand', 'brand identity', 'brand strategy', 'brand development'],
    'digital': ['digital marketing', 'digital advertising', 'digital strategy'],
    'social': ['social media', 'social marketing', 'social media marketing'],
    'agency': ['agencies', 'marketing agency', 'creative agency', 'firm', 'company', 'studio'],
    'campaign': ['campaigns', 'marketing campaign', 'advertising campaign'],
    'seo': ['search engine optimization', 'search optimization'],
    'ai': ['artificial intelligence', 'machine learning', 'ml', 'artificial-intelligence', 'generative ai'],
    'film': ['movie', 'cinema', 'picture'],
    'movie': ['film', 'cinema', 'picture'],
    'children': ['kids', 'child', 'youth', 'young'],
    'kids': ['children', 'child', 'youth', 'young'],
    'family': ['families', 'parent', 'child'],
    'animation': ['animated', 'cartoon', 'anime'],
    'documentary': ['doc', 'docu', 'factual'],
    'marketing': ['advertising', 'promotion', 'marcomms', 'communications'],
    'creative': ['creativity', 'design', 'artistic']
  };
  
  for (const [key, synonyms] of Object.entries(marketingSynonyms)) {
    if (lowerKeyword.includes(key)) {
      variations.push(...synonyms);
    }
  }
  
  // === PHRASE VARIATIONS ===
  if (lowerKeyword.includes(' in ')) {
    variations.push(lowerKeyword.replace(' in ', ' for '), lowerKeyword.replace(' in ', ' and '));
  }
  if (lowerKeyword.includes(' for ')) {
    variations.push(lowerKeyword.replace(' for ', ' in '));
  }
  
  return [...new Set(variations)];
}

/**
 * PHASE 1: Confidence-based thresholds - Trust source selection approach
 */
export function getRelevanceThreshold(
  topicType: 'regional' | 'keyword',
  sourceType: string = 'national',
  isUserSelectedSource: boolean = false
): number {
  if (topicType === 'regional') {
    // Regional topics maintain higher thresholds
    if (sourceType === 'hyperlocal') return 10;
    if (sourceType === 'regional') return 12;
    return 15;
  } else {
    // Keyword topics: MUCH lower thresholds for user-selected sources
    if (isUserSelectedSource) {
      // User-selected sources get the benefit of the doubt
      if (sourceType === 'hyperlocal') return 4;
      if (sourceType === 'regional') return 5;
      return 6; // national - dramatically lowered from 12
    } else {
      // Non-selected sources use standard thresholds
      if (sourceType === 'hyperlocal') return 8;
      if (sourceType === 'regional') return 10;
      return 12;
    }
  }
}

/**
 * Check if content meets topic relevance requirements
 */
export function meetsTopicRelevance(
  content: string,
  title: string,
  topicConfig: TopicConfig,
  sourceType: string = 'national',
  otherRegionalTopics: TopicRegionalConfig[] = [],
  sourceUrl?: string,
  isUserSelectedSource: boolean = false
): boolean {
  // Check for negative keywords first
  if (topicConfig.negative_keywords?.length) {
    const text = `${title} ${content}`.toLowerCase();
    const hasNegativeKeyword = topicConfig.negative_keywords.some(negKeyword => 
      text.includes(negKeyword.toLowerCase())
    );
    
    if (hasNegativeKeyword) {
      console.log(`[Relevance] ❌ Rejected by negative keyword`);
      return false;
    }
  }

  const score = calculateTopicRelevance(content, title, topicConfig, sourceType, otherRegionalTopics, sourceUrl);
  const threshold = getRelevanceThreshold(topicConfig.topic_type, sourceType, isUserSelectedSource);
  
  // For regional topics, check for competing regions
  if (topicConfig.topic_type === 'regional' && score.relevance_score > 0) {
    const hasStrongCompetingRegionSignals = checkForCompetingRegionSignals(
      content, 
      title, 
      topicConfig, 
      otherRegionalTopics
    );
    
    if (hasStrongCompetingRegionSignals) {
      console.log(`[Relevance] ❌ Rejected by competing regional focus`);
      return false;
    }
  }
  
  const meets = score.relevance_score >= threshold && score.relevance_score > 0;
  const sourceNote = isUserSelectedSource ? ' [USER-SELECTED]' : '';
  console.log(`[Relevance] ${meets ? '✅' : '❌'} Score: ${score.relevance_score}/${threshold}${sourceNote}`);
  
  return meets;
}

/**
 * Check for strong signals that content is primarily about competing regions
 */
function checkForCompetingRegionSignals(
  content: string,
  title: string,
  topicConfig: TopicConfig,
  otherRegionalTopics: TopicRegionalConfig[]
): boolean {
  if (!otherRegionalTopics?.length || !topicConfig.region) return false;
  
  const fullText = `${title} ${content}`.toLowerCase();
  const currentRegion = topicConfig.region.toLowerCase();
  
  // Check for competing region names in title (strong signal)
  const competingRegionsInTitle = otherRegionalTopics
    .filter(other => other.region_name !== topicConfig.region)
    .filter(other => title.toLowerCase().includes(other.region_name.toLowerCase()))
    .length;
  
  if (competingRegionsInTitle > 0) {
    // Allow if current region is also mentioned prominently
    const currentRegionInTitle = title.toLowerCase().includes(currentRegion);
    if (!currentRegionInTitle) {
      return true; // Strong competing signal - exclude
    }
  }
  
  // Check landmark concentration (competing region landmarks mentioned more than current)
  const competingLandmarkMentions = otherRegionalTopics
    .filter(other => other.region_name !== topicConfig.region)
    .flatMap(other => other.landmarks || [])
    .filter(landmark => landmark && fullText.includes(landmark.toLowerCase()))
    .length;
  
  const currentLandmarkMentions = (topicConfig.landmarks || [])
    .filter(landmark => landmark && fullText.includes(landmark.toLowerCase()))
    .length;
  
  // If competing landmarks mentioned significantly more than current region landmarks
  if (competingLandmarkMentions > currentLandmarkMentions && competingLandmarkMentions >= 2) {
    return true; // Strong competing signal - exclude
  }
  
  return false;
}
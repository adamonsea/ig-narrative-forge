// Hybrid content scoring system for topics
// Uses regional relevance for 'regional' topics and keyword scoring for 'keyword' topics

import { calculateRegionalRelevance } from './region-config.ts';

export interface TopicConfig {
  id: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
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
  sourceType: string = 'national'
): ContentScore {
  if (topicConfig.topic_type === 'regional' && topicConfig.region) {
    // Use existing sophisticated regional relevance scoring
    const regionalScore = calculateRegionalRelevance(
      content, 
      title, 
      topicConfig.region, 
      sourceType
    );
    
    return {
      relevance_score: regionalScore,
      method: 'regional',
      details: {
        regional_details: {
          region: topicConfig.region,
          source_type: sourceType
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
 * Simple keyword-based relevance scoring
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

    // Count occurrences (case-insensitive, word boundary matching)
    const regex = new RegExp(`\\b${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const occurrences = (fullText.match(regex) || []).length;

    if (occurrences > 0) {
      matches.push({ keyword, count: occurrences });
      
      // Scoring: title matches worth more, diminishing returns for multiple occurrences
      const titleMatches = (title.toLowerCase().match(regex) || []).length;
      const contentMatches = occurrences - titleMatches;
      
      // Title matches: 10 points each, Content matches: 3 points each
      // Diminishing returns: cap at 5 matches per keyword
      const titleScore = Math.min(titleMatches * 10, 50);
      const contentScore = Math.min(contentMatches * 3, 15);
      
      totalScore += titleScore + contentScore;
    }
  }

  // Normalize to 0-100 scale
  // Base assumption: 3-4 keyword matches should give ~70-80 score
  const normalizedScore = Math.min(Math.round(totalScore * 1.2), 100);
  
  return {
    score: normalizedScore,
    matches
  };
}

/**
 * Determine minimum relevance threshold based on topic type and source
 */
export function getRelevanceThreshold(
  topicType: 'regional' | 'keyword',
  sourceType: string = 'national'
): number {
  if (topicType === 'regional') {
    // Use existing regional thresholds
    if (sourceType === 'hyperlocal') return 15;
    if (sourceType === 'regional') return 25;
    return 40; // national
  } else {
    // Keyword-based thresholds
    if (sourceType === 'hyperlocal') return 30;
    if (sourceType === 'regional') return 40;
    return 50; // national - higher bar for general topics
  }
}

/**
 * Check if content meets topic relevance requirements
 */
export function meetsTopicRelevance(
  content: string,
  title: string,
  topicConfig: TopicConfig,
  sourceType: string = 'national'
): boolean {
  const score = calculateTopicRelevance(content, title, topicConfig, sourceType);
  const threshold = getRelevanceThreshold(topicConfig.topic_type, sourceType);
  
  return score.relevance_score >= threshold;
}
/**
 * Utility functions for scraper selection based on topic type
 */

export interface Topic {
  topic_type: 'regional' | 'keyword';
}

/**
 * Determines which scraper function to use based on topic type
 * @param topicType - The type of topic ('regional' or 'keyword')
 * @returns The appropriate scraper function name
 */
export const getScraperFunction = (topicType: 'regional' | 'keyword'): string => {
  return topicType === 'regional' ? 'universal-scraper' : 'topic-aware-scraper';
};

/**
 * Creates scraper request body based on topic type
 * @param topicType - The type of topic
 * @param feedUrl - The URL to scrape
 * @param options - Additional options (topicId, sourceId, region)
 * @returns Appropriate request body for the scraper
 */
export const createScraperRequestBody = (
  topicType: 'regional' | 'keyword',
  feedUrl: string,
  options: {
    topicId?: string;
    sourceId?: string;
    region?: string;
  }
) => {
  if (topicType === 'regional') {
    return {
      feedUrl,
      sourceId: options.sourceId,
      region: options.region || 'default'
    };
  } else {
    return {
      feedUrl,
      topicId: options.topicId,
      sourceId: options.sourceId
    };
  }
};
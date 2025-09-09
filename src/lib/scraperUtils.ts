/**
 * Utility functions for scraper selection based on topic type
 */

export interface Topic {
  topic_type: 'regional' | 'keyword';
}

/**
 * Determines which scraper function to use based on topic type and URL
 * @param topicType - The type of topic ('regional' or 'keyword')
 * @param feedUrl - The URL to be scraped (to detect if it's an index page)
 * @returns The appropriate scraper function name
 */
export const getScraperFunction = (topicType: 'regional' | 'keyword', feedUrl?: string): string => {
  // Check if URL appears to be an index/listing page
  if (feedUrl && isIndexPage(feedUrl)) {
    return 'unified-scraper'; // Use new two-phase scraper for index pages
  }
  
  return topicType === 'regional' ? 'universal-scraper' : 'topic-aware-scraper';
};

/**
 * Checks if a URL appears to be an index/listing page rather than an individual article
 */
export const isIndexPage = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    
    // Common index page patterns
    const indexPatterns = [
      /\/blog\/?$/,
      /\/news\/?$/,
      /\/articles?\/?$/,
      /\/posts?\/?$/,
      /\/category\//,
      /\/tag\//,
      /\/archive\//,
      /\/page\/\d+/,
      /\/$/, // Root paths
      /\/index\.(html?|php)$/,
    ];
    
    return indexPatterns.some(pattern => pattern.test(pathname));
  } catch {
    return false;
  }
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
  // Check if this is an index page requiring two-phase scraping
  if (isIndexPage(feedUrl)) {
    return {
      indexUrl: feedUrl,
      topicId: options.topicId,
      sourceId: options.sourceId,
      maxArticles: 20,
      fallbackToScreenshot: true
    };
  }
  
  // For individual article pages, use existing logic
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
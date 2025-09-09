/**
 * Fast-track scraper optimized for Supabase Edge Functions
 * Reduces timeouts by using quick accessibility checks and limited processing
 */

import { ScrapingResult, ArticleData } from './types.ts';
import { UniversalContentExtractor } from './universal-content-extractor.ts';
import { calculateRegionalRelevance } from './region-config.ts';
import { EnhancedRetryStrategies } from './enhanced-retry-strategies.ts';

export class FastTrackScraper {
  private extractor: UniversalContentExtractor;
  private retryStrategy: EnhancedRetryStrategies;
  private accessibilityCache = new Map<string, boolean>();

  constructor(private region: string, private sourceInfo: any, private baseUrl: string) {
    this.extractor = new UniversalContentExtractor(baseUrl);
    this.retryStrategy = new EnhancedRetryStrategies();
  }

  async executeScrapingStrategy(): Promise<ScrapingResult> {
    console.log(`🚀 Fast-track scraper started for ${this.sourceInfo?.source_name || this.baseUrl}`);
    
    // Quick accessibility check first
    const accessibilityResult = await this.retryStrategy.quickAccessibilityCheck(this.baseUrl);
    if (!accessibilityResult.accessible) {
      console.log(`❌ Source not accessible: ${accessibilityResult.error}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [`Source not accessible: ${accessibilityResult.error}`],
        method: 'fast_track_accessibility_check'
      };
    }

    console.log(`✅ Source accessible (${accessibilityResult.responseTime}ms)`);

    // Try RSS first with reduced processing
    const rssResult = await this.tryFastRSSStrategy();
    if (rssResult.success && rssResult.articles.length > 0) {
      return rssResult;
    }
    
    // Fallback to minimal HTML parsing
    console.log('📄 RSS failed, trying fast HTML parsing...');
    return await this.tryFastHTMLStrategy();
  }

  private async tryFastRSSStrategy(): Promise<ScrapingResult> {
    console.log('🔄 Fast RSS parsing...');
    
    try {
      const feedUrl = this.sourceInfo?.feed_url || this.baseUrl;
      
      // Single attempt with fast config
      const rssContent = await this.retryStrategy.fetchWithEnhancedRetry(feedUrl, {
        maxRetries: 1,
        baseDelay: 200,
        maxDelay: 2000,
        exponentialBackoff: false
      });
      
      return await this.parseFastRSSContent(rssContent, feedUrl);
      
    } catch (error) {
      console.log(`❌ Fast RSS parsing failed: ${error.message}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'fast_rss'
      };
    }
  }

  private async tryFastHTMLStrategy(): Promise<ScrapingResult> {
    console.log('🔄 Fast HTML parsing...');
    
    try {
      const html = await this.retryStrategy.fetchWithEnhancedRetry(this.baseUrl, {
        maxRetries: 1,
        baseDelay: 200,
        maxDelay: 2000,
        exponentialBackoff: false
      });
      
      // Look for RSS feeds first
      const feedLinks = this.extractFeedLinks(html, this.baseUrl);
      for (const feedLink of feedLinks.slice(0, 2)) { // Only try first 2 feeds
        try {
          const rssContent = await this.retryStrategy.fetchWithEnhancedRetry(feedLink, {
            maxRetries: 1,
            baseDelay: 200,
            maxDelay: 2000,
            exponentialBackoff: false
          });
          const result = await this.parseFastRSSContent(rssContent, feedLink);
          if (result.success && result.articles.length > 0) {
            return { ...result, method: 'fast_rss_discovery' };
          }
        } catch (error) {
          console.log(`⚠️ Fast feed failed: ${error.message}`);
        }
      }
      
      // Parse HTML articles with strict limits
      return await this.parseFastHTMLArticles(html, this.baseUrl);
      
    } catch (error) {
      console.log(`❌ Fast HTML parsing failed: ${error.message}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'fast_html'
      };
    }
  }

  private async parseFastRSSContent(rssContent: string, feedUrl: string): Promise<ScrapingResult> {
    console.log('📊 Fast RSS parsing...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      const itemMatches = rssContent.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
      console.log(`📄 Found ${itemMatches.length} RSS items (processing max 20)`);

      // Process only first 20 RSS items for speed
      for (const itemMatch of itemMatches.slice(0, 20)) {
        try {
          const article = await this.parseFastRSSItem(itemMatch, feedUrl);
          if (article && this.isFastQualified(article)) {
            articles.push(article);
          }
        } catch (error) {
          errors.push(`RSS item error: ${error.message}`);
          if (errors.length > 5) break; // Stop after 5 errors
        }
      }

      return {
        success: articles.length > 0,
        articles,
        articlesFound: itemMatches.length,
        articlesScraped: articles.length,
        errors,
        method: 'fast_rss'
      };

    } catch (error) {
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'fast_rss'
      };
    }
  }

  private async parseFastRSSItem(itemXml: string, baseUrl: string): Promise<ArticleData | null> {
    const title = this.extractXMLContent(itemXml, 'title');
    const link = this.extractXMLContent(itemXml, 'link') || this.extractXMLContent(itemXml, 'guid');
    const description = this.extractXMLContent(itemXml, 'description') || this.extractXMLContent(itemXml, 'summary');
    const author = this.extractXMLContent(itemXml, 'author') || this.extractXMLContent(itemXml, 'dc:creator');
    const pubDate = this.extractXMLContent(itemXml, 'pubDate') || this.extractXMLContent(itemXml, 'published');

    if (!title || !link) {
      return null;
    }

    const articleUrl = this.resolveUrl(link, baseUrl);

    // For fast processing, use RSS description as content if available (skip full extraction)
    let finalContent = description || '';
    let finalTitle = title;
    let wordCount = this.countWords(finalContent);

    // Only do full extraction if RSS description is too short
    if (wordCount < 20) {
      try {
        console.log(`📄 Getting full content for: ${articleUrl}`);
        const extractor = new UniversalContentExtractor(articleUrl);
        const articleHtml = await extractor.fetchWithRetry(articleUrl);
        const extractedContent = extractor.extractContentFromHTML(articleHtml, articleUrl);
        
        finalContent = extractedContent.body || description || '';
        finalTitle = extractedContent.title || title;
        wordCount = extractedContent.word_count || this.countWords(finalContent);
      } catch (error) {
        console.log(`⚠️ Full extraction failed, using RSS content: ${error.message}`);
        // Keep using RSS description
      }
    }

    // Calculate regional relevance quickly
    const regionalRelevance = calculateRegionalRelevance(
      finalContent,
      finalTitle,
      this.region,
      this.sourceInfo?.source_type || 'national'
    );

    return {
      title: finalTitle,
      body: finalContent,
      author: author,
      published_at: pubDate || new Date().toISOString(),
      source_url: articleUrl,
      canonical_url: articleUrl,
      word_count: wordCount,
      regional_relevance_score: regionalRelevance,
      content_quality_score: this.calculateFastQualityScore(finalContent, finalTitle),
      processing_status: 'new' as const,
      import_metadata: {
        extraction_method: 'fast_track_rss',
        rss_description: description,
        source_domain: this.sourceInfo?.canonical_domain,
        scrape_timestamp: new Date().toISOString(),
        extractor_version: '3.0-fast'
      }
    };
  }

  private async parseFastHTMLArticles(html: string, baseUrl: string): Promise<ScrapingResult> {
    console.log('📊 Fast HTML article parsing...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      const articleLinks = this.extractor.extractArticleLinks(html, baseUrl);
      console.log(`📄 Found ${articleLinks.length} article links (processing max 5)`);

      // Only process first 5 articles for speed
      for (const articleUrl of articleLinks.slice(0, 5)) {
        try {
          const extractor = new UniversalContentExtractor(articleUrl);
          const articleHtml = await extractor.fetchWithRetry(articleUrl);
          const extractedContent = extractor.extractContentFromHTML(articleHtml, articleUrl);
          
          if (extractedContent.body && this.isFastQualified(extractedContent)) {
            const regionalRelevance = calculateRegionalRelevance(
              extractedContent.body,
              extractedContent.title,
              this.region,
              this.sourceInfo?.source_type || 'national'
            );

            articles.push({
              title: extractedContent.title,
              body: extractedContent.body,
              author: extractedContent.author,
              published_at: extractedContent.published_at,
              source_url: articleUrl,
              canonical_url: articleUrl,
              word_count: extractedContent.word_count,
              regional_relevance_score: regionalRelevance,
              content_quality_score: extractedContent.content_quality_score,
              processing_status: 'new' as const,
              import_metadata: {
                extraction_method: 'fast_track_html',
                source_domain: this.sourceInfo?.canonical_domain,
                scrape_timestamp: new Date().toISOString(),
                extractor_version: '3.0-fast'
              }
            });
          }
        } catch (error) {
          errors.push(`Article error: ${error.message}`);
          if (errors.length > 3) break; // Stop after 3 errors
        }
      }

      return {
        success: articles.length > 0,
        articles,
        articlesFound: articleLinks.length,
        articlesScraped: articles.length,
        errors,
        method: 'fast_track_html'
      };

    } catch (error) {
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'fast_track_html'
      };
    }
  }

  private isFastQualified(content: any): boolean {
    // Fast qualification - minimal checks
    if (!content.title && !content.body) {
      return false;
    }
    
    const wordCount = this.countWords(content.body || content.title);
    return wordCount >= 10; // Very minimal requirement
  }

  private calculateFastQualityScore(content: string, title: string): number {
    let score = 30; // Base score
    
    const wordCount = this.countWords(content);
    if (wordCount >= 100) score += 40;
    else if (wordCount >= 50) score += 25;
    else if (wordCount >= 20) score += 15;
    else if (wordCount >= 10) score += 10;
    
    if (title && title.length >= 10) score += 20;
    else if (title && title.length >= 5) score += 10;
    
    return Math.min(100, score);
  }

  // Helper methods
  private extractXMLContent(xml: string, tag: string): string {
    const match = new RegExp(`<${tag}[^>]*>([^<]+)`, 'i').exec(xml) ||
                  new RegExp(`<${tag}[^>]*><\\!\\[CDATA\\[([^\\]]+)`, 'i').exec(xml);
    return match ? match[1].trim() : '';
  }

  private extractFeedLinks(html: string, baseUrl: string): string[] {
    const feedLinks: string[] = [];
    const linkMatches = html.match(/<link[^>]+type=[\"']application\/(rss\+xml|atom\+xml)[\"'][^>]*>/gi) || [];
    
    for (const linkMatch of linkMatches) {
      const hrefMatch = /href=[\"']([^\"]+)[\"']/i.exec(linkMatch);
      if (hrefMatch) {
        feedLinks.push(this.resolveUrl(hrefMatch[1], baseUrl));
      }
    }

    return feedLinks;
  }

  private resolveUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
}

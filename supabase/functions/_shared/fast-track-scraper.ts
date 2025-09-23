/**
 * Fast-track scraper optimized for Supabase Edge Functions
 * Reduces timeouts by using quick accessibility checks and limited processing
 */

import { ScrapingResult, ArticleData } from './types.ts';
import { UniversalContentExtractor } from './universal-content-extractor.ts';
import { calculateRegionalRelevance } from './region-config.ts';
import { EnhancedRetryStrategies } from './enhanced-retry-strategies.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

export class FastTrackScraper {
  private extractor: UniversalContentExtractor;
  private retryStrategy: EnhancedRetryStrategies;
  private accessibilityCache = new Map<string, boolean>();
  private region: string = '';
  private sourceInfo: any = {};
  private baseUrl: string = '';

  constructor(private supabase: any) {
    this.retryStrategy = new EnhancedRetryStrategies();
  }

  async scrapeContent(feedUrl: string, sourceId: string, options: any = {}): Promise<ScrapingResult> {
    console.log(`🚀 FastTrackScraper.scrapeContent called for ${feedUrl}`);
    
    try {
      // Get source information from database
      const { data: source, error: sourceError } = await this.supabase
        .from('content_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (sourceError || !source) {
        throw new Error(`Failed to get source info: ${sourceError?.message}`);
      }

      // Get topic information to determine region
      let topicRegion = 'Global'; // default
      if (source.topic_id) {
        const { data: topic } = await this.supabase
          .from('topics')
          .select('region, name')
          .eq('id', source.topic_id)
          .single();
        
        if (topic && topic.region) {
          topicRegion = topic.region;
        }
      }

      // Set up instance variables for this scraping run
      this.region = topicRegion;
      this.sourceInfo = source;
      this.baseUrl = feedUrl;
      this.extractor = new UniversalContentExtractor(feedUrl);

      console.log(`📍 Scraping with region: ${this.region}, source: ${source.source_name}`);

      // Execute the existing scraping strategy
      return await this.executeScrapingStrategy();
      
    } catch (error) {
      console.error(`❌ FastTrackScraper.scrapeContent error:`, error);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'fast_track_setup_error'
      };
    }
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
      
      // Use domain-specific strategy for better success rates
      const rssContent = await this.retryStrategy.fetchWithDomainSpecificStrategy(feedUrl);
      
      return await this.parseFastRSSContent(rssContent, feedUrl);
      
    } catch (error) {
      console.log(`❌ Fast RSS parsing failed: ${error.message}`);
      
      // Log source health for monitoring
      await this.retryStrategy.logSourceHealth(
        this.sourceInfo?.id,
        feedUrl,
        false,
        error.message
      );
      
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
      // Use domain-specific strategy for better success
      const html = await this.retryStrategy.fetchWithDomainSpecificStrategy(this.baseUrl);
      
      // Look for RSS feeds first
      const feedLinks = this.extractFeedLinks(html, this.baseUrl);
      for (const feedLink of feedLinks.slice(0, 2)) { // Only try first 2 feeds
        try {
          console.log(`📡 Trying discovered feed: ${feedLink}`);
          const rssContent = await this.retryStrategy.fetchWithDomainSpecificStrategy(feedLink);
          const result = await this.parseFastRSSContent(rssContent, feedLink);
          if (result.success && result.articles.length > 0) {
            console.log(`✅ Feed discovery successful: ${result.articles.length} articles`);
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
      
      // Log source health for monitoring
      await this.retryStrategy.logSourceHealth(
        this.sourceInfo?.id,
        this.baseUrl,
        false,
        error.message
      );
      
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

    // Enhanced snippet acceptance logic with regional source prioritization
    const isLikelySnippet = this.isContentSnippet(description || '', title);
    const hasEllipsis = (description || '').includes('[&#8230;') || (description || '').includes('…') || (description || '').includes('[...]');
    const isRegionalTopic = this.region && this.region.toLowerCase() !== 'global';
    const isWhitelistedDomain = this.isWhitelistedDomain(articleUrl);
    
    // Try full extraction for: very low word count or clear truncation indicators
    const needsFullExtraction = wordCount < 75 || 
                               (hasEllipsis && wordCount < 100) ||
                               (isRegionalTopic && wordCount < 100 && !isWhitelistedDomain);
    
    if (needsFullExtraction) {
      try {
        console.log(`📄 Attempting full extraction - ${wordCount} words, snippet: ${isLikelySnippet}, ellipsis: ${hasEllipsis}, regional: ${isRegionalTopic}`);
        const extractor = new UniversalContentExtractor(articleUrl);
        const articleHtml = await extractor.fetchWithRetry(articleUrl);
        const extractedContent = extractor.extractContentFromHTML(articleHtml, articleUrl);
        
        // Use extracted content if significantly better than RSS
        if (extractedContent.body) {
          const extractedWordCount = this.countWords(extractedContent.body);
          
          // Use full content if it's meaningfully longer or RSS was clearly truncated
          if (hasEllipsis || extractedWordCount > wordCount * 1.8 || extractedWordCount >= 150) {
            finalContent = extractedContent.body;
            finalTitle = extractedContent.title || title;
            wordCount = extractedContent.word_count || extractedWordCount;
            console.log(`✅ Full extraction successful: ${wordCount} words (was ${this.countWords(description || '')})`);
          } else {
            console.log(`⚠️ Extracted content not significantly better, keeping RSS content`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Full extraction failed, using RSS content as fallback: ${error.message}`);
        
        // For regional sources, accept RSS snippet even if extraction failed
        if (isRegionalTopic || isWhitelistedDomain) {
          console.log(`📝 Regional/whitelisted source: Accepting RSS snippet as fallback content`);
          // Mark content as snippet for editor review
          finalContent = `${description}\n\n[Note: This is a content snippet from RSS feed. Full article extraction failed.]`;
        }
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

  // Enhanced whitelisted domains for regional sources that commonly use snippets
  private WHITELISTED_DOMAINS = [
    'theargus.co.uk',
    'sussexexpress.co.uk',
    'brightonandhovenews.org',
    'sussexlive.co.uk',
    'eastsussexnews.co.uk',
    'brightonjournal.co.uk'
  ];

  private isWhitelistedDomain(url: string): boolean {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return this.WHITELISTED_DOMAINS.some(whitelist => domain.includes(whitelist));
    } catch {
      return false;
    }
  }

  private isFastQualified(content: any): boolean {
    const isWhitelisted = this.isWhitelistedDomain(this.baseUrl);
    const isRegionalTopic = this.region && this.region.toLowerCase() !== 'global';
    
    // Handle missing dates - more permissive for regional/whitelisted sources
    if (!content.published_at) {
      if (isWhitelisted || isRegionalTopic) {
        console.log(`🟡 Regional/whitelisted source: Accepting article with missing date - "${content.title?.substring(0, 50)}..."`);
        content.published_at = new Date().toISOString();
      } else {
        console.log(`🚫 Fast-track REJECT (no date): "${content.title?.substring(0, 50)}..."`);
        return false;
      }
    }

    // Validate date for all domains
    try {
      const pubDate = new Date(content.published_at);
      if (!isNaN(pubDate.getTime())) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (pubDate < sevenDaysAgo) {
          const daysOld = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`🚫 Fast-track REJECT (too old): "${content.title?.substring(0, 50)}..." - ${daysOld} days old`);
          return false;
        }
      } else {
        if (isWhitelisted || isRegionalTopic) {
          console.log(`🟡 Regional/whitelisted source: Fixing invalid date - "${content.title?.substring(0, 50)}..."`);
          content.published_at = new Date().toISOString();
        } else {
          console.log(`🚫 Fast-track REJECT (invalid date): "${content.title?.substring(0, 50)}..." - "${content.published_at}"`);
          return false;
        }
      }
    } catch (error) {
      if (isWhitelisted || isRegionalTopic) {
        console.log(`🟡 Regional/whitelisted source: Fixing date parse error - "${content.title?.substring(0, 50)}..."`);
        content.published_at = new Date().toISOString();
      } else {
        console.log(`🚫 Fast-track REJECT (date parse error): "${content.title?.substring(0, 50)}..." - "${content.published_at}"`);
        return false;
      }
    }

    // Basic content validation
    if (!content.title && !content.body) {
      return false;
    }
    
    const wordCount = this.countWords(content.body || '');
    const isSnippet = this.isContentSnippet(content.body || '', content.title || '');
    
    // More permissive requirements for regional/whitelisted sources
    if (isWhitelisted || isRegionalTopic) {
      console.log(`🟡 Regional/whitelisted qualification: ${wordCount} words, snippet: ${isSnippet}`);
      // Accept snippets if they have reasonable word count for regional sources
      return wordCount >= 50 && (wordCount >= 75 || !isSnippet);
    }
    
    // Standard requirements for other domains
    return wordCount >= 100 && !isSnippet;
  }

  private calculateFastQualityScore(content: string, title: string): number {
    let score = 20; // Base score
    
    const wordCount = this.countWords(content);
    if (wordCount >= 500) score += 50;
    else if (wordCount >= 300) score += 40;
    else if (wordCount >= 200) score += 35;
    else if (wordCount >= 150) score += 30;
    else if (wordCount >= 100) score += 25;
    else if (wordCount >= 50) score += 15;
    else if (wordCount >= 25) score += 10;
    
    if (title && title.length >= 20) score += 15;
    else if (title && title.length >= 10) score += 10;
    
    // Penalty for snippets
    if (this.isContentSnippet(content, title)) {
      score -= 30;
    }
    
    return Math.max(0, Math.min(100, score));
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

  private isContentSnippet(content: string, title: string): boolean {
    if (!content) return true;
    
    const wordCount = this.countWords(content);
    
    // Very short content is definitely a snippet
    if (wordCount < 25) return true;
    
    // Check for common snippet indicators
    const snippetIndicators = [
      'read more', 'continue reading', 'full story', 'view more',
      'the post', 'appeared first', 'original article', 'source:',
      'click here', 'see more', 'read the full',
      'subscribe', 'follow us', 'newsletter'
    ];
    
    const contentLower = content.toLowerCase();
    const hasSnippetIndicators = snippetIndicators.some(indicator => 
      contentLower.includes(indicator)
    );
    
    // More nuanced snippet detection - only flag as snippet if clearly truncated AND short
    const hasEllipsis = content.trim().endsWith('...') || content.trim().endsWith('…');
    const hasNoSentences = !content.includes('.') || content.split('.').length < 2;
    const isClearlyTruncated = hasEllipsis || hasNoSentences;
    
    // Only consider it a snippet if it has clear indicators AND is relatively short
    return hasSnippetIndicators || (isClearlyTruncated && wordCount < 75);
  }
}

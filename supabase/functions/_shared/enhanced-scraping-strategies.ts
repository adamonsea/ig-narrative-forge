import { ScrapingResult, ArticleData } from './types.ts';
import { UniversalContentExtractor } from './universal-content-extractor.ts';
import { calculateRegionalRelevance } from './region-config.ts';
import { EnhancedRetryStrategies } from './enhanced-retry-strategies.ts';

export class EnhancedScrapingStrategies {
  private extractor: UniversalContentExtractor;
  private retryStrategy: EnhancedRetryStrategies;

  constructor(private region: string, private sourceInfo: any, private baseUrl: string) {
    this.extractor = new UniversalContentExtractor(baseUrl);
    this.retryStrategy = new EnhancedRetryStrategies();
  }

  async executeScrapingStrategy(): Promise<ScrapingResult> {
    console.log(`🚀 Starting enhanced scraping for ${this.sourceInfo?.source_name || this.baseUrl}`);
    
    // Try RSS first, then HTML parsing with enhanced extraction
    const rssResult = await this.tryRSSStrategy();
    if (rssResult.success && rssResult.articles.length > 0) {
      return rssResult;
    }
    
    console.log('📄 RSS failed or no articles found, trying enhanced HTML parsing...');
    return await this.tryEnhancedHTMLStrategy();
  }

  private async tryRSSStrategy(): Promise<ScrapingResult> {
    console.log('🔄 Attempting RSS/Atom parsing...');
    
    try {
      const feedUrl = this.sourceInfo?.feed_url || this.baseUrl;
      
      // First try the provided/base URL with enhanced retry
      try {
        const rssContent = await this.retryStrategy.fetchWithEnhancedRetry(feedUrl);
        return await this.parseRSSContent(rssContent, feedUrl);
      } catch (primaryError) {
        console.log(`❌ Primary RSS URL failed: ${primaryError.message}`);
        
        // Smart URL discovery - try common RSS patterns
        const discoveredFeeds = await this.discoverRSSFeeds(this.baseUrl);
        
        for (const discoveredFeedUrl of discoveredFeeds) {
          try {
            console.log(`🔍 Trying discovered RSS feed: ${discoveredFeedUrl}`);
            const rssContent = await this.retryStrategy.fetchWithEnhancedRetry(discoveredFeedUrl);
            const result = await this.parseRSSContent(rssContent, discoveredFeedUrl);
            if (result.success && result.articles.length > 0) {
              return { ...result, method: 'rss_discovery' };
            }
          } catch (discoverError) {
            console.log(`⚠️ Discovered RSS feed ${discoveredFeedUrl} failed: ${discoverError.message}`);
          }
        }
        
        // For government sites, try alternative RSS patterns
        const governmentFeeds = await this.extractor.tryGovernmentRSSFeeds(this.baseUrl);
        
        for (const govFeedUrl of governmentFeeds) {
          try {
            console.log(`🏛️ Trying government RSS feed: ${govFeedUrl}`);
            const rssContent = await this.extractor.fetchWithRetry(govFeedUrl);
            const result = await this.parseRSSContent(rssContent, govFeedUrl);
            if (result.success && result.articles.length > 0) {
              return { ...result, method: 'government_rss_discovery' };
            }
          } catch (govError) {
            console.log(`⚠️ Government RSS feed ${govFeedUrl} failed: ${govError.message}`);
          }
        }
        
        // Re-throw the primary error if no feeds worked
        throw primaryError;
      }
      
    } catch (error) {
      console.log(`❌ RSS parsing failed: ${error.message}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'rss'
      };
    }
  }

  private async tryEnhancedHTMLStrategy(): Promise<ScrapingResult> {
    console.log('🔄 Attempting enhanced HTML parsing...');
    
    try {
      const html = await this.retryStrategy.fetchWithEnhancedRetry(this.baseUrl);
      
      // First, try to find RSS feeds in the HTML
      const feedLinks = this.extractFeedLinks(html, this.baseUrl);
      for (const feedLink of feedLinks) {
        console.log(`🔗 Found feed link: ${feedLink}`);
        try {
          const rssContent = await this.extractor.fetchWithRetry(feedLink);
          const result = await this.parseRSSContent(rssContent, feedLink);
          if (result.success && result.articles.length > 0) {
            return { ...result, method: 'rss_discovery' };
          }
        } catch (error) {
          console.log(`⚠️ Feed link failed: ${error.message}`);
        }
      }
      
      // If no RSS found, parse HTML for article links
      return await this.parseHTMLForArticles(html, this.baseUrl);
      
    } catch (error) {
      console.log(`❌ Enhanced HTML parsing failed: ${error.message}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'html'
      };
    }
  }

  private async parseRSSContent(rssContent: string, feedUrl: string): Promise<ScrapingResult> {
    console.log('📊 Parsing RSS/Atom content with enhanced extraction...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      // Extract items from RSS/Atom
      const itemMatches = rssContent.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
      
      console.log(`📄 Found ${itemMatches.length} RSS items`);

      // Process RSS items with enhanced content extraction - INCREASED LIMIT
      for (const itemMatch of itemMatches.slice(0, 250)) { // Process up to 250 articles
        try {
          const article = await this.parseRSSItemEnhanced(itemMatch, feedUrl);
          if (article && this.isArticleQualified(article)) {
            articles.push(article);
          }
        } catch (error) {
          errors.push(`RSS item parsing error: ${error.message}`);
        }
      }

      return {
        success: articles.length > 0,
        articles,
        articlesFound: itemMatches.length,
        articlesScraped: articles.length,
        errors,
        method: 'rss'
      };

    } catch (error) {
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'rss'
      };
    }
  }

  private async parseRSSItemEnhanced(itemXml: string, baseUrl: string): Promise<ArticleData | null> {
    // Extract basic RSS data
    const title = this.extractXMLContent(itemXml, 'title');
    const link = this.extractXMLContent(itemXml, 'link') || this.extractXMLContent(itemXml, 'guid');
    const description = this.extractXMLContent(itemXml, 'description') || this.extractXMLContent(itemXml, 'summary');
    const author = this.extractXMLContent(itemXml, 'author') || this.extractXMLContent(itemXml, 'dc:creator');
    const pubDate = this.extractXMLContent(itemXml, 'pubDate') || this.extractXMLContent(itemXml, 'published');

    if (!title || !link) {
      return null;
    }

    const articleUrl = this.resolveUrl(link, baseUrl);
    console.log(`📄 Fetching enhanced content from: ${articleUrl}`);

    try {
      // Use enhanced content extraction
      const extractor = new UniversalContentExtractor(articleUrl);
      const articleHtml = await extractor.fetchWithRetry(articleUrl);
      const extractedContent = extractor.extractContentFromHTML(articleHtml, articleUrl);
      
      // Use extracted content, fallback to RSS description if needed
      const finalContent = extractedContent.body || description || '';
      const finalTitle = extractedContent.title || title;
      
      // ENHANCED VALIDATION: 150+ words for complete articles, allow smaller for initial processing
      const wordCount = this.countWords(finalContent);
      if (!finalContent || wordCount < 25) { // Lower threshold for initial capture
        console.log(`⚠️ Insufficient content for: ${finalTitle.substring(0, 50)}... (${wordCount} words)`);
        return null;
      }

      // Calculate enhanced regional relevance
      const regionalRelevance = this.calculateEnhancedRegionalRelevance(
        finalContent,
        finalTitle,
        articleUrl
      );

      return {
        title: finalTitle,
        body: finalContent,
        author: extractedContent.author || author,
        published_at: extractedContent.published_at || pubDate || new Date().toISOString(),
        source_url: articleUrl,
        canonical_url: articleUrl,
        word_count: extractedContent.word_count,
        regional_relevance_score: regionalRelevance,
        content_quality_score: extractedContent.content_quality_score,
        processing_status: 'new' as const,
        import_metadata: {
          extraction_method: 'enhanced_rss',
          rss_description: description,
          source_domain: this.sourceInfo?.canonical_domain,
          scrape_timestamp: new Date().toISOString(),
          extractor_version: '2.0'
        }
      };

    } catch (error) {
      console.log(`❌ Failed to fetch enhanced content for: ${title.substring(0, 50)}... - ${error.message}`);
      return null;
    }
  }

  private async parseHTMLForArticles(html: string, baseUrl: string): Promise<ScrapingResult> {
    console.log('📊 Parsing HTML for article links with enhanced detection...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      // Extract article links using enhanced detection
      const articleLinks = this.extractor.extractArticleLinks(html, baseUrl);
      
      console.log(`📄 Found ${articleLinks.length} potential article links`);

      // Process each article link with enhanced extraction - INCREASED LIMIT
      for (const articleUrl of articleLinks.slice(0, 25)) { // Increased limit for more articles
        try {
          const extractor = new UniversalContentExtractor(articleUrl);
          const articleHtml = await extractor.fetchWithRetry(articleUrl);
          const extractedContent = extractor.extractContentFromHTML(articleHtml, articleUrl);
          
          if (extractedContent.body && this.isContentQualified(extractedContent)) {
            const regionalRelevance = this.calculateEnhancedRegionalRelevance(
              extractedContent.body,
              extractedContent.title,
              articleUrl
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
                extraction_method: 'enhanced_html',
                source_domain: this.sourceInfo?.canonical_domain,
                scrape_timestamp: new Date().toISOString(),
                extractor_version: '2.0'
              }
            });
          }
        } catch (error) {
          errors.push(`Article extraction error: ${error.message}`);
        }
      }

      return {
        success: articles.length > 0,
        articles,
        articlesFound: articleLinks.length,
        articlesScraped: articles.length,
        errors,
        method: 'enhanced_html'
      };

    } catch (error) {
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'enhanced_html'
      };
    }
  }

  private calculateEnhancedRegionalRelevance(content: string, title: string, url: string): number {
    let relevance = calculateRegionalRelevance(
      content,
      title,
      this.region,
      this.sourceInfo?.source_type || 'national'
    );

    // Boost for hyperlocal sources
    if (this.sourceInfo?.source_type === 'hyperlocal' && relevance < 15) {
      relevance = Math.max(relevance, 20);
    }

    // Additional boost for topic-specific local domains
    const regionName = this.region.toLowerCase();
    if (url.includes(regionName) || url.includes('local')) {
      relevance += 10;
    }

    return relevance;
  }

  private isArticleQualified(article: ArticleData): boolean {
    // ENHANCED QUALIFICATION: 150+ words for complete articles, 7-day max age
    const hasMinimumWords = (article.word_count || 0) >= 25; // Initial threshold, final validation in DB
    const hasMinimumContent = (article.body?.length || 0) > 50; // Reasonable minimum
    const hasTitle = article.title && article.title.length > 5;
    
    // CRITICAL: 7-day maximum age for local news freshness
    const isRecent = this.isArticleRecent(article.published_at);
    
    console.log(`🔍 ENHANCED Article qualification: "${article.title?.substring(0, 50)}..."`);
    console.log(`   Words: ${article.word_count || 0}, Length: ${article.body?.length || 0}, Has Title: ${hasTitle}`);
    console.log(`   Published: ${article.published_at}, Recent (≤7 days): ${isRecent}`);
    console.log(`   Qualified: ${hasMinimumWords && hasMinimumContent && hasTitle && isRecent}`);
    
    return hasMinimumWords && hasMinimumContent && hasTitle && isRecent;
  }

  private isArticleRecent(publishedAt?: string): boolean {
    if (!publishedAt) {
      console.log('⚠️ No publication date found, treating as recent');
      return true; // If no date, assume it's recent
    }

    try {
      const pubDate = new Date(publishedAt);
      const now = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7); // CRITICAL: 7-day maximum for local news

      const isRecent = pubDate >= sevenDaysAgo;
      
      if (!isRecent) {
        const daysAgo = Math.round((now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`📅 Article too old: ${publishedAt} (${daysAgo} days ago, max 7 days for local news)`);
      }
      
      return isRecent;
    } catch (error) {
      console.log(`⚠️ Invalid date format: ${publishedAt}, treating as recent`);
      return true; // If date parsing fails, assume it's recent
    }
  }

  private isContentQualified(content: any): boolean {
    // ENHANCED CONTENT QUALIFICATION: 150+ words, 7-day max age
    const hasMinimumWords = (content.word_count || 0) >= 25; // Initial threshold
    const hasMinimumContent = (content.body?.length || 0) > 50;
    const hasTitle = content.title && content.title.length > 5;
    
    // CRITICAL: 7-day maximum age for local news freshness
    const isRecent = this.isArticleRecent(content.published_at);
    
    return hasMinimumWords && hasMinimumContent && hasTitle && isRecent;
  }

  // Helper methods
  private extractXMLContent(xml: string, tag: string): string {
    const match = new RegExp(`<${tag}[^>]*>([^<]+)`, 'i').exec(xml) ||
                  new RegExp(`<${tag}[^>]*><\\!\\[CDATA\\[([^\\]]+)`, 'i').exec(xml);
    return match ? match[1].trim() : '';
  }

  private extractFeedLinks(html: string, baseUrl: string): string[] {
    const feedLinks: string[] = [];
    
    // Look for RSS/Atom feed links
    const linkMatches = html.match(/<link[^>]+type=["']application\/(rss\+xml|atom\+xml)["'][^>]*>/gi) || [];
    
    for (const linkMatch of linkMatches) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(linkMatch);
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
      return url.startsWith('http') ? url : `${baseUrl}${url}`;
    }
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Smart RSS feed discovery - try common patterns
  private async discoverRSSFeeds(baseUrl: string): Promise<string[]> {
    console.log('🔍 Attempting smart RSS feed discovery...');
    const commonPatterns = [
      '/feed/',
      '/rss/',
      '/rss.xml',
      '/feed.xml',
      '/atom.xml',
      '/news/feed/',
      '/blog/feed/',
      '/feeds/all.xml',
      '/index.xml'
    ];
    
    const validFeeds: string[] = [];
    
    for (const pattern of commonPatterns) {
      try {
        const feedUrl = new URL(pattern, baseUrl).href;
        console.log(`🔗 Checking RSS pattern: ${feedUrl}`);
        
        // Quick validation fetch with short timeout
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000); // 5 second timeout for discovery
        
        const response = await fetch(feedUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FeedDiscovery/1.0)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml'
          }
        });
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          const content = await response.text();
          
          // Validate RSS/Atom content
          if ((contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) &&
              (content.includes('<rss') || content.includes('<feed') || content.includes('<atom'))) {
            console.log(`✅ Found valid RSS feed: ${feedUrl}`);
            validFeeds.push(feedUrl);
          }
        }
      } catch (error) {
        // Silently continue - expected for many URLs
        console.log(`⚠️ RSS pattern ${pattern} failed: ${error.message}`);
      }
    }
    
    return validFeeds;
  }
}
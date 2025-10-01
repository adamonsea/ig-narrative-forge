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

    const aggregatedErrors: string[] = [];
    const strategies: Array<{ name: string; executor: () => Promise<ScrapingResult> }> = [
      { name: 'rss', executor: () => this.tryRSSStrategy() },
      { name: 'sitemap', executor: () => this.trySitemapStrategy() },
      { name: 'html', executor: () => this.tryEnhancedHTMLStrategy() },
      { name: 'discovery', executor: () => this.tryHeuristicDiscovery() }
    ];

    for (const strategy of strategies) {
      const result = await strategy.executor();

      if (result.success && result.articles.length > 0) {
        console.log(`✅ Strategy ${strategy.name} succeeded with ${result.articles.length} articles`);
        return result;
      }

      if (result.errors?.length) {
        aggregatedErrors.push(...result.errors.map(error => `${strategy.name}: ${error}`));
      }

      console.log(`⚠️ Strategy ${strategy.name} did not yield content, moving to next fallback`);
    }

    return {
      success: false,
      articles: [],
      articlesFound: 0,
      articlesScraped: 0,
      errors: aggregatedErrors.length ? aggregatedErrors : ['No articles found via available strategies'],
      method: 'fallback'
    };
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
        const primaryErrorMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
        console.log(`❌ Primary RSS URL failed: ${primaryErrorMessage}`);
        
        // Smart URL discovery - try common RSS patterns
        const discoveredFeeds = await this.discoverRSSFeeds(this.baseUrl);
        
        for (const discoveredFeedUrl of discoveredFeeds) {
          try {
            console.log(`🔍 Trying discovered RSS feed: ${discoveredFeedUrl}`);
            const rssContent = await this.retryStrategy.fetchWithEnhancedRetry(discoveredFeedUrl);
            const result = await this.parseRSSContent(rssContent, discoveredFeedUrl);
            if (result.success && result.articles.length > 0) {
              return { ...result, method: 'rss' }; // Use 'rss' instead of 'rss_discovery'
            }
          } catch (discoverError) {
            const discoverErrorMessage = discoverError instanceof Error ? discoverError.message : String(discoverError);
            console.log(`⚠️ Discovered RSS feed ${discoveredFeedUrl} failed: ${discoverErrorMessage}`);
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
              return { ...result, method: 'rss' }; // Use 'rss' instead of 'government_rss_discovery'
            }
          } catch (govError) {
            const govErrorMessage = govError instanceof Error ? govError.message : String(govError);
            console.log(`⚠️ Government RSS feed ${govFeedUrl} failed: ${govErrorMessage}`);
          }
        }
        
        // Re-throw the primary error if no feeds worked
        throw primaryError;
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ RSS parsing failed: ${errorMessage}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [errorMessage],
        method: 'rss'
      };
    }
  }

  private async trySitemapStrategy(): Promise<ScrapingResult> {
    console.log('🗺️ Attempting sitemap-based discovery...');

    const errors: string[] = [];

    try {
      const sitemapUrls = await this.discoverSitemaps(this.baseUrl);

      if (sitemapUrls.length === 0) {
        console.log('⚠️ No sitemap candidates discovered');
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['No sitemap candidates discovered'],
          method: 'sitemap'
        };
      }

      const visited = new Set<string>();
      const queue = [...sitemapUrls];
      const articleCandidates = new Set<string>();
      const maxSitemapsToProcess = 6;

      while (queue.length > 0 && visited.size < maxSitemapsToProcess) {
        const sitemapUrl = queue.shift()!;

        if (visited.has(sitemapUrl)) {
          continue;
        }

        visited.add(sitemapUrl);

        try {
          console.log(`🧭 Fetching sitemap: ${sitemapUrl}`);
          const sitemapContent = await this.retryStrategy.fetchWithEnhancedRetry(sitemapUrl, {
            maxRetries: 1,
            baseDelay: 500,
            maxDelay: 4000,
            exponentialBackoff: false
          });

          const { articleUrls, nestedSitemaps } = this.parseSitemapContent(sitemapContent, sitemapUrl);

          for (const nested of nestedSitemaps) {
            if (!visited.has(nested) && queue.length < 12) {
              queue.push(nested);
            }
          }

          articleUrls.forEach(url => articleCandidates.add(url));

        } catch (sitemapError) {
          const sitemapErrorMessage = sitemapError instanceof Error ? sitemapError.message : String(sitemapError);
          console.log(`⚠️ Failed to process sitemap ${sitemapUrl}: ${sitemapErrorMessage}`);
          errors.push(`Sitemap error (${sitemapUrl}): ${sitemapErrorMessage}`);
        }
      }

      if (articleCandidates.size === 0) {
        errors.push('No article URLs discovered via sitemaps');
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors,
          method: 'sitemap'
        };
      }

      const candidateList = Array.from(articleCandidates);
      const { articles, errors: articleErrors } = await this.scrapeArticleUrls(candidateList, 'sitemap', {
        discovery: 'sitemap',
        sitemaps: Array.from(visited)
      });

      errors.push(...articleErrors);

      return {
        success: articles.length > 0,
        articles,
        articlesFound: candidateList.length,
        articlesScraped: articles.length,
        errors,
        method: 'sitemap'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);

      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors,
        method: 'sitemap'
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
            return { ...result, method: 'rss' };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`⚠️ Feed link failed: ${errorMessage}`);
        }
      }
      
      // If no RSS found, parse HTML for article links
      return await this.parseHTMLForArticles(html, this.baseUrl);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Enhanced HTML parsing failed: ${errorMessage}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [errorMessage],
        method: 'html'
      };
    }
  }

  private async tryHeuristicDiscovery(): Promise<ScrapingResult> {
    console.log('🧭 Attempting heuristic article discovery...');

    try {
      const html = await this.retryStrategy.fetchWithEnhancedRetry(this.baseUrl);
      const candidateUrls = this.extractCandidateLinksFromHeuristics(html, this.baseUrl);

      if (candidateUrls.length === 0) {
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['No candidate links discovered via heuristics'],
          method: 'discovery'
        };
      }

      const { articles, errors } = await this.scrapeArticleUrls(candidateUrls, 'discovery', {
        discovery: 'heuristic',
        selectors: 'article-link,news-link,post-title,entry-title'
      });

      return {
        success: articles.length > 0,
        articles,
        articlesFound: candidateUrls.length,
        articlesScraped: articles.length,
        errors,
        method: 'discovery'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [errorMessage],
        method: 'discovery'
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

      // Process RSS items with enhanced content extraction - OPTIMIZED FOR EDGE FUNCTIONS
      for (const itemMatch of itemMatches.slice(0, 50)) { // Reduced to 50 articles for performance
        try {
          const article = await this.parseRSSItemEnhanced(itemMatch, feedUrl);
          if (article && this.isArticleQualified(article)) {
            articles.push(article);
          }
        } catch (error) {
          const parseErrorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`RSS item parsing error: ${parseErrorMessage}`);
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
      const parseErrorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [parseErrorMessage],
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

    let finalContent = description || '';
    let finalTitle = title;
    let extractedContent: any = {
      body: description || '',
      title,
      author,
      published_at: pubDate,
      word_count: this.countWords(description || ''),
      content_quality_score: 70 // Default quality for RSS content
    };

    try {
      // Use enhanced content extraction
      const extractor = new UniversalContentExtractor(articleUrl);
      const articleHtml = await extractor.fetchWithRetry(articleUrl);
      const extracted = extractor.extractContentFromHTML(articleHtml, articleUrl);
      
      // Use extracted content if successful
      finalContent = extracted.body || description || '';
      finalTitle = extracted.title || title;
      extractedContent = extracted;
      
      console.log(`✅ Enhanced extraction successful for: ${finalTitle.substring(0, 50)}...`);
      
    } catch (error) {
      // Graceful fallback to RSS content when extraction fails
      const extractErrorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to fetch enhanced content for: ${title.substring(0, 50)}... - ${extractErrorMessage}`);
      console.log(`📝 Using RSS content as fallback`);
      
      // Use RSS description as content when extraction fails
      if (description && description.length > 10) {
        finalContent = description;
        extractedContent = {
          body: description,
          title,
          author,
          published_at: pubDate,
          word_count: this.countWords(description),
          content_quality_score: 60 // Slightly lower quality for RSS-only content
        };
      } else {
        console.log(`❌ No RSS description available, skipping article`);
        return null;
      }
    }
    
    // EMERGENCY FIX: Much more lenient validation for initial capture
    const wordCount = this.countWords(finalContent);
    if (!finalContent || wordCount < 3) { // Emergency: Accept anything with 3+ words
      console.log(`❌ Content too short: ${finalTitle.substring(0, 50)}... (${wordCount} words)`);
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
      word_count: extractedContent.word_count || this.countWords(finalContent),
      regional_relevance_score: regionalRelevance,
      content_quality_score: extractedContent.content_quality_score || 60,
      processing_status: 'new' as const,
      import_metadata: {
        extraction_method: finalContent === description ? 'rss_fallback' : 'enhanced_rss',
        rss_description: description,
        source_domain: this.sourceInfo?.canonical_domain,
        scrape_timestamp: new Date().toISOString(),
        extractor_version: '2.0'
      }
    };
  }

  private async parseHTMLForArticles(html: string, baseUrl: string): Promise<ScrapingResult> {
    console.log('📊 Parsing HTML for article links with enhanced detection...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      // Extract article links using enhanced detection
      const articleLinks = this.extractor.extractArticleLinks(html, baseUrl);
      
      console.log(`📄 Found ${articleLinks.length} potential article links`);

      // Process each article link with enhanced extraction - OPTIMIZED FOR EDGE FUNCTIONS
      for (const articleUrl of articleLinks.slice(0, 10)) { // Reduced to 10 articles for performance
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
          const articleErrorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Article extraction error: ${articleErrorMessage}`);
        }
      }

      return {
        success: articles.length > 0,
        articles,
        articlesFound: articleLinks.length,
        articlesScraped: articles.length,
        errors,
        method: 'html'
      };

    } catch (error) {
      const htmlErrorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [htmlErrorMessage],
        method: 'html'
      };
    }
  }

  private calculateEnhancedRegionalRelevance(content: string, title: string, url: string): number {
    // Create minimal regional config for calculation
    const regionalConfig = {
      keywords: [], // Will be populated if needed
      region_name: this.region || 'unknown'
    };
    
    let relevance = calculateRegionalRelevance(
      content,
      title,
      regionalConfig,
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
    // EMERGENCY FIX: Accept virtually all articles
    if (!article.title && !article.body) {
      console.log(`❌ No title or body found`);
      return false;
    }
    
    // Auto-fix missing fields
    if (!article.title) {
      article.title = article.body?.substring(0, 100)?.replace(/\n/g, ' ')?.trim() + '...' || 'Untitled Article';
    }
    if (!article.body) {
      article.body = article.title;
    }
    
    // EMERGENCY: Minimal requirements only
    const minWordCount = 3; // Was 15, now just 3 words
    const maxAge = 60; // days - was 14, now 60 days
    
    const wordCount = this.countWords(article.body || article.title);
    if (wordCount < minWordCount) {
      console.log(`❌ Article extremely short: ${wordCount} words`);
      return false;
    }
    
    // Very forgiving age check
    if (article.published_at) {
      try {
        const publishedDate = new Date(article.published_at);
        if (!isNaN(publishedDate.getTime())) {
          const daysSincePublished = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSincePublished > maxAge) {
            console.log(`⚠️ Article old but still accepting: ${Math.round(daysSincePublished)} days`);
          }
        }
      } catch (e) {
        // Ignore date errors
      }
    }
    
    console.log(`✅ Article qualified: "${article.title?.substring(0, 50)}..." (${wordCount} words)`);
    return true;
  }

  private isArticleRecent(publishedAt?: string, maxDays: number = 14): boolean {
    if (!publishedAt) {
      console.log('⚠️ No publication date found, treating as recent');
      return true; // If no date, assume it's recent
    }

    try {
      const pubDate = new Date(publishedAt);
      const now = new Date();
      const cutoffDate = new Date();
      cutoffDate.setDate(now.getDate() - maxDays); // PLATFORM FIX: Configurable maximum days

      const isRecent = pubDate >= cutoffDate;
      
      if (!isRecent) {
        const daysAgo = Math.round((now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`📅 Article too old: ${publishedAt} (${daysAgo} days ago, max ${maxDays} days)`);
      }
      
      return isRecent;
    } catch (error) {
      console.log(`⚠️ Invalid date format: ${publishedAt}, treating as recent`);
      return true; // If date parsing fails, assume it's recent
    }
  }

  private isContentQualified(content: any): boolean {
    // Phase 2: STRICT qualification - no more emergency permissive mode
    if (!content.title && !content.body) {
      return false;
    }
    
    // Phase 2: STRICT date validation - no lenient fallbacks
    if (content.published_at) {
      try {
        const publishedDate = new Date(content.published_at);
        if (isNaN(publishedDate.getTime())) {
          console.log(`🚫 Enhanced content REJECT (invalid date): "${content.title?.substring(0, 50)}..." - date: "${content.published_at}"`);
          return false;
        }
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (publishedDate < sevenDaysAgo) {
          const daysOld = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`🚫 Enhanced content REJECT (too old): "${content.title?.substring(0, 50)}..." - ${daysOld} days old`);
          return false;
        }
      } catch (error) {
        console.log(`🚫 Enhanced content REJECT (date parse error): "${content.title?.substring(0, 50)}..." - "${content.published_at}"`);
        return false;
      }
    } else {
      console.log(`🚫 Enhanced content REJECT (no published date): "${content.title?.substring(0, 50)}..."`);
      return false;
    }
    
    // Auto-fix missing fields  
    if (!content.title) content.title = content.body?.substring(0, 100) + '...';
    if (!content.body) content.body = content.title;
    
    // Phase 2: Reasonable quality requirements
    const minWordCount = 30;
    const wordCount = this.countWords(content.body || content.title);
    if (wordCount < minWordCount) {
      console.log(`🚫 Enhanced content REJECT (too short): "${content.title?.substring(0, 50)}..." - ${wordCount} words`);
      return false;
    }
    
    console.log(`✅ Enhanced content qualified: "${content.title?.substring(0, 50)}..."`);
    return true;
  }

  private async scrapeArticleUrls(
    articleUrls: string[],
    method: ScrapingResult['method'],
    metadata: Record<string, any> = {}
  ): Promise<{ articles: ArticleData[]; errors: string[] }> {
    const articles: ArticleData[] = [];
    const errors: string[] = [];
    const uniqueUrls = Array.from(new Set(articleUrls));
    const limit = method === 'sitemap' ? 30 : 15;

    for (const candidateUrl of uniqueUrls.slice(0, limit)) {
      const articleUrl = this.resolveUrl(candidateUrl, this.baseUrl);

      if (!this.extractor.isLikelyArticleUrl(articleUrl)) {
        continue;
      }

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
            processing_status: 'new',
            import_metadata: {
              extraction_method: method,
              discovery_metadata: metadata,
              source_domain: this.sourceInfo?.canonical_domain,
              scrape_timestamp: new Date().toISOString(),
              extractor_version: '2.0'
            }
          });
        }

      } catch (error) {
        const articleErrorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Article extraction error (${articleUrl}): ${articleErrorMessage}`);
      }
    }

    return { articles, errors };
  }

  private async discoverSitemaps(baseUrl: string): Promise<string[]> {
    try {
      const parsedUrl = new URL(baseUrl);
      const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const sitemapCandidates = new Set<string>();

      const commonPaths = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemap-news.xml',
        '/news-sitemap.xml',
        '/sitemap1.xml',
        '/sitemap-index.xml',
        '/sitemap/news.xml'
      ];

      for (const path of commonPaths) {
        try {
          sitemapCandidates.add(new URL(path, origin).href);
        } catch {
          // Ignore malformed URLs
        }
      }

      try {
        const robotsUrl = new URL('/robots.txt', origin).href;
        console.log(`🤖 Checking robots.txt for sitemap hints: ${robotsUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(robotsUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SitemapDiscovery/1.0)',
            'Accept': 'text/plain'
          }
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const robotsText = await response.text();
          const sitemapMatches = robotsText.match(/Sitemap:\s*(.+)/gi) || [];

          for (const match of sitemapMatches) {
            const extracted = /Sitemap:\s*(.+)/i.exec(match);
            const sitemapUrl = extracted?.[1]?.trim();
            if (sitemapUrl) {
              try {
                sitemapCandidates.add(new URL(sitemapUrl, origin).href);
              } catch {
                sitemapCandidates.add(sitemapUrl);
              }
            }
          }
        }

      } catch (robotsError) {
        const robotsMessage = robotsError instanceof Error ? robotsError.message : String(robotsError);
        console.log(`⚠️ Unable to read robots.txt: ${robotsMessage}`);
      }

      return Array.from(sitemapCandidates);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Failed to derive sitemap origin: ${errorMessage}`);
      return [];
    }
  }

  private parseSitemapContent(sitemapContent: string, sitemapUrl: string): { articleUrls: string[]; nestedSitemaps: string[] } {
    const articleUrls = new Set<string>();
    const nestedSitemaps = new Set<string>();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    if (sitemapContent.includes('<sitemapindex')) {
      const sitemapEntries = sitemapContent.match(/<sitemap>[\s\S]*?<\/sitemap>/gi) || [];
      for (const entry of sitemapEntries) {
        const loc = this.extractXMLContent(entry, 'loc');
        if (loc) {
          nestedSitemaps.add(this.resolveUrl(loc, sitemapUrl));
        }
      }
    }

    const urlEntries = sitemapContent.match(/<url>[\s\S]*?<\/url>/gi) || [];

    if (urlEntries.length > 0) {
      for (const entry of urlEntries) {
        const loc = this.extractXMLContent(entry, 'loc');
        if (!loc) continue;

        const resolvedUrl = this.resolveUrl(loc, sitemapUrl);
        if (!this.extractor.isLikelyArticleUrl(resolvedUrl)) continue;

        const lastMod = this.extractXMLContent(entry, 'lastmod');
        if (lastMod) {
          const parsedDate = new Date(lastMod);
          if (!isNaN(parsedDate.getTime()) && parsedDate < cutoffDate) {
            continue;
          }
        }

        articleUrls.add(resolvedUrl);
      }
    } else {
      const locMatches = sitemapContent.match(/<loc>([\s\S]*?)<\/loc>/gi) || [];
      for (const match of locMatches) {
        const loc = this.extractXMLContent(match, 'loc');
        if (!loc) continue;

        const resolvedUrl = this.resolveUrl(loc, sitemapUrl);

        if (resolvedUrl.toLowerCase().includes('sitemap')) {
          nestedSitemaps.add(resolvedUrl);
        } else if (this.extractor.isLikelyArticleUrl(resolvedUrl)) {
          articleUrls.add(resolvedUrl);
        }
      }
    }

    return {
      articleUrls: Array.from(articleUrls),
      nestedSitemaps: Array.from(nestedSitemaps)
    };
  }

  private extractCandidateLinksFromHeuristics(html: string, baseUrl: string): string[] {
    const candidates = new Set<string>(this.extractor.extractArticleLinks(html, baseUrl));

    const sectionRegex = /<(article|section|div)[^>]+(?:class|id)=["'][^"']*(article|news|post|story|entry)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
    let sectionMatch: RegExpExecArray | null;

    while ((sectionMatch = sectionRegex.exec(html)) !== null) {
      const sectionHtml = sectionMatch[0];
      const linkMatches = sectionHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];

      for (const link of linkMatches) {
        const hrefMatch = /href=["']([^"']+)["']/i.exec(link);
        if (hrefMatch) {
          const resolved = this.resolveUrl(hrefMatch[1], baseUrl);
          if (this.extractor.isLikelyArticleUrl(resolved)) {
            candidates.add(resolved);
          }
        }
      }
    }

    const headlineRegex = /<(h1|h2|h3)[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<\/\1>/gi;
    let headlineMatch: RegExpExecArray | null;

    while ((headlineMatch = headlineRegex.exec(html)) !== null) {
      const resolved = this.resolveUrl(headlineMatch[2], baseUrl);
      if (this.extractor.isLikelyArticleUrl(resolved)) {
        candidates.add(resolved);
      }
    }

    const selectorKeywords = [
      'article-link',
      'news-link',
      'story-link',
      'post-title',
      'entry-title',
      'article-title',
      'headline'
    ];

    const selectorRegex = new RegExp(
      `<a[^>]+(?:class|id)=["'][^"']*(?:${selectorKeywords.join('|')})[^"']*["'][^>]*href=["']([^"']+)["']`,
      'gi'
    );

    let selectorMatch: RegExpExecArray | null;
    while ((selectorMatch = selectorRegex.exec(html)) !== null) {
      const resolved = this.resolveUrl(selectorMatch[1], baseUrl);
      if (this.extractor.isLikelyArticleUrl(resolved)) {
        candidates.add(resolved);
      }
    }

    return Array.from(candidates).slice(0, 20);
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
        const patternErrorMessage = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ RSS pattern ${pattern} failed: ${patternErrorMessage}`);
      }
    }
    
    return validFeeds;
  }
}
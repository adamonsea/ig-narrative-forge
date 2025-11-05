import { ScrapingResult, ArticleData } from './types.ts';
import { UniversalContentExtractor } from './universal-content-extractor.ts';
import { calculateRegionalRelevance } from './region-config.ts';
import { EnhancedRetryStrategies } from './enhanced-retry-strategies.ts';
import { NewsquestArcClient, NewsquestArcArticle } from './newsquest-arc-client.ts';

export class EnhancedScrapingStrategies {
  private extractor: UniversalContentExtractor;
  private retryStrategy: EnhancedRetryStrategies;
  private newsquestDomains = new Set([
    'theargus.co.uk',
    'sussexexpress.co.uk',
    'theboltonnews.co.uk',
    'basingstokegazette.co.uk',
    'dorsetecho.co.uk',
    'oxfordmail.co.uk',
    'worcesternews.co.uk',
    'wiltsglosstandard.co.uk',
    'thisisthewestcountry.co.uk'
  ]);
  private newsquestSectionFallbacks = new Map<string, string[]>([
    ['sussexexpress.co.uk', ['/news/local/hastings', '/news/local/', '/news/']],
    ['theargus.co.uk', ['/news/local/brighton-and-hove', '/news/local/', '/news/']],
    ['theboltonnews.co.uk', ['/news/local/', '/news/']],
    ['basingstokegazette.co.uk', ['/news/local/', '/news/']],
    ['dorsetecho.co.uk', ['/news/local/', '/news/']],
    ['oxfordmail.co.uk', ['/news/local/', '/news/']],
    ['worcesternews.co.uk', ['/news/local/', '/news/']],
    ['wiltsglosstandard.co.uk', ['/news/local/', '/news/']],
    ['thisisthewestcountry.co.uk', ['/news/local/', '/news/']]
  ]);

  constructor(private region: string, private sourceInfo: any, private baseUrl: string) {
    this.extractor = new UniversalContentExtractor(baseUrl);
    this.retryStrategy = new EnhancedRetryStrategies();
  }

  private shouldUseNewsquestArcStrategy(): boolean {
    try {
      const hostname = new URL(this.baseUrl).hostname.toLowerCase();
      const normalized = hostname.replace(/^www\./, '');

      if (this.newsquestDomains.has(normalized)) {
        return true;
      }

      const publisher = String(this.sourceInfo?.publisher || this.sourceInfo?.owner || '').toLowerCase();
      if (publisher.includes('newsquest')) {
        return true;
      }

      const tags: unknown = this.sourceInfo?.tags || this.sourceInfo?.labels;
      if (Array.isArray(tags)) {
        const hasNewsquestTag = tags.some(tag =>
          typeof tag === 'string' && tag.toLowerCase().includes('newsquest')
        );
        if (hasNewsquestTag) {
          return true;
        }
      }

      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Failed to evaluate Newsquest Arc strategy eligibility: ${message}`);
      return false;
    }
  }

  async executeScrapingStrategy(): Promise<ScrapingResult> {
    console.log(`🚀 Starting enhanced scraping for ${this.sourceInfo?.source_name || this.baseUrl}`);

    try {
      const aggregatedErrors: string[] = [];
      const strategies: Array<{ name: string; executor: () => Promise<ScrapingResult> }> = [];

      if (this.shouldUseNewsquestArcStrategy()) {
        strategies.push({ name: 'newsquest_arc', executor: () => this.tryNewsquestArcStrategy() });
      }

      strategies.push(
        { name: 'structured_data', executor: () => this.tryStructuredDataStrategy() },
        { name: 'rss', executor: () => this.tryRSSStrategy() },
        { name: 'sitemap', executor: () => this.trySitemapStrategy() },
        { name: 'html', executor: () => this.tryEnhancedHTMLStrategy() },
        { name: 'discovery', executor: () => this.tryHeuristicDiscovery() }
      );

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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Top-level scraping error:', errorMessage);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [errorMessage],
        method: 'fallback'
      };
    }
  }

  private async tryNewsquestArcStrategy(): Promise<ScrapingResult> {
    console.log('📰 Attempting Newsquest Arc API extraction...');

    try {
      const base = new URL(this.baseUrl);
      const hostname = base.hostname.toLowerCase();
      const { sectionPath, source: sectionSource } = this.resolveNewsquestSectionPath(base);

      if (!sectionPath) {
        console.log('⚠️ Newsquest Arc strategy skipped: no section path resolved');
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['Unable to resolve section path for Arc API'],
          method: 'api'
        };
      }

      if (sectionSource) {
        console.log(`ℹ️ Using fallback Newsquest section path "${sectionPath}" (source: ${sectionSource})`);
      }

      const arcSiteCandidate = this.resolveArcSiteSlug(hostname);
      const client = new NewsquestArcClient(hostname, sectionPath, arcSiteCandidate);

      let stories: NewsquestArcArticle[] = [];
      try {
        stories = await client.fetchSectionArticles({ limit: 25 });
      } catch (apiError) {
        const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
        console.log(`❌ Newsquest Arc API fetch failed: ${apiMessage}`);
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: [apiMessage],
          method: 'api'
        };
      }

      if (!stories.length) {
        console.log('⚠️ Newsquest Arc API returned no stories');
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['Arc API returned no content'],
          method: 'api'
        };
      }

      const articles: ArticleData[] = [];

      for (const story of stories) {
        const textForMetrics = story.bodyText || this.stripHtmlSafe(story.bodyHtml);
        const wordCount = this.countWords(textForMetrics);

        if (wordCount < 40) {
          console.log(`⚠️ Skipping short Arc story (${wordCount} words): ${story.title}`);
          continue;
        }

        const regionalRelevance = this.calculateEnhancedRegionalRelevance(
          textForMetrics,
          story.title,
          story.url
        );

        const qualityScore = Math.min(95, 55 + Math.floor(wordCount / 15));

        const articleBody = story.bodyHtml || `<p>${story.bodyText}</p>`;

        articles.push({
          title: story.title,
          body: articleBody,
          author: story.author,
          published_at: story.publishedAt,
          source_url: story.url,
          image_url: story.imageUrl,
          word_count: wordCount,
          regional_relevance_score: regionalRelevance,
          content_quality_score: qualityScore,
          processing_status: 'new',
          import_metadata: {
            extraction_method: 'newsquest_arc',
            arc_story_id: story.id,
            arc_site: story.arcSite,
            arc_section: story.section,
            arc_summary: story.summary,
            scrape_timestamp: new Date().toISOString()
          }
        });
      }

      if (!articles.length) {
        return {
          success: false,
          articles: [],
          articlesFound: stories.length,
          articlesScraped: 0,
          errors: ['Arc API provided stories but none passed quality filters'],
          method: 'api'
        };
      }

      console.log(`✅ Newsquest Arc API succeeded with ${articles.length} articles`);
      return {
        success: true,
        articles,
        articlesFound: stories.length,
        articlesScraped: articles.length,
        errors: [],
        method: 'api'
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Newsquest Arc strategy error: ${message}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [message],
        method: 'api'
      };
    }
  }

  private async tryStructuredDataStrategy(): Promise<ScrapingResult> {
    console.log('📋 Attempting structured data extraction...');
    
    try {
      const html = await this.retryStrategy.fetchWithEnhancedRetry(this.baseUrl);
      
      const candidates = this.extractor.extractStructuredArticleCandidates(html, this.baseUrl);
      
      if (candidates.length === 0) {
        console.log('⚠️ No structured data candidates found');
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['No structured article data found'],
          method: 'fallback'
        };
      }

      console.log(`📋 Found ${candidates.length} structured data candidates`);
      
      const articles: ArticleData[] = [];
      let processedCount = 0;
      const maxToProcess = Math.min(candidates.length, 20);

      for (const candidate of candidates.slice(0, maxToProcess)) {
        try {
          if (!this.extractor.isAllowedExternalUrl(candidate.url)) {
            console.log(`⚠️ Skipping blocked URL: ${candidate.url}`);
            continue;
          }

          const extractor = new UniversalContentExtractor(candidate.url);
          const articleHtml = await this.retryStrategy.fetchWithEnhancedRetry(candidate.url);
          const extracted = extractor.extractContentFromHTML(articleHtml, candidate.url);
          
          if (extracted.word_count < 100) {
            console.log(`⚠️ Article too short: ${extracted.word_count} words`);
            continue;
          }

          const relevanceScore = this.calculateEnhancedRegionalRelevance(
            extracted.body,
            extracted.title,
            candidate.url
          );

          const prunedHints = UniversalContentExtractor.pruneStructuredHintsForStorage(candidate);

          articles.push({
            title: extracted.title,
            body: extracted.body,
            author: extracted.author,
            published_at: extracted.published_at,
            source_url: candidate.url,
            image_url: candidate.image,
            word_count: extracted.word_count,
            regional_relevance_score: relevanceScore,
            content_quality_score: extracted.content_quality_score,
            processing_status: 'new',
            import_metadata: {
              extraction_method: 'structured_data',
              structured_data_hints: prunedHints,
              scrape_timestamp: new Date().toISOString(),
              extractor_version: '2.0'
            }
          });

          processedCount++;
        } catch (articleError) {
          const errorMessage = articleError instanceof Error ? articleError.message : String(articleError);
          console.log(`⚠️ Failed to process article ${candidate.url}: ${errorMessage}`);
          continue;
        }
      }

      return {
        success: articles.length > 0,
        articles,
        articlesFound: candidates.length,
        articlesScraped: articles.length,
        errors: articles.length === 0 ? ['No valid articles extracted from structured data'] : [],
        method: 'html'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Structured data extraction failed:', errorMessage);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [errorMessage],
        method: 'fallback'
      };
    }
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
            const rssContent = await this.retryStrategy.fetchWithEnhancedRetry(govFeedUrl);
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
          const rssContent = await this.retryStrategy.fetchWithEnhancedRetry(feedLink);
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
    let usedSnippetFallback = false;
    let snippetReason: string | undefined;
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
        usedSnippetFallback = true;
        snippetReason = 'rss_fallback_after_extraction_error';
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

    if (!usedSnippetFallback && description && finalContent === description && wordCount < 120) {
      usedSnippetFallback = true;
      snippetReason = 'rss_description_truncated';
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
      is_snippet: usedSnippetFallback || undefined,
      snippet_reason: snippetReason,
      import_metadata: {
        extraction_method: finalContent === description ? 'rss_fallback' : 'enhanced_rss',
        rss_description: description,
        source_domain: this.sourceInfo?.canonical_domain,
        scrape_timestamp: new Date().toISOString(),
        extractor_version: '2.0',
        is_snippet: usedSnippetFallback,
        snippet_reason: snippetReason
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

  private normalizeCandidateUrl(url: string): string {
    return url.toLowerCase().replace(/\/$/, '');
  }

  private resolveUrl(url: string, baseUrl: string): string | null {
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

  private stripHtmlSafe(html: string): string {
    if (!html) {
      return '';
    }

    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractSectionPath(pathname: string): string | null {
    if (!pathname) {
      return null;
    }

    const normalized = pathname
      .replace(/\/+/g, '/')
      .replace(/\/index\.html?$/i, '')
      .replace(/\/$/, '');

    if (!normalized || normalized === '') {
      return null;
    }

    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  private resolveNewsquestSectionPath(base: URL): { sectionPath: string | null; source: string | null } {
    const directSection = this.extractSectionPath(base.pathname);
    if (directSection) {
      return { sectionPath: directSection, source: null };
    }

    const hostname = base.hostname.toLowerCase();
    const domainKey = hostname.replace(/^www\./, '');
    const candidates: Array<{ value: string; source: string }> = [];

    const collectCandidate = (candidate: unknown, source: string) => {
      const normalized = this.normalizeSectionCandidate(candidate, base);
      if (normalized) {
        candidates.push({ value: normalized, source });
      }
    };

    const directFields = [
      ['arc_section', this.sourceInfo?.arc_section],
      ['arcSection', this.sourceInfo?.arcSection],
      ['newsquest_section', this.sourceInfo?.newsquest_section],
      ['initial_path', this.sourceInfo?.initial_path],
      ['default_path', this.sourceInfo?.default_path],
      ['primary_path', this.sourceInfo?.primary_path],
      ['feed_path', this.sourceInfo?.feed_path]
    ] as Array<[string, unknown]>;

    for (const [key, value] of directFields) {
      collectCandidate(value, `sourceInfo.${key}`);
    }

    const nestedSources = [
      this.sourceInfo?.metadata,
      this.sourceInfo?.settings,
      this.sourceInfo?.config
    ];

    const nestedKeys = ['arc_section', 'section', 'section_path', 'default_path', 'initial_path'];

    for (const nested of nestedSources) {
      if (!nested || typeof nested !== 'object') {
        continue;
      }

      const scopeName = nested === this.sourceInfo?.metadata
        ? 'metadata'
        : nested === this.sourceInfo?.settings
          ? 'settings'
          : 'config';

      for (const key of nestedKeys) {
        if (key in nested) {
          collectCandidate((nested as Record<string, unknown>)[key], `${scopeName}.${key}`);
        }
      }
    }

    if (this.newsquestSectionFallbacks.has(domainKey)) {
      for (const fallback of this.newsquestSectionFallbacks.get(domainKey) || []) {
        collectCandidate(fallback, 'preseeded-fallback');
      }
    }

    if (this.newsquestDomains.has(domainKey)) {
      const slugify = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

      const regionSlug = typeof this.region === 'string' ? slugify(this.region) : '';
      const topicSlug = typeof this.sourceInfo?.topic_name === 'string'
        ? slugify(this.sourceInfo.topic_name)
        : '';

      const heuristicCandidates = new Set<string>();
      if (regionSlug) {
        heuristicCandidates.add(`/news/local/${regionSlug}`);
        heuristicCandidates.add(`/news/${regionSlug}`);
      }
      if (topicSlug && topicSlug !== regionSlug) {
        heuristicCandidates.add(`/news/local/${topicSlug}`);
      }
      heuristicCandidates.add('/news/local/');
      heuristicCandidates.add('/news/');

      for (const fallback of heuristicCandidates) {
        collectCandidate(fallback, 'heuristic');
      }
    }

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.value)) {
        continue;
      }
      seen.add(candidate.value);
      return { sectionPath: candidate.value, source: candidate.source };
    }

    return { sectionPath: null, source: null };
  }

  private normalizeSectionCandidate(candidate: unknown, base: URL): string | null {
    if (typeof candidate !== 'string') {
      return null;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    let path = trimmed;
    try {
      const maybeUrl = new URL(trimmed, base.origin);
      if (maybeUrl) {
        path = maybeUrl.pathname;
      }
    } catch {
      // Ignore invalid URL formats
    }

    return this.extractSectionPath(path);
  }

  private resolveArcSiteSlug(hostname: string): string | undefined {
    const configured = this.sourceInfo?.arc_site || this.sourceInfo?.arcSite || this.sourceInfo?.site_slug;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured.trim();
    }

    const normalized = hostname.replace(/^www\./, '');
    if (this.newsquestDomains.has(normalized)) {
      return normalized.split('.')[0];
    }

    return undefined;
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
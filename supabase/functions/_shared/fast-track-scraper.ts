/**
 * Fast-track scraper optimized for Supabase Edge Functions
 * Reduces timeouts by using quick accessibility checks and limited processing
 */

import { ScrapingResult, ArticleData } from './types.ts';
import { UniversalContentExtractor } from './universal-content-extractor.ts';
import { calculateRegionalRelevance } from './region-config.ts';
import { EnhancedRetryStrategies } from './enhanced-retry-strategies.ts';
import { resolveDomainProfile, DomainProfile } from './domain-profiles.ts';
import { NewsquestArcClient } from './newsquest-arc-client.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

export class FastTrackScraper {
  private extractor: UniversalContentExtractor;
  private retryStrategy: EnhancedRetryStrategies;
  private accessibilityCache = new Map<string, boolean>();
  private region: string = '';
  private sourceInfo: any = {};
  private sourceId: string = '';
  private sourceMetadata: Record<string, any> = {};
  private baseUrl: string = '';
  private domainProfile: DomainProfile | null = null;
  private strictScope?: { host: string; pathPrefix: string };
  private sourceConfig: Record<string, any> = {};

  constructor(private supabase: any) {
    // Initialize with a placeholder URL - will be updated when needed
    this.extractor = new UniversalContentExtractor('https://example.com');
    this.retryStrategy = new EnhancedRetryStrategies();
  }

  async quickDiagnosis(url: string) {
    return await this.retryStrategy.quickAccessibilityCheck(url);
  }

  async scrapeContent(feedUrl: string, sourceId: string, options: any = {}): Promise<ScrapingResult> {
    console.log(`🚀 FastTrackScraper.scrapeContent called for ${feedUrl}`);
    
    try {
      // Get source information from database with topic_id from junction table
      const { data: source, error: sourceError } = await this.supabase
        .from('content_sources')
        .select(`
          *,
          topic_sources!inner(topic_id)
        `)
        .eq('id', sourceId)
        .single();

      if (sourceError || !source) {
        throw new Error(`Failed to get source info: ${sourceError?.message}`);
      }

      // Extract topic_id from junction table
      const topicId = source.topic_sources?.[0]?.topic_id || null;

      // Get topic information to determine region
      let topicRegion = 'Global'; // default
      if (topicId) {
        const { data: topic } = await this.supabase
          .from('topics')
          .select('region, name')
          .eq('id', topicId)
          .single();
        
        if (topic && topic.region) {
          topicRegion = topic.region;
        }
      }

      // Set up instance variables for this scraping run
      this.region = topicRegion;
      this.sourceInfo = source;
      this.sourceId = sourceId;
      this.sourceMetadata = {
        confirmed_arc_section: source.confirmed_arc_section,
        ...(source.metadata || {})
      };
      this.sourceConfig = source.scraping_config || {};
      this.baseUrl = feedUrl;
      this.extractor = new UniversalContentExtractor(feedUrl);
      this.strictScope = options.strictScope;

      // Resolve domain profile for this source
      this.domainProfile = await resolveDomainProfile(
        this.supabase,
        feedUrl,
        topicId,
        null, // tenantId not used yet
        source.metadata || {}
      );

      if (this.domainProfile) {
        console.log(`🔧 Domain profile resolved for ${source.source_name}:`, {
          family: this.domainProfile.family,
          arcSite: this.domainProfile.arcSite,
          bypassHead: this.domainProfile.accessibility?.bypassHead
        });
      }

      console.log(`📍 Scraping with region: ${this.region}, source: ${source.source_name}`);

      // Execute the existing scraping strategy
      return await this.executeScrapingStrategy();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ FastTrackScraper.scrapeContent error:`, error);
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

  async executeScrapingStrategy(): Promise<ScrapingResult> {
    console.log(`🚀 Fast-track scraper started for ${this.sourceInfo?.source_name || this.baseUrl}`);
    
    if (this.strictScope) {
      console.log(`🔒 Strict scope ON: restricting to pathPrefix="${this.strictScope.pathPrefix}"`);
    }
    
    // Quick accessibility check using domain profile hints
    const shouldBypassHead = this.domainProfile?.accessibility?.bypassHead || false;
    const domainFamily = this.domainProfile?.family;
    
    const accessibilityResult = await this.retryStrategy.quickAccessibilityCheck(
      this.baseUrl,
      shouldBypassHead ? { bypassHead: true, domainHint: domainFamily || 'unknown' } : {}
    );

    console.log(
      `🩺 Accessibility diagnosis: ${accessibilityResult.diagnosis}` +
      (accessibilityResult.blockingServer ? ` (server: ${accessibilityResult.blockingServer})` : '')
    );

    // Override block for newsquest family or any domain with special accessibility config
    const shouldOverrideBlock = (this.domainProfile?.family === 'newsquest' || shouldBypassHead) && 
      !accessibilityResult.accessible &&
      accessibilityResult.diagnosis !== 'network-block';

    if (shouldOverrideBlock) {
      console.log(`🟡 ${this.domainProfile?.family || 'Special'} domain flagged as inaccessible, continuing with enhanced retries for snippet fallback.`);
    }

    if (!accessibilityResult.accessible && !shouldOverrideBlock) {
      console.log(`❌ Source not accessible: ${accessibilityResult.error}`);

      const diagnosisNote = `Source not accessible (${accessibilityResult.diagnosis})` +
        (accessibilityResult.blockingServer ? ` via ${accessibilityResult.blockingServer}` : '');

      const errors: string[] = [
        accessibilityResult.error
          ? `${diagnosisNote}: ${accessibilityResult.error}`
          : diagnosisNote
      ];

      if (accessibilityResult.diagnosis === 'network-block') {
        errors.push('Network or proxy blocked the request – schedule screenshot or remote browser fallback.');
      } else if (accessibilityResult.diagnosis === 'cookie-required') {
        errors.push('Requires cookie warm-up – ensure warm-up hints are reused before scraping.');
      } else if (accessibilityResult.diagnosis === 'partial-get-blocked') {
        errors.push('Partial GET requests rejected – escalate to full GET with warm-up before parsing.');
      } else if (accessibilityResult.diagnosis === 'alternate-route') {
        errors.push('Primary route blocked – retry with AMP/mobile alternates or screenshot fallback.');
      } else if (accessibilityResult.diagnosis === 'residential-required') {
        errors.push('Source blocks datacenter probes – reuse residential-style IP headers or browser fallback.');
      }

      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors,
        method: 'fallback'
      };
    }

    if (accessibilityResult.accessible) {
      console.log(`✅ Source accessible (${accessibilityResult.responseTime}ms)`);
    } else if (shouldOverrideBlock) {
      console.log('🟡 Treating source as accessible due to Newsquest override.');
    }

    // Check for domain-specific scraping strategy preferences
    const strategyConfig = this.domainProfile?.scrapingStrategy;
    const skipStrategies = new Set(strategyConfig?.skip || []);
    const preferredStrategy = strategyConfig?.preferred;

    if (preferredStrategy) {
      console.log(`🎯 Domain profile prefers "${preferredStrategy}" strategy`, 
        skipStrategies.size > 0 ? `(skipping: ${Array.from(skipStrategies).join(', ')})` : '');
    }

    // Execute strategies based on preference
    if (preferredStrategy === 'html' && !skipStrategies.has('html')) {
      console.log('📄 Using preferred HTML parsing strategy...');
      return await this.tryFastHTMLStrategy();
    }

    if (preferredStrategy === 'rss' && !skipStrategies.has('rss')) {
      console.log('📰 Using preferred RSS strategy...');
      const rssResult = await this.tryFastRSSStrategy();
      if (rssResult.success && rssResult.articles.length > 0) {
        return rssResult;
      }
    }

    // Try Newsquest Arc API if not skipped and applicable
    if (!skipStrategies.has('arc') && 
        (this.domainProfile?.family === 'newsquest' || this.sourceInfo?.scraping_config?.arcSite)) {
      console.log('🎯 Using Newsquest Arc API strategy...');
      const arcResult = await this.tryNewsquestArcStrategy();
      if (arcResult.success && arcResult.articles.length > 0) {
        return arcResult;
      }
      
      // Under strict scope, if Arc fails, return 0 articles (no generic drift)
      if (this.strictScope) {
        console.log('🔒 Arc API returned no articles - ending scrape (strict scope, no generic fallbacks)');
        return {
          success: true,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: [],
          method: 'arc_api',
          metadata: { strict_scope_enforced: true }
        };
      }
    }
    
    // Skip other strategies if strict scope is active
    if (this.strictScope) {
      console.log('🔒 Strict scope active - skipping RSS and HTML fallbacks');
      return {
        success: true,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [],
        method: 'strict_scope',
        metadata: { strict_scope_enforced: true }
      };
    }
    
    // Try structured data extraction (fastest when available)
    if (!skipStrategies.has('html')) {
      const structuredResult = await this.tryStructuredDataExtraction();
      if (structuredResult.success && structuredResult.articles.length > 0) {
        return structuredResult;
      }
    }

    // Try RSS with reduced processing if not already tried
    if (!skipStrategies.has('rss') && preferredStrategy !== 'rss') {
      const rssResult = await this.tryFastRSSStrategy();
      if (rssResult.success && rssResult.articles.length > 0) {
        return rssResult;
      }
    }
    
    // Fallback to minimal HTML parsing if not already tried
    if (!skipStrategies.has('html') && preferredStrategy !== 'html') {
      console.log('📄 Fallback to fast HTML parsing...');
      return await this.tryFastHTMLStrategy();
    }

    // No strategies left to try
    return {
      success: false,
      articles: [],
      articlesFound: 0,
      articlesScraped: 0,
      errors: ['All configured scraping strategies were skipped or failed'],
      method: 'none'
    };
  }

  private async tryNewsquestArcStrategy(): Promise<ScrapingResult> {
    try {
      // Prioritize source-specific arcSite, check BEFORE returning
      const arcSite = this.sourceInfo?.scraping_config?.arcSite || this.domainProfile?.arcSite;
      
      if (!arcSite) {
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['No Arc site slug configured in domain profile or source config'],
          method: 'arc_api'
        };
      }

      const domain = new URL(this.baseUrl).hostname;
      
      // Priority order: strictScope > scraping_config > confirmed_arc_section > URL > fallbacks
      let sectionPath: string;
      if (this.strictScope) {
        sectionPath = this.strictScope.pathPrefix;
        console.log(`🔒 Using strict scope path: ${sectionPath}`);
      } else if (this.sourceInfo?.scraping_config?.sectionPath) {
        sectionPath = this.sourceInfo.scraping_config.sectionPath;
        console.log(`✅ Using source-specific Arc section: ${sectionPath}`);
      } else if (this.sourceMetadata?.confirmed_arc_section) {
        sectionPath = this.sourceMetadata.confirmed_arc_section;
        console.log(`✅ Using confirmed Arc section: ${sectionPath}`);
      } else {
        const urlPath = new URL(this.baseUrl).pathname;
        sectionPath = this.domainProfile?.sectionFallbacks?.[0] || urlPath;
        console.log(`🔍 Using ${this.domainProfile?.sectionFallbacks?.[0] ? 'domain fallback' : 'URL path'}: ${sectionPath}`);
      }
      
      console.log(`📡 Initializing Newsquest Arc API client for ${domain} / ${sectionPath}`);
      console.log(`   Arc site slug: ${arcSite}`);
      console.log(`   Source config:`, this.sourceInfo?.scraping_config);
      
      const arcClient = new NewsquestArcClient(
        domain,
        sectionPath,
        arcSite,
        this.sourceInfo?.scraping_config // Pass source-specific config
      );
      
      let arcArticles;
      let httpStatus = 200;
      
      try {
        arcArticles = await arcClient.fetchSectionArticles({ limit: 20, sortBy: 'published_date' });
      } catch (fetchError: any) {
        httpStatus = fetchError.status || 0;
        console.error(`❌ Arc API HTTP error: ${httpStatus} - ${fetchError.message}`);
        
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: [`Arc API HTTP ${httpStatus}: ${fetchError.message}`],
          method: 'arc_api',
          metadata: {
            arc_http_status: httpStatus,
            arc_error_type: httpStatus >= 500 ? 'server_error' : httpStatus === 404 ? 'section_not_found' : 'network',
            arc_section_attempted: sectionPath,
            arc_site_slug: this.domainProfile.arcSite
          }
        };
      }
      
      if (!arcArticles || arcArticles.length === 0) {
        console.log('⚠️ Arc API returned no articles (empty payload)');
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['Arc API returned no articles'],
          method: 'arc_api',
          metadata: {
            arc_http_status: httpStatus,
            arc_error_type: 'empty_payload',
            arc_section_attempted: sectionPath,
            arc_site_slug: this.domainProfile.arcSite
          }
        };
      }

      console.log(`✅ Arc API returned ${arcArticles.length} articles`);
      
      // Transform NewsquestArcArticle[] to ArticleData[]
      const articles: ArticleData[] = arcArticles.map(arcArticle => ({
        title: arcArticle.title,
        body: arcArticle.bodyText || arcArticle.bodyHtml,
        author: arcArticle.author,
        published_at: arcArticle.publishedDate,
        source_url: arcArticle.url,
        image_url: arcArticle.imageUrl,
        word_count: arcArticle.wordCount,
        regional_relevance_score: 0,
        content_quality_score: 0,
        processing_status: 'new' as const,
        import_metadata: {
          extraction_method: 'arc_api',
          arc_id: arcArticle.id,
          arc_type: arcArticle.type,
          arc_section: sectionPath,
          arc_site_slug: this.domainProfile.arcSite,
          scraped_at: new Date().toISOString(),
          fast_track: true
        }
      }));

      // Persist confirmed section path for future scrapes
      if (this.sourceId && !this.sourceMetadata?.confirmed_arc_section) {
        try {
          await this.supabase
            .from('content_sources')
            .update({ confirmed_arc_section: sectionPath })
            .eq('id', this.sourceId);
          console.log(`✅ Persisted confirmed Arc section: ${sectionPath}`);
        } catch (updateError) {
          console.error('⚠️ Failed to persist confirmed Arc section:', updateError);
        }
      }

      return {
        success: true,
        articles,
        articlesFound: arcArticles.length,
        articlesScraped: articles.length,
        errors: [],
        method: 'arc_api',
        metadata: {
          arc_http_status: httpStatus,
          arc_section: sectionPath,
          arc_site_slug: this.domainProfile.arcSite
        }
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Newsquest Arc API strategy failed:', errorMessage);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [errorMessage],
        method: 'arc_api',
        metadata: {
          arc_error_type: 'unexpected',
          arc_error_message: errorMessage
        }
      };
    }
  }

  private async tryStructuredDataExtraction(): Promise<ScrapingResult> {
    try {
      console.log('📋 Attempting fast structured data extraction...');
      const html = await this.retryStrategy.fetchWithEnhancedRetry(this.baseUrl);
      
      const candidates = this.extractor.extractStructuredArticleCandidates(html, this.baseUrl);
      
      if (candidates.length === 0) {
        console.log('⚠️ No structured data found');
        return {
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: ['No structured data found'],
          method: 'fallback'
        };
      }

      console.log(`📋 Found ${candidates.length} structured candidates (processing max 5 for speed)`);
      
      const articles: ArticleData[] = [];
      const maxToProcess = Math.min(candidates.length, 5);

      for (const candidate of candidates.slice(0, maxToProcess)) {
        try {
          if (!this.extractor.isAllowedExternalUrl(candidate.url)) {
            console.log(`⚠️ Skipping blocked URL: ${candidate.url}`);
            continue;
          }

          const articleExtractor = new UniversalContentExtractor(candidate.url);
          const articleHtml = await this.retryStrategy.fetchWithEnhancedRetry(candidate.url);
          const extracted = articleExtractor.extractContentFromHTML(articleHtml, candidate.url);
          
          if (!this.isFastQualified(extracted)) {
            console.log(`⚠️ Article failed fast qualification`);
            continue;
          }

          const regionalConfig = {
            keywords: [],
            region_name: this.region || 'unknown'
          };
          
          const relevanceScore = calculateRegionalRelevance(
            extracted.body,
            extracted.title,
            regionalConfig,
            this.sourceInfo?.source_type || 'national'
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
              scraped_at: new Date().toISOString(),
              fast_track: true
            }
          });
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
        errors: [],
        method: 'html'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Fast structured data extraction failed:', errorMessage);
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

  private async tryFastRSSStrategy(): Promise<ScrapingResult> {
    console.log('🔄 Fast RSS parsing...');
    
    const feedUrl = this.baseUrl; // Always use the topic-specific URL passed to scrapeContent()
    
    try {
      // Use domain-specific strategy for better success rates
      const rssContent = await this.retryStrategy.fetchWithDomainSpecificStrategy(feedUrl);
      
      return await this.parseFastRSSContent(rssContent, feedUrl);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Fast RSS parsing failed: ${errorMessage}`);
      
      // Log source health for monitoring
      await this.retryStrategy.logSourceHealth(
        this.sourceInfo?.id,
        feedUrl,
        false,
        errorMessage
      );
      
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

  private async tryFastHTMLStrategy(): Promise<ScrapingResult> {
    console.log('🔄 Fast HTML parsing...');
    
    try {
      // Use domain-specific strategy for better success
      const html = await this.retryStrategy.fetchWithDomainSpecificStrategy(this.baseUrl);
      
      // Check if RSS should be skipped based on domain profile strategy
      const strategyConfig = this.domainProfile?.scrapingStrategy;
      const skipRSS = strategyConfig?.skip?.includes('rss') || false;
      
      if (!skipRSS) {
        // Look for RSS feeds first (unless RSS is skipped)
        const feedLinks = this.extractFeedLinks(html, this.baseUrl);
        console.log(`🔍 Discovered ${feedLinks.length} RSS feed(s):`, feedLinks.slice(0, 3));
        
        // Try standard WordPress feed paths if no feeds discovered
        if (feedLinks.length === 0) {
          const standardFeeds = [
            new URL('/feed/', this.baseUrl).href,
            new URL('/rss/', this.baseUrl).href,
            new URL('/feed/rss/', this.baseUrl).href
          ];
          console.log(`🔄 No feeds discovered, trying standard WordPress paths:`, standardFeeds);
          feedLinks.push(...standardFeeds);
        }
        
        for (const feedLink of feedLinks.slice(0, 3)) { // Try first 3 feeds
          try {
            console.log(`📡 Trying feed: ${feedLink}`);
            const rssContent = await this.retryStrategy.fetchWithDomainSpecificStrategy(feedLink);
            const result = await this.parseFastRSSContent(rssContent, feedLink);
            if (result.success && result.articles.length > 0) {
              console.log(`✅ Feed success: ${feedLink} → ${result.articles.length} articles`);
              return { ...result, method: 'rss' };
            } else {
              console.log(`⚠️ Feed found no articles: ${feedLink}`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`❌ Feed failed: ${feedLink} - ${errorMessage}`);
          }
        }
      } else {
        console.log('⏭️ Skipping RSS feed discovery (per domain profile strategy)');
      }
      
      // Parse HTML articles with strict limits
      console.log('📄 Parsing HTML for article links...');
      return await this.parseFastHTMLArticles(html, this.baseUrl);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Fast HTML parsing failed: ${errorMessage}`);
      
      // Log source health for monitoring
      await this.retryStrategy.logSourceHealth(
        this.sourceInfo?.id,
        this.baseUrl,
        false,
        errorMessage
      );
      
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

  private async parseFastRSSContent(rssContent: string, feedUrl: string): Promise<ScrapingResult> {
    console.log('📊 Fast RSS parsing...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      const itemMatches = rssContent.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
      console.log(`📄 Found ${itemMatches.length} RSS items in feed (processing max 20)`);

      let qualifiedCount = 0;
      let rejectedCount = 0;

      // Process only first 20 RSS items for speed
      for (const itemMatch of itemMatches.slice(0, 20)) {
        try {
          const article = await this.parseFastRSSItem(itemMatch, feedUrl);
          if (article) {
            if (this.isFastQualified(article)) {
              articles.push(article);
              qualifiedCount++;
            } else {
              rejectedCount++;
            }
          }
        } catch (error) {
          const parseErrorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`RSS item error: ${parseErrorMessage}`);
          if (errors.length > 5) break; // Stop after 5 errors
        }
      }

      console.log(`📊 RSS Results: ${qualifiedCount} qualified, ${rejectedCount} rejected from ${itemMatches.length} items`);

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
      console.log(`❌ RSS content parsing failed: ${parseErrorMessage}`);
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
    let usedSnippetFallback = false;
    let snippetReason: string | undefined;

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
        const articleHtml = await this.retryStrategy.fetchWithEnhancedRetry(articleUrl);
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
        const extractErrorMessage = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ Full extraction failed, using RSS content as fallback: ${extractErrorMessage}`);
        
        // For regional sources, accept RSS snippet even if extraction failed
        if (isRegionalTopic || isWhitelistedDomain) {
          console.log(`📝 Regional/whitelisted source: Accepting RSS snippet as fallback content`);
          // Mark content as snippet for editor review
          finalContent = `${description}\n\n[Note: This is a content snippet from RSS feed. Full article extraction failed.]`;
          usedSnippetFallback = true;
          snippetReason = 'rss_fallback_after_extraction_error';
        }
      }
    }

    if (!usedSnippetFallback && description && finalContent === description && isLikelySnippet) {
      usedSnippetFallback = true;
      snippetReason = 'rss_description_truncated';
    }

    // Calculate regional relevance quickly
    const regionalConfig = {
      keywords: [],
      region_name: this.region || 'unknown'
    };
    
    const regionalRelevance = calculateRegionalRelevance(
      finalContent,
      finalTitle,
      regionalConfig,
      this.sourceInfo?.source_type || 'national'
    );

    wordCount = this.countWords(finalContent);

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
      is_snippet: usedSnippetFallback || undefined,
      snippet_reason: snippetReason,
      import_metadata: {
        extraction_method: 'fast_track_rss',
        rss_description: description,
        source_domain: this.sourceInfo?.canonical_domain,
        scrape_timestamp: new Date().toISOString(),
        extractor_version: '3.0-fast',
        is_snippet: usedSnippetFallback,
        snippet_reason: snippetReason
      }
    };
  }

  private async parseFastHTMLArticles(html: string, baseUrl: string): Promise<ScrapingResult> {
    console.log('📊 Fast HTML article parsing...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];
    let articleLinks: string[] = [];

    try {
      // Check if this is an index/category page
      if (this.isIndexOrCategoryPage(html, baseUrl)) {
        console.log('📋 Detected index/category page - extracting article links...');
        articleLinks = this.extractArticleLinksFromIndex(html, baseUrl);
        console.log(`📄 Found ${articleLinks.length} article links from index page`);
        
        // Check if this is a trusted source - process more articles
        const isTrustedSource = this.sourceConfig?.trust_content_relevance === true;
        const maxArticles = isTrustedSource ? 30 : 10;
        
        if (isTrustedSource) {
          console.log(`🔓 Trusted source detected - processing up to ${maxArticles} articles from index page`);
        }
        
        // Process the extracted article URLs
        for (const articleUrl of articleLinks.slice(0, maxArticles)) {
          try {
            if (!this.extractor.isAllowedExternalUrl(articleUrl)) {
              console.log(`⚠️ Skipping blocked URL: ${articleUrl}`);
              continue;
            }

            const extractor = new UniversalContentExtractor(articleUrl);
            const articleHtml = await this.retryStrategy.fetchWithEnhancedRetry(articleUrl);
            const extractedContent = extractor.extractContentFromHTML(articleHtml, articleUrl);
            
            if (extractedContent.body && this.isFastQualified(extractedContent)) {
              const regionalConfig = {
                keywords: [],
                region_name: this.region || 'unknown'
              };
              
              const regionalRelevance = calculateRegionalRelevance(
                extractedContent.body,
                extractedContent.title,
                regionalConfig,
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
                  extraction_method: 'fast_track_html_index',
                  source_domain: this.sourceInfo?.canonical_domain,
                  scrape_timestamp: new Date().toISOString(),
                  extractor_version: '3.0-fast',
                  from_index_page: true
                }
              });
            }
          } catch (error) {
            const articleErrorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Article error: ${articleErrorMessage}`);
            if (errors.length > 3) break; // Stop after 3 errors
          }
        }
      } else {
        // Use the original article link extraction for non-index pages
        articleLinks = this.extractor.extractArticleLinks(html, baseUrl);
        console.log(`📄 Found ${articleLinks.length} article links (processing max 5)`);

        // Only process first 5 articles for speed
        for (const articleUrl of articleLinks.slice(0, 5)) {
          try {
            const extractor = new UniversalContentExtractor(articleUrl);
            const articleHtml = await this.retryStrategy.fetchWithEnhancedRetry(articleUrl);
            const extractedContent = extractor.extractContentFromHTML(articleHtml, articleUrl);
            
            if (extractedContent.body && this.isFastQualified(extractedContent)) {
              const regionalConfig = {
                keywords: [],
                region_name: this.region || 'unknown'
              };
              
              const regionalRelevance = calculateRegionalRelevance(
                extractedContent.body,
                extractedContent.title,
                regionalConfig,
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
            const articleErrorMessage = error instanceof Error ? error.message : String(error);
            errors.push(`Article error: ${articleErrorMessage}`);
            if (errors.length > 3) break; // Stop after 3 errors
          }
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
      console.log(`❌ HTML article parsing failed: ${htmlErrorMessage}`);
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

  /**
   * Detect if a page is an index/category page that lists articles
   */
  private isIndexOrCategoryPage(html: string, url: string): boolean {
    const urlPath = url.toLowerCase();
    const urlObj = new URL(url);
    
    // Check domain profile category patterns first (highest priority)
    if (this.domainProfile?.categoryPatterns && this.domainProfile.categoryPatterns.length > 0) {
      for (const pattern of this.domainProfile.categoryPatterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(urlObj.pathname)) {
            console.log(`✅ Domain profile category pattern matched: ${pattern}`);
            return true;
          }
        } catch (error) {
          console.warn(`⚠️ Invalid regex pattern in domain profile: ${pattern}`);
        }
      }
    }
    
    // Category indicators in URL
    const categoryPatterns = [
      /\/news\/(national|local|crime|business|nostalgia|sport|uk|eastbourne-news)\/$/,
      /\/local-news\/.+\/$/,
      /\/category\//,
      /\/archive\//,
      /\/section\//
    ];
    
    if (categoryPatterns.some(p => p.test(urlPath))) {
      console.log('✅ URL pattern indicates index/category page');
      return true;
    }
    
    // HTML indicators: multiple article links, no main article body
    const hasMultipleArticleLinks = (html.match(/<article/gi) || []).length > 3;
    const hasArticleList = html.includes('article-list') || html.includes('story-list') || html.includes('news-list');
    const lacksMainArticle = !html.includes('class="article-body"') && !html.includes('class="story-body"');
    
    if (hasMultipleArticleLinks || (hasArticleList && lacksMainArticle)) {
      console.log('✅ HTML content indicates index/category page');
      return true;
    }
    
    return false;
  }

  /**
   * Extract individual article links from an index/category page using domain-specific patterns
   */
  private extractArticleLinksFromIndex(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    const linkMatches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];
    
    // Domain-specific article ID patterns
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    let articlePatterns: RegExp[] = [];
    
    // Check domain profile for custom article patterns (highest priority)
    if (this.domainProfile?.articlePatterns && this.domainProfile.articlePatterns.length > 0) {
      for (const pattern of this.domainProfile.articlePatterns) {
        try {
          articlePatterns.push(new RegExp(pattern, 'i'));
        } catch (error) {
          console.warn(`⚠️ Invalid regex pattern in domain profile: ${pattern}`);
        }
      }
      console.log(`🎯 Using ${articlePatterns.length} custom article patterns from domain profile`);
    }
    
    // Add fallback patterns based on domain profile family
    if (this.domainProfile?.family === 'regional_slug') {
      // Regional slug pattern: long slug-only URLs (e.g., eastsussex.news, sussex.press)
      articlePatterns.push(/^https?:\/\/[^\/]+\/[a-z0-9-]{20,}\/?$/);
      console.log('🎯 Added regional_slug article pattern');
    } else if (this.domainProfile?.family === 'newsquest') {
      // Newsquest pattern: /news/12345678.article-slug/
      articlePatterns.push(/\/news\/\d{6,}\.[^\/]+\/?$/);
      console.log('🎯 Added Newsquest article pattern');
    } else if (articlePatterns.length === 0) {
      // Generic pattern: look for URLs with article/story/post + slug
      articlePatterns.push(/\/(article|story|post)\/[a-z0-9-]{10,}\/?$/);
      console.log('🎯 Using generic article pattern');
    }
    
    for (const linkMatch of linkMatches) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(linkMatch);
      if (hrefMatch) {
        const url = this.extractor.resolveUrl(hrefMatch[1], baseUrl);
        const urlObj = new URL(url);
        
        // Check if URL matches any article pattern
        const matchesPattern = articlePatterns.some(pattern => {
          // Test both full URL and pathname only
          return pattern.test(url) || pattern.test(urlObj.pathname);
        });
        
        if (matchesPattern && this.isInternalLink(url, baseUrl)) {
          links.push(url);
        }
      }
    }
    
    return [...new Set(links)].slice(0, 15); // Get up to 15 unique articles
  }

  /**
   * Check if a URL is internal to the base domain
   */
  private isInternalLink(url: string, baseUrl: string): boolean {
    try {
      const urlDomain = new URL(url).hostname;
      const baseDomain = new URL(baseUrl).hostname;
      return urlDomain === baseDomain || urlDomain === `www.${baseDomain}` || baseDomain === `www.${urlDomain}`;
    } catch {
      return false;
    }
  }

  /**
   * Check if a domain should be whitelisted for snippet/date tolerance
   * Generic: checks if domain contains region name or is in topic's configured domains
   */
  private isWhitelistedDomain(url: string): boolean {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      
      // Check if domain contains the region name (e.g., "eastbourne" in domain)
      if (this.region) {
        const regionLower = this.region.toLowerCase();
        if (domain.includes(regionLower)) {
          console.log(`✅ Domain whitelisted: contains region "${this.region}"`);
          return true;
        }
      }
      
      // Check source-specific whitelist if configured
      const sourceWhitelist = this.sourceInfo?.snippet_tolerant_domains || [];
      if (sourceWhitelist.some((d: string) => domain.includes(d.toLowerCase()))) {
        console.log(`✅ Domain whitelisted: in source config`);
        return true;
      }
      
      // Fallback: common regional news domains (Sussex/South East England)
      // These are technical workarounds for sites with poor date/RSS handling
      const technicalWhitelist = [
        'theargus.co.uk',      // Sussex-wide news
        'sussexexpress.co.uk', // Sussex-wide
        'sussexlive.co.uk',    // Sussex-wide
      ];
      
      return technicalWhitelist.some(whitelist => domain.includes(whitelist));
    } catch {
      return false;
    }
  }

  private isFastQualified(content: any): boolean {
    const isWhitelisted = this.isWhitelistedDomain(this.baseUrl);
    const isRegionalTopic = this.region && this.region.toLowerCase() !== 'global';
    const titlePreview = content.title?.substring(0, 60) || 'untitled';
    
    // Handle missing dates - more permissive for regional/whitelisted sources
    if (!content.published_at) {
      if (isWhitelisted || isRegionalTopic) {
        console.log(`🟡 ACCEPT (no date, regional): "${titlePreview}"`);
        content.published_at = new Date().toISOString();
      } else {
        console.log(`🚫 REJECT (no date): "${titlePreview}"`);
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
          console.log(`🚫 REJECT (${daysOld}d old): "${titlePreview}"`);
          return false;
        }
      } else {
        if (isWhitelisted || isRegionalTopic) {
          console.log(`🟡 ACCEPT (bad date fixed, regional): "${titlePreview}"`);
          content.published_at = new Date().toISOString();
        } else {
          console.log(`🚫 REJECT (invalid date): "${titlePreview}"`);
          return false;
        }
      }
    } catch (error) {
      if (isWhitelisted || isRegionalTopic) {
        console.log(`🟡 ACCEPT (date error fixed, regional): "${titlePreview}"`);
        content.published_at = new Date().toISOString();
      } else {
        console.log(`🚫 REJECT (date parse error): "${titlePreview}"`);
        return false;
      }
    }

    // Basic content validation
    if (!content.title && !content.body) {
      console.log(`🚫 REJECT (no title/body): "${titlePreview}"`);
      return false;
    }
    
    const wordCount = this.countWords(content.body || '');
    const isSnippet = this.isContentSnippet(content.body || '', content.title || '');
    
    // More permissive requirements for regional/whitelisted sources
    if (isWhitelisted || isRegionalTopic) {
      const passes = wordCount >= 50 && (wordCount >= 75 || !isSnippet);
      if (passes) {
        console.log(`✅ ACCEPT (regional, ${wordCount}w, snippet=${isSnippet}): "${titlePreview}"`);
      } else {
        console.log(`🚫 REJECT (regional, ${wordCount}w < 50 or snippet): "${titlePreview}"`);
      }
      return passes;
    }
    
    // Standard requirements for other domains
    const passes = wordCount >= 100 && !isSnippet;
    if (passes) {
      console.log(`✅ ACCEPT (${wordCount}w): "${titlePreview}"`);
    } else {
      console.log(`🚫 REJECT (${wordCount}w < 100 or snippet): "${titlePreview}"`);
    }
    return passes;
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

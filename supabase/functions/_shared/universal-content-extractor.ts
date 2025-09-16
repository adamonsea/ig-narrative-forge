import { ContentExtractionResult } from './types.ts';

// Enhanced anti-detection user agents that rotate with healthcare-specific ones
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36',
  // Healthcare/medical site friendly agents
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Googlebot/2.1 (+http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com))',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
];

// Government and protected site patterns
const GOVERNMENT_SITE_PATTERNS = [
  /\.gov\./,
  /\.gov$/,
  /\.gov\.uk$/,
  /council\./,
  /police\./,
  /nhs\./
];

// Common government RSS feed paths to try
const GOVERNMENT_RSS_PATTERNS = [
  '/rss',
  '/rss.xml',
  '/feed',
  '/feed.xml',
  '/news.rss',
  '/news/rss',
  '/news/feed',
  '/feeds/news.xml',
  '/api/rss',
  '/atom.xml'
];

// Site-specific configurations for known problematic sites
const SITE_CONFIGS: Record<string, {
  contentSelectors: string[];
  titleSelectors?: string[];
  authorSelectors?: string[];
  excludeSelectors: string[];
  articleLinkPatterns?: RegExp[];
}> = {
  // Generic news site fallbacks
  'default': {
    contentSelectors: [
      'article',
      '[role="main"] .entry-content',
      '.post-content',
      '.article-content',
      '.content',
      '.story-body',
      '.article-body',
      'main .content'
    ],
    excludeSelectors: [
      '.sidebar',
      '.widget',
      '.related',
      '.comments',
      '.social',
      '.advertisement',
      '.ad-',
      'nav',
      'footer',
      'header',
      '.navigation'
    ]
  },
  // Phase 1: Enhanced configuration for The Argus
  'theargus.co.uk': {
    contentSelectors: [
      '.article__body',
      '.article-content', 
      '.story-body',
      '.field-name-body',
      'article .content',
      'main .content',
      '.article-text',
      '.content-body'
    ],
    titleSelectors: [
      '.article__headline',
      '.article-title',
      'h1.headline', 
      '.story-headline',
      'h1',
      '.main-headline'
    ],
    authorSelectors: [
      '.article__author',
      '.byline .author',
      '.story-byline',
      '[rel="author"]',
      '.author-name',
      '.byline'
    ],
    excludeSelectors: [
      '.sidebar',
      '.widget', 
      '.related',
      '.comments',
      '.social',
      '.advertisement',
      '.ad-',
      'nav',
      'footer',
      'header',
      '.navigation'
    ]
  },
  // Phase 2: Enhanced configuration for Brighton Journal
  'brightonjournal.co.uk': {
    contentSelectors: [
      '.entry-content',
      '.post-content', 
      '.article-content',
      '.wp-block-post-content',
      '.content',
      'article .text',
      'main .content',
      '.page-content',
      '.post-body'
    ],
    titleSelectors: [
      '.entry-title',
      '.post-title',
      'h1.title',
      '.page-title',
      'h1',
      '.article-title'
    ],
    authorSelectors: [
      '.entry-author',
      '.post-author',
      '.byline',
      '[rel="author"]',
      '.author',
      '.author-name'
    ],
    excludeSelectors: [
      '.sidebar',
      '.widget',
      '.related',
      '.comments',
      '.social',
      '.advertisement',
      '.ad-',
      'nav',
      'footer',
      'header',
      '.navigation',
      '.wp-sidebar'
    ]
  },
  // Phase 1: Enhanced configuration for Sussex Express
  'sussexexpress.co.uk': {
    contentSelectors: [
      '.article-body',
      '.article__body',
      '.story-content',
      '.field-name-body',
      'article .body',
      'main .article-content',
      '.content-body',
      '.article-text'
    ],
    titleSelectors: [
      '.article-headline',
      '.story-headline',
      'h1.title',
      '.page-title',
      'h1',
      '.main-headline'
    ],
    authorSelectors: [
      '.article-author',
      '.story-author',
      '.byline',
      '[rel="author"]',
      '.author',
      '.author-name'
    ],
    excludeSelectors: [
      '.sidebar',
      '.widget',
      '.related', 
      '.comments',
      '.social',
      '.advertisement',
      '.ad-',
      'nav',
      'footer',
      'header',
      '.navigation'
    ]
  }
};

// Enhanced article URL detection patterns
const ARTICLE_URL_PATTERNS = [
  /\/\d{4}\/\d{2}\/\d{2}\/[^\/]+\/?$/,  // Date-based URLs
  /\/article\/[^\/]+\/?$/,
  /\/news\/[^\/]+\/?$/,
  /\/story\/[^\/]+\/?$/,
  /\/posts?\/[^\/]+\/?$/,
  /\/blog\/[^\/]+\/?$/,
  /\/[^\/]+-\d+\/?$/,  // URLs ending with ID
  /\/[a-z0-9-]{10,}\/?$/  // Long slug-like URLs
];

const EXCLUDE_URL_PATTERNS = [
  /\.(jpg|jpeg|png|gif|pdf|mp4|mov|avi)$/i,
  /\/category\//,
  /\/tag\//,
  /\/author\//,
  /\/page\//,
  /\/search\//,
  /\/archive\//,
  /#/,
  /javascript:/,
  /mailto:/,
  /\/wp-admin/,
  /\/feed\//,
  /\/rss/
];

export class UniversalContentExtractor {
  private siteConfig: typeof SITE_CONFIGS['default'];
  private domain: string;
  private isGovernmentSite: boolean;
  private requestCount: number = 0;

  constructor(url: string) {
    const normalizedUrl = this.normalizeUrl(url);
    this.domain = this.extractDomain(normalizedUrl);
    this.siteConfig = SITE_CONFIGS[this.domain] || SITE_CONFIGS['default'];
    this.isGovernmentSite = this.detectGovernmentSite(normalizedUrl);
    
    // Enhanced configuration for better success rates
    if (this.isGovernmentSite) {
      this.siteConfig = {
        ...this.siteConfig,
        respectfulCrawling: true,
        minDelay: 3000,
        maxRetries: 5,
        timeout: 45000
      };
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  private detectGovernmentSite(url: string): boolean {
    return GOVERNMENT_SITE_PATTERNS.some(pattern => pattern.test(url.toLowerCase()));
  }

  /**
   * Normalizes URLs by adding protocol if missing and validating format
   */
  private normalizeUrl(url: string): string {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      throw new Error('Invalid URL: URL must be a non-empty string');
    }

    let normalizedUrl = url.trim();
    
    // Add protocol if missing
    if (!normalizedUrl.match(/^https?:\/\//)) {
      normalizedUrl = `https://${normalizedUrl}`;
      console.log(`🔧 URL normalized (added protocol): ${url} → ${normalizedUrl}`);
    }
    
    try {
      new URL(normalizedUrl); // Validate URL format
      return normalizedUrl;
    } catch (error) {
      // If https fails, try http as fallback for legacy sites
      if (normalizedUrl.startsWith('https://')) {
        const httpUrl = normalizedUrl.replace('https://', 'http://');
        try {
          new URL(httpUrl);
          console.log(`🔧 URL normalized (HTTP fallback): ${url} → ${httpUrl}`);
          return httpUrl;
        } catch (httpError) {
          throw new Error(`Invalid URL format: cannot normalize "${url}"`);
        }
      }
      throw new Error(`Invalid URL format: ${normalizedUrl}`);
    }
  }

  private getRotatingUserAgent(): string {
    const index = this.requestCount % USER_AGENTS.length;
    this.requestCount++;
    return USER_AGENTS[index];
  }

  private async addIntelligentDelay(): Promise<void> {
    // Add delays for government sites and after multiple requests
    const baseDelay = this.isGovernmentSite ? 2000 : 1000; // 2s for gov sites, 1s for others
    const extraDelay = Math.floor(this.requestCount / 3) * 500; // Additional delay every 3rd request
    const randomJitter = Math.random() * 1000; // 0-1s random jitter
    
    const totalDelay = baseDelay + extraDelay + randomJitter;
    
    if (totalDelay > 1000) {
      console.log(`⏳ Intelligent delay: ${Math.round(totalDelay)}ms (gov: ${this.isGovernmentSite}, requests: ${this.requestCount})`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  private getEnhancedHeaders(): Record<string, string> {
    const userAgent = this.getRotatingUserAgent();
    
    // Enhanced headers that look more browser-like
    const headers: Record<string, string> = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    };

    // Add government-site specific headers
    if (this.isGovernmentSite) {
      headers['DNT'] = '1'; // Do Not Track for privacy compliance
      headers['Sec-GPC'] = '1'; // Global Privacy Control
      delete headers['Sec-Fetch-Site']; // Remove some tracking headers for gov sites
    }

    // Randomly add optional headers to vary fingerprint
    if (Math.random() > 0.5) {
      headers['Referer'] = 'https://www.google.com/';
    }

    return headers;
  }

  async fetchWithRetry(url: string, maxRetries: number = 5): Promise<string> {
    let lastError: Error | null = null;
    
    // Normalize URL before any fetch attempts
    const normalizedUrl = this.normalizeUrl(url);
    
    // Enhanced retry count for government sites
    const enhancedMaxRetries = this.isGovernmentSite ? Math.max(maxRetries, 5) : maxRetries;
    const isGovernmentSite = this.isGovernmentSite;
    
    for (let attempt = 1; attempt <= enhancedMaxRetries; attempt++) {
      try {
        // Add intelligent delays between requests
        if (attempt > 1) {
          await this.addIntelligentDelay();
        }
        
        console.log(`🌐 Fetching ${normalizedUrl} (attempt ${attempt}/${enhancedMaxRetries})${isGovernmentSite ? ' [GOV SITE]' : ''}`);
        
        // ENHANCED: SSL certificate error handling - try HTTP fallback
        let currentUrl = normalizedUrl;
        if (attempt > 2 && lastError?.message.includes('certificate')) {
          console.log('🔐 SSL certificate issue detected, trying HTTP fallback...');
          currentUrl = normalizedUrl.replace('https://', 'http://');
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const fetchOptions: RequestInit = {
          signal: controller.signal,
          headers: this.getEnhancedHeaders(),
        };

        // Enhanced retry logic for different error types
        if (attempt > 1 && lastError?.message.includes('http2')) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Connection': 'close'
          };
        }
        
        // For 403 errors, try different approaches
        if (attempt > 2 && lastError?.message.includes('403')) {
          console.log('🔄 Trying enhanced anti-detection for 403 error...');
          
          // Remove potentially problematic headers
          delete (fetchOptions.headers as any)['Sec-Fetch-Dest'];
          delete (fetchOptions.headers as any)['Sec-Fetch-Mode'];
          delete (fetchOptions.headers as any)['Sec-Fetch-Site'];
          delete (fetchOptions.headers as any)['Sec-Fetch-User'];
          
          // Add more human-like headers
          (fetchOptions.headers as any)['Referer'] = 'https://www.google.com/';
          (fetchOptions.headers as any)['X-Forwarded-For'] = this.generateRandomIP();
        }
        
        const response = await fetch(currentUrl, fetchOptions);

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Enhanced error messages for better debugging
          const errorType = response.status === 404 ? 'NOT_FOUND' : 
                           response.status === 403 ? 'FORBIDDEN' : 
                           response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
          throw new Error(`${errorType}: HTTP ${response.status} (${response.statusText}) for ${currentUrl}`);
        }

        const html = await response.text();
        
        // Validate that we got actual content, not an error page - CHECK FOR ERROR PAGES ONLY
        if (html.includes('404') || html.includes('not found') || html.includes('page not found') || html.length < 50) {
          throw new Error('INVALID_CONTENT: Received error page or minimal content');
        }
        
        console.log(`✅ Successfully fetched ${html.length} characters from ${this.domain}`);
        return html;
        
      } catch (error) {
        lastError = error as Error;
        console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < enhancedMaxRetries) {
          // ENHANCED: Intelligent delay based on site type and request count
          const baseDelay = isGovernmentSite ? 3000 : 1000; // Longer delays for gov sites
          const backoffDelay = Math.pow(2, attempt - 1) * baseDelay;
          const jitter = Math.random() * 1000; // Add randomness
          const totalDelay = Math.min(backoffDelay + jitter, 35000); // Cap at 35 seconds
          
          console.log(`⏳ Retrying in ${Math.round(totalDelay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
      }
    }
    
    throw lastError || new Error('Failed to fetch after all retries');
  }

  private generateRandomIP(): string {
    // Generate a plausible IP address
    const octets = Array.from({ length: 4 }, () => Math.floor(Math.random() * 255));
    return octets.join('.');
  }

  // Phase 1: New JSON-LD extraction method
  private extractJSONLDData(doc: Document, property: string): string {
    try {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const jsonData = JSON.parse(script.textContent || '');
          
          // Handle arrays of structured data
          const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
          
          for (const data of dataArray) {
            if (data['@type'] === 'NewsArticle' || data['@type'] === 'Article') {
              let value = data[property];
              
              // Handle author object
              if (property === 'author' && typeof value === 'object') {
                value = value.name || value['@name'] || '';
              }
              
              if (value && typeof value === 'string') {
                console.log(`📋 JSON-LD extracted ${property}: ${value.substring(0, 50)}...`);
                return value;
              }
            }
          }
        } catch (parseError) {
          // Continue to next script if JSON parsing fails
          continue;
        }
      }
    } catch (error) {
      console.log(`⚠️ JSON-LD extraction failed for ${property}: ${error.message}`);
    }
    return '';
  }

  // Enhanced method to try government RSS feed patterns
  async tryGovernmentRSSFeeds(baseUrl: string): Promise<string[]> {
    if (!this.isGovernmentSite) {
      return [];
    }

    console.log('🏛️ Trying government RSS feed patterns...');
    const validFeeds: string[] = [];

    for (const pattern of GOVERNMENT_RSS_PATTERNS) {
      try {
        const feedUrl = new URL(pattern, baseUrl).href;
        console.log(`🔗 Checking government RSS: ${feedUrl}`);
        
        await this.addIntelligentDelay(); // Rate limit RSS discovery
        const feedContent = await this.fetchWithRetry(feedUrl, 2); // Fewer retries for discovery
        
        // Basic validation that it's an RSS/XML feed
        if (feedContent.includes('<rss') || feedContent.includes('<feed') || feedContent.includes('<atom')) {
          console.log(`✅ Found valid government RSS feed: ${feedUrl}`);
          validFeeds.push(feedUrl);
        }
      } catch (error) {
        // Silently continue - expected for many URLs
        console.log(`⚠️ Government RSS pattern ${pattern} failed: ${error.message}`);
      }
    }

    return validFeeds;
  }

  extractContentFromHTML(html: string, url: string): ContentExtractionResult {
    console.log(`🔍 Starting enhanced content extraction for ${this.domain}`);
    
    // Clean HTML from noise before processing
    const cleanHtml = this.cleanHTML(html);
    
    // Create DOM parser for JSON-LD extraction
    const doc = new DOMParser().parseFromString(cleanHtml, 'text/html');
    
    // Phase 1: Try JSON-LD structured data first
    let title = this.extractJSONLDData(doc, 'headline') || this.extractJSONLDData(doc, 'name');
    let author = this.extractJSONLDData(doc, 'author');  
    let published_at = this.extractJSONLDData(doc, 'datePublished');
    
    // Phase 1: Fallback to existing extraction methods if JSON-LD fails
    if (!title) title = this.extractTitle(cleanHtml);
    if (!author) author = this.extractAuthor(cleanHtml);
    if (!published_at) published_at = this.extractPublishedDate(cleanHtml);
    
    // Extract main content using enhanced strategies
    const content = this.extractMainContent(cleanHtml);
    
    // Calculate metrics
    const wordCount = this.countWords(content);
    const contentQualityScore = this.calculateContentQuality(content, title);

    console.log(`📊 Extracted: ${wordCount} words, quality: ${contentQualityScore}% from ${url}`);

    return {
      title: title || 'Untitled',
      body: content,
      author,
      published_at: published_at || new Date().toISOString(),
      word_count: wordCount,
      content_quality_score: contentQualityScore
    };
  }

  private cleanHTML(html: string): string {
    // Remove script, style and other noise elements
    let cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Remove known noise elements using site-specific exclusions
    for (const excludeSelector of this.siteConfig.excludeSelectors) {
      // Convert CSS selector to regex for removal
      const pattern = new RegExp(`<[^>]*class[^>]*${excludeSelector.replace('.', '')}[^>]*>[\\s\\S]*?<\/[^>]+>`, 'gi');
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned;
  }

  private extractTitle(html: string): string {
    const selectors = this.siteConfig.titleSelectors || ['h1', '.entry-title', '.post-title'];
    
    for (const selector of selectors) {
      const pattern = new RegExp(`<${selector}[^>]*>([^<]+)`, 'i');
      const match = pattern.exec(html);
      if (match && match[1].trim()) {
        return this.cleanText(match[1]);
      }
    }
    
    // Fallback to page title
    const titleMatch = /<title[^>]*>([^<]+)/i.exec(html);
    if (titleMatch) {
      return this.cleanText(titleMatch[1]).replace(/\s*[-|–]\s*.*$/, '');
    }
    
    return '';
  }

  private extractAuthor(html: string): string {
    const selectors = this.siteConfig.authorSelectors || ['.author', '.byline', '[rel="author"]'];
    
    for (const selector of selectors) {
      const pattern = new RegExp(`<[^>]*class[^>]*${selector.replace('.', '')}[^>]*>([^<]+)`, 'i');
      const match = pattern.exec(html);
      if (match && match[1].trim()) {
        return this.cleanText(match[1]);
      }
    }
    
    return '';
  }

  private extractPublishedDate(html: string): string {
    // Try datetime attribute first
    const datetimeMatch = /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i.exec(html);
    if (datetimeMatch) {
      return datetimeMatch[1];
    }
    
    // Try common date selectors
    const dateSelectors = ['.date', '.published', '.post-date', '.timestamp'];
    for (const selector of dateSelectors) {
      const pattern = new RegExp(`<[^>]*class[^>]*${selector.replace('.', '')}[^>]*>([^<]+)`, 'i');
      const match = pattern.exec(html);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    }
    
    return '';
  }

  private extractMainContent(html: string): string {
    console.log(`🔄 Extracting main content using ${this.siteConfig.contentSelectors.length} strategies`);
    
    let bestContent = '';
    let bestScore = 0;

    // Try each content selector strategy
    for (const selector of this.siteConfig.contentSelectors) {
      try {
        const content = this.extractBySelector(html, selector);
        const score = this.scoreContent(content);
        
        console.log(`📝 Strategy "${selector}": ${this.countWords(content)} words, score: ${score}`);
        
        if (score > bestScore) {
          bestContent = content;
          bestScore = score;
        }
      } catch (error) {
        console.log(`⚠️ Strategy "${selector}" failed: ${error.message}`);
      }
    }

    // If no good content found, try paragraph extraction
    if (bestScore < 50) {
      console.log('🔄 Falling back to paragraph extraction');
      const paragraphContent = this.extractParagraphs(html);
      const paragraphScore = this.scoreContent(paragraphContent);
      
      if (paragraphScore > bestScore) {
        bestContent = paragraphContent;
        bestScore = paragraphScore;
      }
    }

    return this.cleanText(bestContent);
  }

  private extractBySelector(html: string, selector: string): string {
    if (selector === 'article') {
      const match = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
      return match ? this.extractTextFromHTML(match[1]) : '';
    }
    
    if (selector.includes('.')) {
      const className = selector.replace('.', '');
      const pattern = new RegExp(`<[^>]*class[^>]*${className}[^>]*>([\s\S]*?)<\/[^>]+>`, 'i');
      const match = pattern.exec(html);
      return match ? this.extractTextFromHTML(match[1]) : '';
    }
    
    const pattern = new RegExp(`<${selector}[^>]*>([\s\S]*?)<\/${selector}>`, 'i');
    const match = pattern.exec(html);
    return match ? this.extractTextFromHTML(match[1]) : '';
  }

  private extractParagraphs(html: string): string {
    const paragraphs: string[] = [];
    
    // Enhanced paragraph extraction for split content
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    
    // Also collect text from divs that might contain article content split by ads/images
    const divMatches = html.match(/<div[^>]*class[^>]*(?:content|article|text|body)[^>]*>([\s\S]*?)<\/div>/gi) || [];
    
    // Process paragraphs with lower threshold for better aggregation
    for (const pMatch of pMatches) {
      const text = this.extractTextFromHTML(pMatch);
      if (text.length > 20) { // Lowered threshold for better content aggregation
        paragraphs.push(text);
      }
    }
    
    // Process content divs to capture split content
    for (const divMatch of divMatches) {
      const text = this.extractTextFromHTML(divMatch);
      if (text.length > 30 && !this.isNavigationContent(text)) {
        paragraphs.push(text);
      }
    }
    
    return paragraphs.join('\n\n');
  }
  
  private isNavigationContent(text: string): boolean {
    const navKeywords = ['menu', 'navigation', 'subscribe', 'follow us', 'share', 'comment', 'related articles'];
    const textLower = text.toLowerCase();
    return navKeywords.some(keyword => textLower.includes(keyword)) || text.length < 15;
  }
  
  private isNavigationContent(text: string): boolean {
    const navKeywords = ['menu', 'navigation', 'subscribe', 'follow us', 'share', 'comment', 'related articles'];
    const textLower = text.toLowerCase();
    return navKeywords.some(keyword => textLower.includes(keyword)) || text.length < 15;
  }

  private extractTextFromHTML(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
      .replace(/&[^;]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanText(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
      .replace(/&[^;]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  private scoreContent(content: string): number {
    if (!content) return 0;
    
    const wordCount = this.countWords(content);
    const charCount = content.length;
    
    let score = 0;
    
    // Word count scoring
    if (wordCount > 300) score += 40;
    else if (wordCount > 150) score += 30;
    else if (wordCount > 80) score += 20;
    else if (wordCount > 40) score += 10;
    
    // Character count bonus
    if (charCount > 1500) score += 20;
    else if (charCount > 800) score += 15;
    else if (charCount > 400) score += 10;
    
    // Structure bonus
    if (content.includes('\n\n')) score += 10;
    
    // Reduced penalties - focus on word count over character count
    if (wordCount < 10) score -= 15;
    if (wordCount < 5) score -= 25;
    
    return Math.max(0, score);
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateContentQuality(content: string, title: string): number {
    if (!content || content.trim().length === 0) return 0;
    
    let score = 0;
    const wordCount = this.countWords(content);
    const charCount = content.length;
    
    console.log(`📊 Quality calculation - Words: ${wordCount}, Chars: ${charCount}`);
    
    // Word count scoring (more generous)
    if (wordCount >= 500) score += 40;
    else if (wordCount >= 300) score += 35;
    else if (wordCount >= 200) score += 30;
    else if (wordCount >= 100) score += 25;
    else if (wordCount >= 50) score += 15;
    else if (wordCount >= 20) score += 10;
    
    // Content structure
    if (content.includes('\n\n') || content.includes('\n')) score += 10;
    if (title && title.length > 10) score += 10;
    
    // Length bonus (more realistic thresholds)
    if (charCount > 2000) score += 20;
    else if (charCount > 1000) score += 15;
    else if (charCount > 500) score += 10;
    else if (charCount > 200) score += 5;
    
    // Minimal penalties to allow more content through
    if (wordCount < 10) score -= 5;
    if (wordCount < 5) score -= 15;
    
    const finalScore = Math.max(0, Math.min(100, score));
    console.log(`📊 Final quality score: ${finalScore}`);
    
    return finalScore;
  }

  // Enhanced article URL detection
  isLikelyArticleUrl(url: string): boolean {
    const urlPath = url.toLowerCase();
    
    // Check exclusion patterns first
    if (EXCLUDE_URL_PATTERNS.some(pattern => pattern.test(urlPath))) {
      return false;
    }
    
    // Check positive patterns
    return ARTICLE_URL_PATTERNS.some(pattern => pattern.test(urlPath));
  }

  // Extract article links from HTML with enhanced filtering
  extractArticleLinks(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    const linkMatches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];
    
    // Domain-specific path filtering
    const getDomainExcludePatterns = (url: string): RegExp[] => {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (hostname.includes('theargus.co.uk')) {
          return [
            /\/advertising\//i,
            /\/newsletters\//i,
            /\/subscription/i,
            /\/privacy/i,
            /\/terms/i
          ];
        }
      } catch {
        // Continue with default patterns
      }
      return [];
    };
    
    const excludePatterns = getDomainExcludePatterns(baseUrl);
    
    for (const linkMatch of linkMatches) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(linkMatch);
      if (hrefMatch) {
        const url = this.resolveUrl(hrefMatch[1], baseUrl);
        
        // Apply domain-specific filtering
        if (excludePatterns.length > 0) {
          const shouldExclude = excludePatterns.some(pattern => pattern.test(url));
          if (shouldExclude) {
            continue; // Skip this URL
          }
        }
        
        // Enhanced article URL detection
        if (this.isLikelyArticleUrl(url) && this.isInternalLink(url, baseUrl)) {
          links.push(url);
        }
      }
    }

    // Remove duplicates and sort by likely relevance
    return [...new Set(links)].slice(0, 10); // Limit to top 10 candidates
  }

  private isInternalLink(url: string, baseUrl: string): boolean {
    try {
      const urlDomain = new URL(url).hostname;
      const baseDomain = new URL(baseUrl).hostname;
      return urlDomain === baseDomain || urlDomain === `www.${baseDomain}`;
    } catch {
      return false;
    }
  }

  private resolveUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url.startsWith('http') ? url : `${baseUrl}${url}`;
    }
  }
}
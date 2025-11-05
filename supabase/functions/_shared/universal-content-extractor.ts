import { ContentExtractionResult, StructuredArticleCandidate } from './types.ts';

const MAX_JSONLD_SCRIPTS = 10;
const MAX_JSONLD_LENGTH = 100_000; // 100 KB
const MAX_STRUCTURED_ENTRIES = 1000;
const MAX_STRUCTURED_DEPTH = 10;
const MAX_STRUCTURED_CANDIDATES = 50;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 100;
const MAX_HINT_STORAGE_BYTES = 5 * 1024; // 5 KB

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
    
    // Enhanced configuration for better success rates - just keep the site config as is for government sites
    if (this.isGovernmentSite) {
      // Government sites get default config, no extra properties needed
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
        
        // Helper function for GET fallback with Range header
        const tryGetFallback = async (reason: string): Promise<string | null> => {
          console.log(`🔄 GET_RANGE_FALLBACK_START: ${reason}`);
          
          try {
            const rangeHeaders = {
              ...fetchOptions.headers as Record<string, string>,
              'Range': 'bytes=0-8192', // Get first 8KB only
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            };
            
            const rangeController = new AbortController();
            const rangeTimeoutId = setTimeout(() => rangeController.abort(), 5000);
            
            const rangeResponse = await fetch(currentUrl, {
              method: 'GET',
              signal: rangeController.signal,
              headers: rangeHeaders,
              redirect: 'follow'
            });
            
            clearTimeout(rangeTimeoutId);
            
            if (rangeResponse.ok || rangeResponse.status === 206) {
              const content = await rangeResponse.text();
              
              console.log(`🔄 GET_RANGE_FALLBACK_OK (status ${rangeResponse.status}, bytes ${content.length})`);
              
              // Validate content
              if (content.length >= 50 && 
                  !content.toLowerCase().includes('access is denied') && 
                  !content.toLowerCase().includes('captcha verification required')) {
                console.log(`✅ GET fallback succeeded for ${currentUrl} (${content.length} chars)`);
                return content;
              } else {
                console.log(`🔄 GET_RANGE_FALLBACK_FAIL (invalid content despite ${content.length} chars)`);
              }
            } else {
              console.log(`🔄 GET_RANGE_FALLBACK_FAIL (status ${rangeResponse.status})`);
            }
            
            // Consume body to close connection
            await rangeResponse.arrayBuffer().catch(() => {});
          } catch (rangeError) {
            const rangeErrorMessage = rangeError instanceof Error ? rangeError.message : String(rangeError);
            console.log(`🔄 GET_RANGE_FALLBACK_FAIL (error: ${rangeErrorMessage})`);
          }
          
          return null;
        };

        const response = await fetch(currentUrl, fetchOptions);

        clearTimeout(timeoutId);

        // Phase 1: Check for explicit blocking status codes - try GET fallback
        if ([401, 403, 405, 406, 429].includes(response.status)) {
          const fallbackContent = await tryGetFallback(`${response.status} detected`);
          if (fallbackContent) return fallbackContent;
        }

        if (!response.ok) {
          // Enhanced error messages for better debugging
          const errorType = response.status === 404 ? 'NOT_FOUND' : 
                           response.status === 403 ? 'FORBIDDEN' : 
                           response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
          throw new Error(`${errorType}: HTTP ${response.status} (${response.statusText}) for ${currentUrl}`);
        }

        const html = await response.text();
        
        // Phase 2: Check for error pages in 200 OK responses
        const isErrorPage = html.includes('404') || 
                           html.includes('not found') || 
                           html.includes('page not found') || 
                           html.length < 50;
        
        if (isErrorPage) {
          console.log(`⚠️ Got 200 OK but invalid content (${html.length} chars)`);
          const fallbackContent = await tryGetFallback('Invalid content despite 200 OK');
          if (fallbackContent) return fallbackContent;
          
          throw new Error('INVALID_CONTENT: Received error page or minimal content');
        }
        
        console.log(`✅ Successfully fetched ${html.length} characters from ${this.domain}`);
        return html;
        
      } catch (error) {
        lastError = error as Error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`❌ Attempt ${attempt} failed: ${errorMessage}`);
        
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

  private sanitizeString(value: unknown, maxLength: number = 1000): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const withoutTags = trimmed.replace(/<[^>]*>/g, '');
    const withoutControlChars = withoutTags.replace(/[\u0000-\u001F\u007F]/g, '');
    const sanitized = withoutControlChars.slice(0, maxLength);

    return sanitized || undefined;
  }

  private validateAndNormalizeDate(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const sanitized = value.trim();
    if (!sanitized) {
      return undefined;
    }

    const parsed = new Date(sanitized);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString();
  }

  private sanitizeKeywords(keywords: unknown): string[] {
    return this.ensureArray(keywords)
      .map(keyword => this.sanitizeString(keyword, MAX_KEYWORD_LENGTH))
      .filter((keyword): keyword is string => Boolean(keyword))
      .slice(0, MAX_KEYWORDS);
  }

  private isPrivateIPAddress(hostname: string): boolean {
    const normalized = hostname.replace(/[\[\]]/g, '').toLowerCase();

    if (normalized.includes(':')) {
      if (normalized === '::1') return true;
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
      if (normalized.startsWith('fe80')) return true;
      return false;
    }

    const parts = normalized.split('.').map(part => Number(part));
    if (parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
      if (parts[0] === 10) return true;
      if (parts[0] === 127) return true;
      if (parts[0] === 0) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
    }

    return false;
  }

  private isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol;

      if (protocol !== 'http:' && protocol !== 'https:') {
        return false;
      }

      const hostname = parsed.hostname.toLowerCase();
      if (!hostname) {
        return false;
      }

      if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) {
        return false;
      }

      if (hostname.endsWith('.local')) {
        return false;
      }

      if (this.isPrivateIPAddress(hostname)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public isAllowedExternalUrl(url: string): boolean {
    return this.isAllowedUrl(url);
  }

  private normalizeAndValidateUrl(value: unknown, baseUrl: string): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    try {
      const resolved = new URL(value, baseUrl).href;
      if (!this.isAllowedUrl(resolved)) {
        console.log(`⚠️ Structured data URL blocked: ${resolved}`);
        return undefined;
      }
      return resolved;
    } catch {
      return undefined;
    }
  }

  private extractCandidateUrl(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'object') {
      const candidate = (value as Record<string, unknown>).url ||
        (value as Record<string, unknown>)['@id'] ||
        (value as Record<string, unknown>)['@url'];
      return typeof candidate === 'string' ? candidate : undefined;
    }

    return undefined;
  }

  private createStructuredCandidate(
    candidate: StructuredArticleCandidate,
    baseUrl: string
  ): StructuredArticleCandidate | undefined {
    const normalizedUrl = this.normalizeAndValidateUrl(candidate.url, baseUrl);
    if (!normalizedUrl) {
      return undefined;
    }

    const headline = this.sanitizeString(candidate.headline, 500);
    const datePublished = this.validateAndNormalizeDate(candidate.datePublished);
    const image = this.normalizeAndValidateUrl(candidate.image, baseUrl);
    const keywords = this.sanitizeKeywords(candidate.keywords);

    const sanitizedCandidate: StructuredArticleCandidate = {
      url: normalizedUrl,
      ...(headline ? { headline } : {}),
      ...(datePublished ? { datePublished } : {}),
      ...(image ? { image } : {}),
      ...(keywords.length ? { keywords } : {})
    };

    const serialized = JSON.stringify(sanitizedCandidate);
    if (serialized.length > MAX_HINT_STORAGE_BYTES) {
      console.log(`⚠️ Structured data candidate exceeded size limit (${serialized.length} bytes)`);
      return {
        url: normalizedUrl
      };
    }

    return sanitizedCandidate;
  }

  static pruneStructuredHintsForStorage(
    candidate?: StructuredArticleCandidate
  ): StructuredArticleCandidate | undefined {
    if (!candidate) {
      return undefined;
    }

    const pruned: StructuredArticleCandidate = {
      url: candidate.url
    };

    if (candidate.headline) {
      pruned.headline = candidate.headline;
    }
    if (candidate.datePublished) {
      pruned.datePublished = candidate.datePublished;
    }
    if (candidate.image) {
      pruned.image = candidate.image;
    }
    if (candidate.keywords?.length) {
      pruned.keywords = candidate.keywords.slice(0, MAX_KEYWORDS);
    }

    let serialized = JSON.stringify(pruned);
    if (serialized.length > MAX_HINT_STORAGE_BYTES) {
      delete pruned.keywords;
      serialized = JSON.stringify(pruned);
    }

    if (serialized.length > MAX_HINT_STORAGE_BYTES) {
      delete pruned.headline;
      serialized = JSON.stringify(pruned);
    }

    if (serialized.length > MAX_HINT_STORAGE_BYTES) {
      delete pruned.image;
      serialized = JSON.stringify(pruned);
    }

    if (serialized.length > MAX_HINT_STORAGE_BYTES) {
      return { url: candidate.url };
    }

    return pruned;
  }

  private parseStructuredData(html: string): any[] {
    const entries: any[] = [];
    const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    let processedScripts = 0;

    while ((match = scriptRegex.exec(html)) !== null && processedScripts < MAX_JSONLD_SCRIPTS) {
      processedScripts++;

      const rawContent = (match[1] || '').trim();
      if (!rawContent) {
        continue;
      }

      if (rawContent.length > MAX_JSONLD_LENGTH) {
        console.log('⚠️ Skipping oversized JSON-LD script');
        continue;
      }

      try {
        const sanitized = rawContent
          .replace(/<!--([\s\S]*?)-->/g, '$1')
          .replace(/<\\\//g, '</');

        const parsed = JSON.parse(sanitized);
        this.collectStructuredEntries(parsed, entries);

        if (entries.length >= MAX_STRUCTURED_ENTRIES) {
          console.log('⚠️ Structured data entry limit reached');
          break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ Failed to parse JSON-LD script: ${errorMessage}`);
      }
    }

    return entries;
  }

  private collectStructuredEntries(node: any, entries: any[], depth: number = 0): void {
    if (!node || depth > MAX_STRUCTURED_DEPTH || entries.length >= MAX_STRUCTURED_ENTRIES) {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        if (entries.length >= MAX_STRUCTURED_ENTRIES) {
          return;
        }
        this.collectStructuredEntries(item, entries, depth + 1);
      }
      return;
    }

    if (typeof node !== 'object') {
      return;
    }

    entries.push(node);

    if (node['@graph']) {
      this.collectStructuredEntries(node['@graph'], entries, depth + 1);
    }
  }

  private isArticleStructuredEntry(entry: any): boolean {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const type = entry['@type'];
    const typeArray = Array.isArray(type) ? type : type ? [type] : [];
    const allowedTypes = ['NewsArticle', 'Article', 'BlogPosting', 'Report', 'PressRelease'];

    return typeArray.some((value: string) => allowedTypes.includes(value));
  }

  private ensureArray<T>(value: T | T[] | undefined): T[] {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  private extractStructuredImage(entry: any, baseUrl: string): string | undefined {
    const image = entry?.image;
    if (!image) {
      return undefined;
    }

    if (typeof image === 'string') {
      return this.normalizeAndValidateUrl(image, baseUrl);
    }

    if (Array.isArray(image)) {
      const first = image.find(item => typeof item === 'string' || (item && typeof item.url === 'string'));
      if (!first) {
        return undefined;
      }
      return typeof first === 'string'
        ? this.normalizeAndValidateUrl(first, baseUrl)
        : this.normalizeAndValidateUrl(first.url, baseUrl);
    }

    if (typeof image === 'object' && typeof image.url === 'string') {
      return this.normalizeAndValidateUrl(image.url, baseUrl);
    }

    return undefined;
  }

  private extractJSONLDData(entries: any[], property: string): string {
    try {
      for (const entry of entries) {
        if (!this.isArticleStructuredEntry(entry)) {
          continue;
        }

        let value = entry[property];

        if (property === 'author' && value) {
          const authors = this.ensureArray(value)
            .map(author => {
              if (typeof author === 'string') {
                return author;
              }
              if (author && typeof author === 'object') {
                return author.name || author['@name'] || author['@id'] || '';
              }
              return '';
            })
            .filter(Boolean);

          if (authors.length > 0) {
            value = authors.join(', ');
          }
        }

        if (Array.isArray(value)) {
          value = value.find(item => typeof item === 'string') || value[0];
        }

        if (value && typeof value === 'string') {
          if (property === 'datePublished') {
            const normalizedDate = this.validateAndNormalizeDate(value);
            if (normalizedDate) {
              console.log(`📋 JSON-LD extracted ${property}: ${normalizedDate}`);
              return normalizedDate;
            }
          } else {
            const sanitizedValue = this.sanitizeString(value, 500);
            if (sanitizedValue) {
              console.log(`📋 JSON-LD extracted ${property}: ${sanitizedValue.substring(0, 80)}...`);
              return sanitizedValue;
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ JSON-LD extraction failed for ${property}: ${errorMessage}`);
    }

    return '';
  }

  extractStructuredArticleCandidates(html: string, baseUrl: string): StructuredArticleCandidate[] {
    const entries = this.parseStructuredData(html);
    const candidates = new Map<string, StructuredArticleCandidate>();

    const addCandidate = (candidate: StructuredArticleCandidate) => {
      if (candidates.size >= MAX_STRUCTURED_CANDIDATES) {
        return;
      }

      const sanitized = this.createStructuredCandidate(candidate, baseUrl);
      if (!sanitized) {
        return;
      }

      candidates.set(sanitized.url, sanitized);
    };

    for (const entry of entries) {
      if (this.isArticleStructuredEntry(entry)) {
        const possibleUrlSources = [
          entry.url,
          entry['@id'],
          entry.mainEntityOfPage?.['@id'],
          entry.mainEntityOfPage?.url,
          entry.mainEntityOfPage,
        ];

        for (const possibleUrl of possibleUrlSources) {
          const extractedUrl = this.extractCandidateUrl(possibleUrl);
          if (!extractedUrl) {
            continue;
          }

          addCandidate({
            url: extractedUrl,
            headline: entry.headline || entry.name,
            datePublished: entry.datePublished || entry.dateCreated || entry.dateModified,
            image: this.extractStructuredImage(entry, baseUrl),
            keywords: entry.keywords,
          });

          break;
        }
      }

      if (entry['@type'] === 'ItemList' && Array.isArray(entry.itemListElement)) {
        for (const element of entry.itemListElement) {
          const item = element?.item || element;
          if (!item) {
            continue;
          }

          const candidateUrl = this.extractCandidateUrl(item);
          if (candidateUrl) {
            addCandidate({
              url: candidateUrl,
              headline: item.name || item.headline,
              datePublished: item.datePublished,
              image: this.extractStructuredImage(item, baseUrl),
              keywords: item.keywords,
            });
          }

          if (candidates.size >= MAX_STRUCTURED_CANDIDATES) {
            break;
          }
        }
      }

      if (candidates.size >= MAX_STRUCTURED_CANDIDATES) {
        break;
      }
    }

    return Array.from(candidates.values());
  }

  /**
   * Extract metadata from OpenGraph and meta tags as last-resort fallback
   * Uses already-fetched HTML (no external calls)
   */
  extractPageMetadata(html: string, url: string): { title?: string; description?: string; image?: string; author?: string } {
    const metadata: { title?: string; description?: string; image?: string; author?: string } = {};
    
    try {
      // Extract Open Graph title
      const ogTitleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i);
      if (ogTitleMatch) {
        metadata.title = this.sanitizeString(ogTitleMatch[1], 500);
      }
      
      // Fallback to regular meta title or <title> tag
      if (!metadata.title) {
        const metaTitleMatch = html.match(/<meta\s+name=["']title["']\s+content=["']([^"']+)["']/i);
        if (metaTitleMatch) {
          metadata.title = this.sanitizeString(metaTitleMatch[1], 500);
        }
      }
      
      if (!metadata.title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          metadata.title = this.sanitizeString(titleMatch[1], 500);
        }
      }
      
      // Extract Open Graph description
      const ogDescMatch = html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i);
      if (ogDescMatch) {
        metadata.description = this.sanitizeString(ogDescMatch[1], 1000);
      }
      
      // Fallback to meta description
      if (!metadata.description) {
        const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
        if (metaDescMatch) {
          metadata.description = this.sanitizeString(metaDescMatch[1], 1000);
        }
      }
      
      // Extract Open Graph image
      const ogImageMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogImageMatch) {
        const imageUrl = this.normalizeAndValidateUrl(ogImageMatch[1], url);
        if (imageUrl) {
          metadata.image = imageUrl;
        }
      }
      
      // Extract author
      const authorMatch = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i);
      if (authorMatch) {
        metadata.author = this.sanitizeString(authorMatch[1], 200);
      }
      
      console.log(`📄 Extracted metadata: title=${!!metadata.title}, description=${!!metadata.description}, image=${!!metadata.image}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Metadata extraction error: ${errorMessage}`);
    }
    
    return metadata;
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ Government RSS pattern ${pattern} failed: ${errorMessage}`);
      }
    }

    return validFeeds;
  }

  extractContentFromHTML(html: string, url: string): ContentExtractionResult {
    console.log(`🔍 Starting enhanced content extraction for ${this.domain}`);
    
    // Clean HTML from noise before processing
    const cleanHtml = this.cleanHTML(html);
    
    const structuredEntries = this.parseStructuredData(cleanHtml);

    // Phase 1: Try JSON-LD structured data first
    let title = this.extractJSONLDData(structuredEntries, 'headline') ||
      this.extractJSONLDData(structuredEntries, 'name');
    let author = this.extractJSONLDData(structuredEntries, 'author');
    let published_at = this.extractJSONLDData(structuredEntries, 'datePublished');
    
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ Strategy "${selector}" failed: ${errorMessage}`);
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
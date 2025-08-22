import { ContentExtractionResult } from './types.ts';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Site-specific configurations for known problematic sites
const SITE_CONFIGS: Record<string, {
  contentSelectors: string[];
  titleSelectors?: string[];
  authorSelectors?: string[];
  excludeSelectors: string[];
  articleLinkPatterns?: RegExp[];
}> = {
  'bournefree.co.uk': {
    contentSelectors: [
      '.entry-content',
      '.post-content', 
      'article .content',
      '.article-body'
    ],
    titleSelectors: ['.entry-title', 'h1.post-title', 'article h1'],
    authorSelectors: ['.author-name', '.byline', '.post-author'],
    excludeSelectors: [
      '.sidebar',
      '.widget',
      '.related-posts',
      '.comments',
      '.social-share',
      '.advertisement',
      'nav',
      'footer',
      'header'
    ]
  },
  'eastbournereporter.co.uk': {
    contentSelectors: [
      '.entry-content',
      '.post-body',
      'article .content'
    ],
    excludeSelectors: [
      '.sidebar',
      '.widget-area',
      '.related-articles',
      '.comments-area'
    ]
  },
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

  constructor(url: string) {
    this.domain = this.extractDomain(url);
    this.siteConfig = SITE_CONFIGS[this.domain] || SITE_CONFIGS['default'];
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  async fetchWithRetry(url: string, maxRetries: number = 3): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🌐 Fetching ${url} (attempt ${attempt}/${maxRetries})`);
        
        const fetchOptions: RequestInit = {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          signal: AbortSignal.timeout(20000) // 20 second timeout
        };

        // Retry with different connection approach if HTTP/2 issues
        if (attempt > 1 && lastError?.message.includes('http2')) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Connection': 'close'
          };
        }
        
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        console.log(`✅ Successfully fetched ${html.length} characters from ${this.domain}`);
        return html;
        
      } catch (error) {
        lastError = error as Error;
        console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Failed to fetch after all retries');
  }

  extractContentFromHTML(html: string, url: string): ContentExtractionResult {
    console.log(`🔍 Starting enhanced content extraction for ${this.domain}`);
    
    // Clean HTML from noise before processing
    const cleanHtml = this.cleanHTML(html);
    
    // Extract title using site-specific or fallback selectors
    const title = this.extractTitle(cleanHtml);
    
    // Extract author
    const author = this.extractAuthor(cleanHtml);
    
    // Extract publication date
    const published_at = this.extractPublishedDate(cleanHtml);
    
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
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    
    for (const pMatch of pMatches) {
      const text = this.extractTextFromHTML(pMatch);
      if (text.length > 50) { // Only substantial paragraphs
        paragraphs.push(text);
      }
    }
    
    return paragraphs.join('\n\n');
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
    
    // Penalty for very short content
    if (wordCount < 20) score -= 30;
    if (charCount < 100) score -= 20;
    
    return Math.max(0, score);
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateContentQuality(content: string, title: string): number {
    let score = 0;
    
    const wordCount = this.countWords(content);
    
    // Word count scoring
    if (wordCount > 500) score += 40;
    else if (wordCount > 300) score += 30;
    else if (wordCount > 150) score += 20;
    else if (wordCount > 50) score += 10;
    
    // Content structure
    if (content.includes('\n\n')) score += 10;
    if (title && title.length > 10) score += 10;
    
    // Length bonus
    if (content.length > 1000) score += 20;
    else if (content.length > 500) score += 15;
    else if (content.length > 200) score += 10;
    
    // Penalties
    if (wordCount < 50) score -= 20;
    if (content.length < 200) score -= 15;
    
    return Math.max(0, Math.min(100, score));
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
    
    for (const linkMatch of linkMatches) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(linkMatch);
      if (hrefMatch) {
        const url = this.resolveUrl(hrefMatch[1], baseUrl);
        
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
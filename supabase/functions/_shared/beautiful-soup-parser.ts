import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';
import { ContentExtractionResult, ArticleData } from './types.ts';

// Beautiful Soup-inspired HTML parser using Cheerio
export class BeautifulSoupParser {
  private $: cheerio.CheerioAPI;
  private baseUrl: string;

  constructor(html: string, baseUrl: string) {
    // Load HTML with Cheerio (Beautiful Soup equivalent)
    this.$ = cheerio.load(html, {
      decodeEntities: true,
      lowerCaseAttributeNames: false,
      recognizeSelfClosing: true,
      withStartIndices: false,
      withEndIndices: false,
    });
    this.baseUrl = baseUrl;
  }

  // Beautiful Soup-like find methods
  find(selector: string): cheerio.Cheerio<cheerio.Element> {
    return this.$(selector);
  }

  findAll(selector: string): cheerio.Cheerio<cheerio.Element> {
    return this.$(selector);
  }

  // Extract main article content (like Beautiful Soup's get_text())
  extractMainContent(): ContentExtractionResult {
    console.log('🔍 BeautifulSoup-style content extraction starting...');

    // Try multiple content extraction strategies (Beautiful Soup approach)
    const strategies = [
      () => this.extractBySemanticTags(),
      () => this.extractByCommonSelectors(),
      () => this.extractByTextDensity(),
      () => this.extractByStructuralAnalysis(),
      () => this.extractFallback()
    ];

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result.body && result.body.length > 100) {
          console.log(`✅ Extraction successful with strategy: ${strategy.name}`);
          return result;
        }
      } catch (error) {
        console.log(`❌ Strategy failed: ${strategy.name} - ${error.message}`);
      }
    }

    return {
      title: this.extractTitle(),
      body: '',
      author: this.extractAuthor(),
      published_at: this.extractPublishDate(),
      word_count: 0,
      content_quality_score: 0
    };
  }

  // Strategy 1: Semantic HTML tags (Beautiful Soup's semantic approach)
  private extractBySemanticTags(): ContentExtractionResult {
    console.log('🎯 Trying semantic tags strategy...');
    
    const article = this.find('article');
    if (article.length > 0) {
      const content = this.cleanText(article.text());
      if (content.length > 100) {
        return this.buildResult(content, 'semantic_article');
      }
    }

    const main = this.find('main');
    if (main.length > 0) {
      const content = this.cleanText(main.text());
      if (content.length > 100) {
        return this.buildResult(content, 'semantic_main');
      }
    }

    throw new Error('No semantic content found');
  }

  // Strategy 2: Common content selectors
  private extractByCommonSelectors(): ContentExtractionResult {
    console.log('📋 Trying common selectors strategy...');

    const selectors = [
      '.article-content, .entry-content, .post-content',
      '.content, #content, .main-content',
      '.article-body, .post-body, .entry-body',
      '.text, .article-text, .story-text',
      '.description, .summary, .excerpt'
    ];

    for (const selector of selectors) {
      const elements = this.find(selector);
      if (elements.length > 0) {
        const content = this.cleanText(elements.first().text());
        if (content.length > 100) {
          return this.buildResult(content, 'common_selectors');
        }
      }
    }

    throw new Error('No content found with common selectors');
  }

  // Strategy 3: Text density analysis (Beautiful Soup-like intelligent parsing)
  private extractByTextDensity(): ContentExtractionResult {
    console.log('📊 Trying text density analysis...');

    const paragraphs = this.find('p');
    let bestContent = '';
    let maxDensity = 0;

    paragraphs.each((_, element) => {
      const text = this.cleanText(this.$(element).text());
      const density = text.length / (this.$(element).find('a').length + 1);
      
      if (density > maxDensity && text.length > 50) {
        maxDensity = density;
        bestContent = text;
      }
    });

    if (bestContent.length > 100) {
      return this.buildResult(bestContent, 'text_density');
    }

    throw new Error('No high-density content found');
  }

  // Strategy 4: Structural analysis
  private extractByStructuralAnalysis(): ContentExtractionResult {
    console.log('🏗️ Trying structural analysis...');

    // Find the largest text block
    const textBlocks: string[] = [];
    
    this.find('div, section, article').each((_, element) => {
      const $el = this.$(element);
      const text = this.cleanText($el.text());
      
      // Skip if too many links (likely navigation)
      const linkCount = $el.find('a').length;
      const textLength = text.length;
      
      if (textLength > 200 && (linkCount / textLength) < 0.02) {
        textBlocks.push(text);
      }
    });

    if (textBlocks.length > 0) {
      const bestBlock = textBlocks.sort((a, b) => b.length - a.length)[0];
      return this.buildResult(bestBlock, 'structural_analysis');
    }

    throw new Error('No content found through structural analysis');
  }

  // Strategy 5: Fallback extraction
  private extractFallback(): ContentExtractionResult {
    console.log('🆘 Using fallback extraction...');

    // Get all text, remove navigation and footer
    this.find('nav, header, footer, .nav, .menu, .sidebar').remove();
    
    const bodyText = this.cleanText(this.find('body').text());
    
    if (bodyText.length > 100) {
      return this.buildResult(bodyText, 'fallback');
    }

    throw new Error('Fallback extraction failed');
  }

  // Beautiful Soup-like article link detection
  findArticleLinks(): string[] {
    console.log('🔗 Finding article links with Beautiful Soup approach...');

    const links: string[] = [];
    const seenUrls = new Set<string>();

    // Article-specific link patterns (Beautiful Soup approach)
    const articlePatterns = [
      'a[href*="/article/"]',
      'a[href*="/news/"]',
      'a[href*="/story/"]',
      'a[href*="/post/"]',
      'a[href*="/blog/"]',
      '.article-link a',
      '.news-item a',
      '.post-title a',
      'h1 a, h2 a, h3 a',
    ];

    for (const pattern of articlePatterns) {
      this.find(pattern).each((_, element) => {
        const href = this.$(element).attr('href');
        if (href) {
          const fullUrl = this.resolveUrl(href);
          if (this.isValidArticleUrl(fullUrl) && !seenUrls.has(fullUrl)) {
            links.push(fullUrl);
            seenUrls.add(fullUrl);
          }
        }
      });
    }

    console.log(`🎯 Found ${links.length} potential article links`);
    return links.slice(0, 50); // Limit to prevent overwhelming
  }

  // Beautiful Soup-like RSS feed discovery
  findRSSFeeds(): string[] {
    console.log('📡 Discovering RSS feeds...');

    const feeds: string[] = [];
    
    // Look for RSS feed links in head
    this.find('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, element) => {
      const href = this.$(element).attr('href');
      if (href) {
        feeds.push(this.resolveUrl(href));
      }
    });

    // Look for RSS links in page
    this.find('a[href*="rss"], a[href*="feed"], a[href*="atom"]').each((_, element) => {
      const href = this.$(element).attr('href');
      if (href && (href.includes('rss') || href.includes('feed') || href.includes('atom'))) {
        feeds.push(this.resolveUrl(href));
      }
    });

    console.log(`📡 Found ${feeds.length} RSS feeds`);
    return feeds;
  }

  // Helper methods (Beautiful Soup-inspired)
  private extractTitle(): string {
    // Try multiple title extraction methods
    const titleSelectors = [
      'h1.article-title, h1.entry-title, h1.post-title',
      'h1',
      '.title, .headline, .article-headline',
      'title'
    ];

    for (const selector of titleSelectors) {
      const element = this.find(selector).first();
      if (element.length > 0) {
        const title = this.cleanText(element.text());
        if (title.length > 5 && title.length < 200) {
          return title;
        }
      }
    }

    return 'Untitled Article';
  }

  private extractAuthor(): string {
    const authorSelectors = [
      '.author, .byline, .by-author',
      '[rel="author"]',
      '.article-author, .post-author',
      '[class*="author"], [class*="byline"]'
    ];

    for (const selector of authorSelectors) {
      const element = this.find(selector).first();
      if (element.length > 0) {
        const author = this.cleanText(element.text());
        if (author.length > 2 && author.length < 100) {
          return author;
        }
      }
    }

    return '';
  }

  private extractPublishDate(): string {
    const dateSelectors = [
      'time[datetime]',
      '.date, .published, .post-date',
      '[class*="date"], [class*="time"]'
    ];

    for (const selector of dateSelectors) {
      const element = this.find(selector).first();
      if (element.length > 0) {
        const datetime = element.attr('datetime') || element.text();
        if (datetime) {
          try {
            return new Date(this.cleanText(datetime)).toISOString();
          } catch {
            // Continue to next selector
          }
        }
      }
    }

    return new Date().toISOString();
  }

  // Beautiful Soup-like text cleaning
  private cleanText(text: string): string {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[\r\n\t]/g, ' ')  // Remove line breaks and tabs
      .trim()
      .substring(0, 50000);  // Reasonable limit
  }

  private buildResult(content: string, method: string): ContentExtractionResult {
    const wordCount = content.split(/\s+/).length;
    
    return {
      title: this.extractTitle(),
      body: content,
      author: this.extractAuthor(),
      published_at: this.extractPublishDate(),
      word_count: wordCount,
      content_quality_score: this.calculateQualityScore(content, wordCount),
      extraction_method: method
    };
  }

  private calculateQualityScore(content: string, wordCount: number): number {
    let score = 50; // Base score
    
    if (wordCount > 100) score += 20;
    if (wordCount > 300) score += 15;
    if (content.includes('.') && content.includes(',')) score += 10; // Proper punctuation
    if (content.length > 500) score += 5;
    
    return Math.min(100, score);
  }

  private resolveUrl(url: string): string {
    try {
      return new URL(url, this.baseUrl).href;
    } catch {
      return url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    }
  }

  private isValidArticleUrl(url: string): boolean {
    // Filter out obvious non-article URLs
    const invalidPatterns = [
      /\.(jpg|jpeg|png|gif|pdf|doc|zip)$/i,
      /mailto:|tel:|javascript:/i,
      /#/,
      /\/tag\/|\/category\/|\/search/i
    ];

    return !invalidPatterns.some(pattern => pattern.test(url)) && 
           url.startsWith('http') && 
           url.length < 500;
  }
}
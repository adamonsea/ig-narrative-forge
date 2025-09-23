import { ScrapingResult, ArticleData } from './types.ts';
import { fetchWithRetry, extractContentFromHTML } from './content-processor.ts';
import { calculateRegionalRelevance } from './region-config.ts';

export class ScrapingStrategies {
  constructor(private region: string, private sourceInfo: any) {}

  async tryRSSParsing(feedUrl: string): Promise<ScrapingResult> {
    console.log('🔄 Attempting RSS/Atom parsing...');
    
    try {
      const rssContent = await fetchWithRetry(feedUrl);
      return await this.parseRSSContent(rssContent, feedUrl);
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

  async tryHTMLParsing(url: string): Promise<ScrapingResult> {
    console.log('🔄 Attempting HTML parsing...');
    
    try {
      const html = await fetchWithRetry(url);
      return await this.parseHTMLContent(html, url);
    } catch (error) {
      console.log(`❌ HTML parsing failed: ${error.message}`);
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

  async tryFallbackMethod(url: string): Promise<ScrapingResult> {
    console.log('🔄 Attempting fallback method...');
    
    try {
      const html = await fetchWithRetry(url);
      
      // Try to find RSS/Atom links in the HTML
      const feedLinks = this.extractFeedLinks(html, url);
      
      for (const feedLink of feedLinks) {
        console.log(`🔗 Found feed link: ${feedLink}`);
        const result = await this.tryRSSParsing(feedLink);
        if (result.success) {
          return result;
        }
      }

      // If no feeds found, try basic content extraction
      return await this.parseHTMLContent(html, url);
      
    } catch (error) {
      console.log(`❌ Fallback method failed: ${error.message}`);
      return {
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'fallback'
      };
    }
  }

  private async parseRSSContent(rssContent: string, baseUrl: string): Promise<ScrapingResult> {
    console.log('📊 Parsing RSS/Atom content...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      // Extract items from RSS/Atom
      const itemMatches = rssContent.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
      
      console.log(`📄 Found ${itemMatches.length} RSS items`);

      for (const itemMatch of itemMatches.slice(0, 10)) { // Limit to 10 articles
        try {
          const article = await this.parseRSSItem(itemMatch, baseUrl);
          if (article) {
            // More flexible acceptance for regional sources - accept snippets if reasonable
            const isRegionalTopic = this.region && this.region.toLowerCase() !== 'global';
            const isWhitelistedDomain = this.isWhitelistedDomain(article.source_url);
            const minWordCount = (isRegionalTopic || isWhitelistedDomain) ? 75 : 150;
            const isSnippet = this.isContentSnippet(article.body, article.title);
            
            if (article.word_count >= minWordCount && (!isSnippet || isRegionalTopic || isWhitelistedDomain)) {
              // Mark snippets for editor review
              if (isSnippet) {
                article.import_metadata = {
                  ...article.import_metadata,
                  content_type: 'snippet',
                  needs_review: true
                };
              }
              articles.push(article);
            }
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

  private async parseRSSItem(itemXml: string, baseUrl: string): Promise<ArticleData | null> {
    // Extract basic data from RSS item
    const title = this.extractXMLContent(itemXml, 'title');
    const link = this.extractXMLContent(itemXml, 'link') || this.extractXMLContent(itemXml, 'guid');
    const description = this.extractXMLContent(itemXml, 'description') || this.extractXMLContent(itemXml, 'summary');
    const author = this.extractXMLContent(itemXml, 'author') || this.extractXMLContent(itemXml, 'dc:creator');
    const pubDate = this.extractXMLContent(itemXml, 'pubDate') || this.extractXMLContent(itemXml, 'published');

    if (!title || !link) {
      return null;
    }

    const articleUrl = this.resolveUrl(link, baseUrl);
    console.log(`📄 Fetching full content from: ${articleUrl}`);

    try {
      // Fetch full article content
      const articleHtml = await fetchWithRetry(articleUrl);
      const extractedContent = extractContentFromHTML(articleHtml, articleUrl);
      
      // Use full extracted content, fallback to RSS description
      const finalContent = extractedContent.body || description || '';
      const finalTitle = extractedContent.title || title;
      const wordCount = this.countWords(finalContent);
      
      // More flexible content acceptance - try to use RSS snippet if full extraction fails
      const isRegionalTopic = this.region && this.region.toLowerCase() !== 'global';
      const isWhitelistedDomain = this.isWhitelistedDomain(articleUrl);
      const minWordCount = (isRegionalTopic || isWhitelistedDomain) ? 75 : 150;
      const isSnippet = this.isContentSnippet(finalContent, finalTitle);
      
      // Use RSS description as fallback if full extraction insufficient
      if (!finalContent || wordCount < minWordCount) {
        if (description && this.countWords(description) >= 50) {
          console.log(`📝 Using RSS description as fallback content: ${this.countWords(description)} words`);
          finalContent = `${description}\n\n[Note: Content extracted from RSS feed]`;
          wordCount = this.countWords(finalContent);
        } else {
          console.log(`⚠️ Insufficient content for: ${finalTitle.substring(0, 50)}... (${wordCount} words)`);
          return null;
        }
      }
      
      // Skip only if clearly inadequate content
      if (!finalContent || wordCount < 25) {
        return null;
      }

      // Calculate regional relevance - for hyperlocal sources, give higher base scores
      let regionalRelevance = calculateRegionalRelevance(
        finalContent,
        finalTitle,
        this.region,
        this.sourceInfo?.source_type || 'national'
      );
      
      // Boost scores for hyperlocal sources even if no specific keywords match
      if (this.sourceInfo?.source_type === 'hyperlocal' && regionalRelevance < 10) {
        regionalRelevance = Math.max(regionalRelevance, 15); // Minimum relevance for hyperlocal
      }

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
          extraction_method: 'rss_enhanced',
          rss_description: description,
          source_domain: this.sourceInfo?.canonical_domain,
          scrape_timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.log(`❌ Failed to fetch full content for: ${title.substring(0, 50)}... - ${error.message}`);
      return null;
    }
  }

  private async parseHTMLContent(html: string, url: string): Promise<ScrapingResult> {
    console.log('📊 Parsing HTML content for articles...');
    
    const articles: ArticleData[] = [];
    const errors: string[] = [];

    try {
      // Try to extract articles from HTML
      const articleLinks = this.extractArticleLinks(html, url);
      
      console.log(`📄 Found ${articleLinks.length} potential article links`);

      for (const articleUrl of articleLinks.slice(0, 5)) { // Limit to 5 articles
        try {
          const articleHtml = await fetchWithRetry(articleUrl);
          const extractedContent = extractContentFromHTML(articleHtml, articleUrl);
          
          // More flexible acceptance for regional topics
          const isRegionalTopic = this.region && this.region.toLowerCase() !== 'global';
          const isWhitelistedDomain = this.isWhitelistedDomain(articleUrl);
          const minWordCount = (isRegionalTopic || isWhitelistedDomain) ? 75 : 150;
          const isSnippet = this.isContentSnippet(extractedContent.body, extractedContent.title);
          
          if (extractedContent.body && extractedContent.word_count >= minWordCount && (!isSnippet || isRegionalTopic || isWhitelistedDomain)) {
            // Calculate regional relevance - for hyperlocal sources, give higher base scores
            let regionalRelevance = calculateRegionalRelevance(
              extractedContent.body,
              extractedContent.title,
              this.region,
              this.sourceInfo?.source_type || 'national'
            );
            
            // Boost scores for hyperlocal sources even if no specific keywords match
            if (this.sourceInfo?.source_type === 'hyperlocal' && regionalRelevance < 10) {
              regionalRelevance = Math.max(regionalRelevance, 15); // Minimum relevance for hyperlocal
            }

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
                extraction_method: 'html_parsing',
                source_domain: this.sourceInfo?.canonical_domain,
                scrape_timestamp: new Date().toISOString()
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
        method: 'html'
      };

    } catch (error) {
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

  private extractArticleLinks(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    const linkMatches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];
    
    for (const linkMatch of linkMatches) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(linkMatch);
      if (hrefMatch) {
        const url = this.resolveUrl(hrefMatch[1], baseUrl);
        
        // Filter for likely article URLs
        if (this.isLikelyArticleUrl(url)) {
          links.push(url);
        }
      }
    }

    return [...new Set(links)]; // Remove duplicates
  }

  private isLikelyArticleUrl(url: string): boolean {
    const articlePatterns = [
      /\/article\//,
      /\/news\//,
      /\/story\//,
      /\/post\//,
      /\/blog\//,
      /\/\d{4}\/\d{2}\/\d{2}\//,
      /\/[^\/]+\/$/ // Likely article slug
    ];

    const excludePatterns = [
      /\.(jpg|jpeg|png|gif|pdf|mp4|mov)$/i,
      /\/category\//,
      /\/tag\//,
      /\/author\//,
      /\/page\//,
      /#/,
      /javascript:/
    ];

    return articlePatterns.some(pattern => pattern.test(url)) &&
           !excludePatterns.some(pattern => pattern.test(url));
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
    
    // More nuanced snippet detection - focus on clear truncation indicators
    const hasEllipsis = content.trim().endsWith('...') || content.trim().endsWith('…');
    const hasNoSentences = !content.includes('.') || content.split('.').length < 2;
    const isClearlyTruncated = hasEllipsis || hasNoSentences;
    
    // Only consider it a snippet if it has clear indicators AND is relatively short
    return hasSnippetIndicators || (isClearlyTruncated && wordCount < 75);
  }

  private isWhitelistedDomain(url: string): boolean {
    const whitelistedDomains = [
      'theargus.co.uk',
      'sussexexpress.co.uk',
      'brightonandhovenews.org',
      'sussexlive.co.uk',
      'eastsussexnews.co.uk',
      'brightonjournal.co.uk'
    ];
    
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return whitelistedDomains.some(whitelist => domain.includes(whitelist));
    } catch {
      return false;
    }
  }
}
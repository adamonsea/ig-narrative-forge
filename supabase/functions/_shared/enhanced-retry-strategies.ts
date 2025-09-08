/**
 * Enhanced retry strategies with user-agent rotation and intelligent delays
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBackoff: boolean;
  respectRobotsTxt?: boolean;
}

export interface ScrapingContext {
  url: string;
  isGovernmentSite: boolean;
  previousAttempts: number;
  lastError?: string;
}

export class EnhancedRetryStrategies {
  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
  ];

  private getCurrentUserAgent(attempt: number): string {
    return this.userAgents[attempt % this.userAgents.length];
  }

  private calculateDelay(context: ScrapingContext, config: RetryConfig): number {
    let delay = config.baseDelay;
    
    if (config.exponentialBackoff) {
      delay = Math.min(
        config.baseDelay * Math.pow(2, context.previousAttempts),
        config.maxDelay
      );
    }
    
    // Extra delay for government sites to be respectful
    if (context.isGovernmentSite) {
      delay = Math.max(delay * 2, 3000); // Minimum 3 seconds for gov sites
    }
    
    // Add jitter to avoid thundering herd
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  private isGovernmentSite(url: string): boolean {
    const govPatterns = [
      '.gov.uk',
      '.gov.',
      '.police.uk',
      '.nhs.uk',
      '.council.',
      'council.gov',
      'gov.scot',
      'gov.wales'
    ];
    
    return govPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  async fetchWithEnhancedRetry(
    url: string, 
    config: RetryConfig = {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      exponentialBackoff: true
    }
  ): Promise<string> {
    const context: ScrapingContext = {
      url,
      isGovernmentSite: this.isGovernmentSite(url),
      previousAttempts: 0
    };

    console.log(`🌐 Fetching ${url} (attempt 1/${config.maxRetries + 1}) ${context.isGovernmentSite ? '[GOV SITE]' : ''}`);

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const userAgent = this.getCurrentUserAgent(attempt);
        const headers = this.getEnhancedHeaders(context, userAgent);
        
        // Intelligent delay before request (except first attempt)
        if (attempt > 0) {
          const delay = this.calculateDelay(context, config);
          console.log(`⏳ Intelligent delay: ${Math.round(delay)}ms (gov: ${context.isGovernmentSite}, requests: ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const controller = new AbortController();
        const timeout = context.isGovernmentSite ? 45000 : 30000; // Longer timeout for gov sites
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        console.log(`🌐 Fetching ${url} (attempt ${attempt + 1}/${config.maxRetries + 1}) ${context.isGovernmentSite ? '[GOV SITE]' : ''}`);

        const response = await fetch(url, {
          signal: controller.signal,
          headers,
          redirect: 'follow'
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const content = await response.text();
        
        // Validate content quality
        if (this.isValidContent(content)) {
          console.log(`✅ Successfully fetched content from ${url} (${content.length} chars, attempt ${attempt + 1})`);
          return content;
        } else {
          throw new Error('INVALID_CONTENT: Received error page or minimal content');
        }

      } catch (error) {
        context.previousAttempts = attempt;
        context.lastError = error.message;
        
        console.log(`❌ Attempt ${attempt + 1} failed: ${error.message}`);
        
        // Don't retry on certain errors
        if (this.isFatalError(error)) {
          throw error;
        }
        
        // If this was our last attempt, throw the error
        if (attempt === config.maxRetries) {
          throw new Error(`All retry attempts failed. Last error: ${error.message}`);
        }
        
        console.log(`⏳ Retrying in ${Math.round(this.calculateDelay(context, config))}ms...`);
      }
    }

    throw new Error('Unexpected end of retry loop');
  }

  private getEnhancedHeaders(context: ScrapingContext, userAgent: string): Record<string, string> {
    const baseHeaders = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };

    // Special headers for government sites
    if (context.isGovernmentSite) {
      return {
        ...baseHeaders,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1'
      };
    }

    return baseHeaders;
  }

  private isValidContent(content: string): boolean {
    // Check for common error indicators
    const errorIndicators = [
      'access denied',
      'forbidden',
      'not found',
      'error 404',
      'error 403',
      'error 500',
      'maintenance mode',
      'temporarily unavailable',
      'cloudflare',
      'captcha'
    ];

    const lowerContent = content.toLowerCase();
    const hasErrorIndicators = errorIndicators.some(indicator => 
      lowerContent.includes(indicator)
    );

    // Check minimum content length
    const hasMinimumContent = content.length > 500;
    
    // Check for actual HTML structure
    const hasHtmlStructure = content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('<rss') || content.includes('<feed');

    return !hasErrorIndicators && hasMinimumContent && hasHtmlStructure;
  }

  private isFatalError(error: any): boolean {
    const fatalErrors = [
      'ERR_NAME_NOT_RESOLVED',
      'ERR_INTERNET_DISCONNECTED',
      'ERR_CONNECTION_REFUSED',
      'ENOTFOUND',
      'ECONNREFUSED'
    ];

    return fatalErrors.some(fatal => 
      error.message?.includes(fatal) || error.code?.includes(fatal)
    );
  }

  // Method to test if a URL is accessible before attempting full scrape
  async quickAccessibilityCheck(url: string): Promise<{
    accessible: boolean;
    responseTime: number;
    statusCode?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000); // 10 second timeout for quick check

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgents[0]
        }
      });

      return {
        accessible: response.ok,
        responseTime: Date.now() - startTime,
        statusCode: response.status
      };

    } catch (error) {
      return {
        accessible: false,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }
}
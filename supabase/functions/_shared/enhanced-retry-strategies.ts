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
    // Latest Chrome versions - most common and accepted
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    
    // Firefox versions
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
    
    // Safari and Edge
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    
    // Mobile user agents for better acceptance
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
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
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 8000,
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
        const timeout = context.isGovernmentSite ? 15000 : 10000; // Reduced timeout for edge functions
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        context.lastError = errorMessage;
        
        console.log(`❌ Attempt ${attempt + 1} failed: ${errorMessage}`);
        
        // Don't retry on certain errors
        if (this.isFatalError(error)) {
          throw error;
        }
        
        // If this was our last attempt, throw the error
        if (attempt === config.maxRetries) {
          const lastErrorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`All retry attempts failed. Last error: ${lastErrorMessage}`);
        }
        
        console.log(`⏳ Retrying in ${Math.round(this.calculateDelay(context, config))}ms...`);
      }
    }

    throw new Error('Unexpected end of retry loop');
  }

  private getEnhancedHeaders(context: ScrapingContext, userAgent: string): Record<string, string> {
    const baseHeaders = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };

    // Enhanced headers for government sites
    if (context.isGovernmentSite) {
      return {
        ...baseHeaders,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Priority': 'u=0, i',
        // Remove DNT and other tracking headers for gov sites
        'Accept-Language': 'en-GB,en;q=0.9'
      };
    }

    // Add Referer for normal sites to appear more legitimate
    const hostname = new URL(context.url).hostname;
    return {
      ...baseHeaders,
      'Referer': `https://${hostname}/`,
      'Origin': `https://${hostname}`
    };
  }

  private isValidContent(content: string): boolean {
    // UNIVERSAL PLATFORM FIX: Much more permissive content validation
    
    // Only reject if content is extremely minimal (less than 50 characters)
    if (content.length < 50) {
      console.log(`⚠️ Content too short: ${content.length} chars`);
      return false;
    }

    // Only check for critical blocking errors - be very conservative
    const criticalErrors = [
      'access is denied',
      'captcha verification required', 
      'please complete the security check',
      'cloudflare security check'
    ];

    const lowerContent = content.toLowerCase();
    const hasCriticalError = criticalErrors.some(error => 
      lowerContent.includes(error)
    );

    if (hasCriticalError) {
      console.log(`⚠️ Critical blocking error detected`);
      return false;
    }

    // Accept virtually all content - news sites vary greatly in structure
    console.log(`✅ Content validation passed: ${content.length} chars`);
    return true;
  }

  private isFatalError(error: any): boolean {
    // EMERGENCY FIX: Only consider true network failures as fatal
    const fatalErrors = [
      'ERR_NAME_NOT_RESOLVED',
      'ERR_INTERNET_DISCONNECTED', 
      'ENOTFOUND',
      'ECONNREFUSED',
      'ERR_NETWORK'
    ];

    // Fail fast on repeated HTTP 503/504 errors
    const httpErrorPattern = /^HTTP (503|504):/;
    if (httpErrorPattern.test(error.message)) {
      console.log(`💀 Server error ${error.message} - failing fast`);
      return true;
    }

    // Don't consider other HTTP errors as fatal - retry them
    const otherHttpPattern = /^HTTP \d+:/;
    if (otherHttpPattern.test(error.message)) {
      console.log(`🔄 HTTP error ${error.message} - will retry`);
      return false;
    }

    // Don't consider INVALID_CONTENT as fatal - might be temporary
    if (error.message?.includes('INVALID_CONTENT')) {
      console.log(`🔄 Invalid content error - will retry with different approach`);
      return false;
    }

    const isFatal = fatalErrors.some(fatal => 
      error.message?.includes(fatal) || error.code?.includes(fatal)
    );

    if (isFatal) {
      console.log(`💀 Fatal error detected: ${error.message}`);
    }

    return isFatal;
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
      setTimeout(() => controller.abort(), 5000); // Reduced timeout for edge functions

      // Use enhanced headers for better acceptance
      const headers = this.getEnhancedHeaders({ 
        url, 
        isGovernmentSite: this.isGovernmentSite(url), 
        previousAttempts: 0 
      }, this.userAgents[0]);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers
      });

      return {
        accessible: response.ok,
        responseTime: Date.now() - startTime,
        statusCode: response.status
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        accessible: false,
        responseTime: Date.now() - startTime,
        error: errorMessage
      };
    }
  }

  // Enhanced method for problematic sources
  async fetchWithDomainSpecificStrategy(url: string): Promise<string> {
    const domain = new URL(url).hostname.toLowerCase();
    
    // Special handling for known problematic sources
    const problemDomains = [
      'theargus.co.uk',
      'sussexnews24.co.uk', 
      'easbournenews.co.uk',
      'brightonandhovenews.org'
    ];

    if (problemDomains.some(d => domain.includes(d))) {
      console.log(`🎯 Using specialized strategy for problematic domain: ${domain}`);
      
      // Use longer delays and more conservative approach
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelay: 2000, // 2 seconds base delay
        maxDelay: 15000,
        exponentialBackoff: true
      };

      return this.fetchWithEnhancedRetry(url, config);
    }

    // Standard approach for other domains
    return this.fetchWithEnhancedRetry(url);
  }

  // Source health monitoring
  async logSourceHealth(sourceId: string, url: string, success: boolean, error?: string): Promise<void> {
    try {
      const healthData = {
        source_id: sourceId,
        check_time: new Date().toISOString(),
        is_accessible: success,
        response_time_ms: null,
        error_details: error || null,
        check_type: 'scraping_attempt'
      };

      console.log(`📊 Logging source health for ${url}: ${success ? 'SUCCESS' : 'FAILED'}`);
      
      // You could store this in a source_health table if needed
      // For now, we'll log it to system_logs
      console.log('Source health data:', JSON.stringify(healthData, null, 2));
      
    } catch (logError) {
      const logErrorMessage = logError instanceof Error ? logError.message : String(logError);
      console.log(`❌ Failed to log source health: ${logErrorMessage}`);
    }
  }
}
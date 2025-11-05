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

export type AccessibilityDiagnosis =
  | 'ok'
  | 'head-blocked'
  | 'partial-get-blocked'
  | 'cookie-required'
  | 'alternate-route'
  | 'residential-required'
  | 'full-block'
  | 'network-block'
  | 'unknown';

type AlternateRouteStrategy =
  | 'amp-host'
  | 'amp-query'
  | 'amp-path-prefix'
  | 'mobile-host'
  | 'rss-suffix'
  | 'newsquest-section-rss';

type WarmupBlockProfile = {
  server?: string;
  diagnosis?: AccessibilityDiagnosis;
  details?: string;
};

type WarmupHint = {
  cookieHeader?: string;
  lastUpdated: number;
  reason: string;
  lastStatus?: number;
  blockProfile?: WarmupBlockProfile;
  alternateRoute?: {
    strategy: AlternateRouteStrategy;
    lastSuccess: number;
  };
  residentialIpHint?: {
    sampleIp: string;
    country?: string;
    lastTried: number;
    lastSuccess?: number;
    reason?: string;
  };
};

export class EnhancedRetryStrategies {
  private domainProfile: any | null = null;
  private newsquestDomains = new Set([
    'sussexexpress.co.uk',
    'theargus.co.uk',
    'theboltonnews.co.uk',
    'basingstokegazette.co.uk',
    'dorsetecho.co.uk',
    'oxfordmail.co.uk',
    'worcesternews.co.uk',
    'wiltsglosstandard.co.uk',
    'thisisthewestcountry.co.uk'
  ]);
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

  private dynamicWarmupDomains = new Map<string, WarmupHint>();
  private residentialIpPools: Record<string, string[]> = {
    gb: ['82.29.17.84', '86.21.94.120', '94.11.34.200', '109.158.123.40', '188.29.56.22'],
    ie: ['86.40.16.210', '109.76.23.144', '87.198.64.33'],
    au: ['58.96.132.71', '123.3.45.19', '110.175.98.142'],
    ca: ['99.238.101.77', '142.118.64.211', '104.222.132.45'],
    us: ['73.142.88.214', '67.165.23.44', '24.12.156.201'],
    default: ['98.142.110.77', '70.45.112.88', '24.104.56.201']
  };

  constructor() {
    const now = Date.now();
    for (const domain of this.newsquestDomains) {
      this.dynamicWarmupDomains.set(domain, {
        reason: 'preseeded-newsquest',
        lastUpdated: now,
        blockProfile: {
          server: 'newsquest-edge',
          diagnosis: 'partial-get-blocked',
          details: 'Pre-seeded warm-up hint for Newsquest domains'
        },
        alternateRoute: {
          strategy: 'amp-query',
          lastSuccess: now
        }
      });
    }
  }

  /**
   * Set domain profile for this retry strategy instance
   */
  setDomainProfile(profile: any): void {
    this.domainProfile = profile;
  }

  private getCurrentUserAgent(attempt: number): string {
    return this.userAgents[attempt % this.userAgents.length];
  }

  private getDomainKeyFromHost(hostname: string): string {
    const normalized = hostname.toLowerCase();
    return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
  }

  private getDomainKeyFromUrl(url: string): string {
    return this.getDomainKeyFromHost(new URL(url).hostname);
  }

  /**
   * Dynamically determines if warmup is needed based on cached hints
   */
  private determineWarmupStrategy(hint?: WarmupHint): {
    needsWarmup: boolean;
    reason: string;
    confidenceLevel: 'high' | 'medium' | 'low';
  } {
    if (!hint) {
      return {
        needsWarmup: false,
        reason: 'no-history',
        confidenceLevel: 'low'
      };
    }

    const age = Date.now() - hint.lastUpdated;
    const isRecent = age < 5 * 60 * 1000; // 5 minutes

    // High confidence: Recent hint with cookie or successful alternate route
    if (isRecent && (hint.cookieHeader || hint.alternateRoute)) {
      return {
        needsWarmup: !!hint.cookieHeader,
        reason: hint.cookieHeader ? 'recent-cookie-success' : 'recent-alternate-route',
        confidenceLevel: 'high'
      };
    }

    // Medium confidence: diagnosis suggests blocking
    const blockingDiagnoses: AccessibilityDiagnosis[] = [
      'cookie-required',
      'head-blocked',
      'partial-get-blocked'
    ];

    if (hint.blockProfile?.diagnosis && blockingDiagnoses.includes(hint.blockProfile.diagnosis)) {
      return {
        needsWarmup: true,
        reason: `diagnosed-as-${hint.blockProfile.diagnosis}`,
        confidenceLevel: isRecent ? 'high' : 'medium'
      };
    }

    // Low confidence: old hint or no clear pattern
    return {
      needsWarmup: false,
      reason: 'unclear-pattern',
      confidenceLevel: 'low'
    };
  }

  /**
   * Determines if cautious approach is needed based on domain history
   */
  private determineCautiousStrategy(hint?: WarmupHint): {
    useCautious: boolean;
    baseDelay: number;
    maxRetries: number;
    reason: string;
  } {
    if (!hint) {
      return {
        useCautious: false,
        baseDelay: 500,
        maxRetries: 2,
        reason: 'no-history'
      };
    }

    const hasRecentFailure = hint.blockProfile?.diagnosis &&
      ['full-block', 'network-block'].includes(hint.blockProfile.diagnosis);

    const hasSuccessfulWorkaround = hint.alternateRoute ||
      (hint.cookieHeader && hint.blockProfile?.diagnosis === 'cookie-required');

    // Cautious: known blocking but no successful workaround yet
    if (hasRecentFailure && !hasSuccessfulWorkaround) {
      return {
        useCautious: true,
        baseDelay: 2000,
        maxRetries: 3,
        reason: `cautious-due-to-${hint.blockProfile?.diagnosis}`
      };
    }

    // Moderate: has workaround, use medium delays
    if (hasSuccessfulWorkaround) {
      return {
        useCautious: true,
        baseDelay: 1500,
        maxRetries: 3,
        reason: 'using-known-workaround'
      };
    }

    // Standard: no issues or old hint
    return {
      useCautious: false,
      baseDelay: 500,
      maxRetries: 2,
      reason: 'standard-approach'
    };
  }

  private rememberWarmupHint(
    domainKey: string,
    info: {
      cookieHeader?: string;
      reason: string;
      statusCode?: number;
      blockProfile?: WarmupBlockProfile;
      alternateRoute?: {
        strategy: AlternateRouteStrategy;
        lastSuccess?: number;
      };
      residentialIpHint?: {
        sampleIp: string;
        country?: string;
        lastTried: number;
        lastSuccess?: number;
        reason?: string;
      };
    }
  ): void {
    const previous = this.dynamicWarmupDomains.get(domainKey);

    this.dynamicWarmupDomains.set(domainKey, {
      cookieHeader: info.cookieHeader ?? previous?.cookieHeader,
      lastUpdated: Date.now(),
      reason: info.reason,
      lastStatus: info.statusCode ?? previous?.lastStatus,
      blockProfile: info.blockProfile
        ? { ...previous?.blockProfile, ...info.blockProfile }
        : previous?.blockProfile,
      alternateRoute: info.alternateRoute
        ? {
            strategy: info.alternateRoute.strategy,
            lastSuccess: info.alternateRoute.lastSuccess ?? Date.now()
          }
        : previous?.alternateRoute,
      residentialIpHint: info.residentialIpHint
        ? {
            sampleIp: info.residentialIpHint.sampleIp,
            country: info.residentialIpHint.country ?? previous?.residentialIpHint?.country,
            lastTried: info.residentialIpHint.lastTried,
            lastSuccess: info.residentialIpHint.lastSuccess ?? previous?.residentialIpHint?.lastSuccess,
            reason: info.residentialIpHint.reason ?? previous?.residentialIpHint?.reason
          }
        : previous?.residentialIpHint
    });
  }

  private inferCountryFromHost(hostname: string): string | undefined {
    const lowerHost = hostname.toLowerCase();

    if (/(\.uk)$/.test(lowerHost) || /(\.co\.uk|\.org\.uk|\.gov\.uk)$/.test(lowerHost)) {
      return 'gb';
    }

    if (/(\.ie)$/.test(lowerHost)) {
      return 'ie';
    }

    if (/(\.au)$/.test(lowerHost) || /(\.com\.au)$/.test(lowerHost)) {
      return 'au';
    }

    if (/(\.ca)$/.test(lowerHost)) {
      return 'ca';
    }

    if (/(\.nz)$/.test(lowerHost)) {
      return 'nz';
    }

    if (/(\.us)$/.test(lowerHost) || lowerHost.endsWith('.com')) {
      return 'us';
    }

    return undefined;
  }

  private getAcceptLanguageForCountry(country: string): string {
    const languageMap: Record<string, string> = {
      gb: 'en-GB,en;q=0.9',
      ie: 'en-IE,en;q=0.9,ga;q=0.8',
      au: 'en-AU,en;q=0.9',
      ca: 'en-CA,en;q=0.9,fr-CA;q=0.8',
      us: 'en-US,en;q=0.9',
      default: 'en-US,en;q=0.9'
    };

    return languageMap[country] || languageMap.default;
  }

  private applyRegionalHeaders(headers: Record<string, string>, countryHint?: string): void {
    if (countryHint) {
      headers['Accept-Language'] = this.getAcceptLanguageForCountry(countryHint);
    }
  }

  private applyStealthHeaders(headers: Record<string, string>): void {
    // Remove bot-detection headers
    delete headers['Sec-Fetch-Dest'];
    delete headers['Sec-Fetch-Mode'];
    delete headers['Sec-Fetch-Site'];
    delete headers['Sec-Fetch-User'];
    console.log('🛡️ Applying stealth header profile (removed Sec-Fetch headers)');
  }

  private applyResidentialHeaders(headers: Record<string, string>, countryHint?: string): void {
    const residentialIp = this.pickResidentialIp(countryHint);
    if (residentialIp) {
      headers['X-Forwarded-For'] = residentialIp.ip;
      headers['X-Real-IP'] = residentialIp.ip;
      headers['Via'] = '1.1 ' + residentialIp.ip;
      console.log(`🏠 Applying fresh residential IP hint (${residentialIp.country}): ${residentialIp.ip}`);
    }
  }

  private shouldUseStealthHeaders(status: number, serverHeader?: string, hostname?: string): boolean {
    // Use stealth for 403/429 responses
    if (status === 403 || status === 429) {
      return true;
    }

    // Use stealth for known bot-detection servers
    if (serverHeader) {
      const lowerServer = serverHeader.toLowerCase();
      if (lowerServer.includes('envoy') || lowerServer.includes('akamai') || lowerServer.includes('cloudfront')) {
        return true;
      }
    }

    // Use stealth for UK domains (common Newsquest/Akamai pattern)
    if (hostname && hostname.endsWith('.co.uk')) {
      return true;
    }

    return false;
  }

  private shouldUseResidentialIp(status: number, hint?: WarmupHint, hostname?: string): boolean {
    // Use residential IP for 403 blocks
    if (status === 403) {
      return true;
    }

    // Use residential IP if previously diagnosed as needing it
    if (hint?.blockProfile?.diagnosis === 'residential-required') {
      return true;
    }

    // Use residential IP for UK/IE domains (high Akamai/CDN usage)
    if (hostname) {
      const country = this.inferCountryFromHost(hostname);
      if (country === 'gb' || country === 'ie') {
        return true;
      }
    }

    return false;
  }

  private pickResidentialIp(countryHint?: string): { ip: string; country: string } | null {
    const normalized = countryHint?.toLowerCase();
    const pool = (normalized && this.residentialIpPools[normalized]) || this.residentialIpPools.default;

    if (!pool || pool.length === 0) {
      return null;
    }

    const ip = pool[Math.floor(Math.random() * pool.length)];
    return { ip, country: normalized ?? 'default' };
  }

  private applyAlternateRoute(url: string, strategy: AlternateRouteStrategy): string | null {
    try {
      const urlObj = new URL(url);
      const { hostname, pathname, searchParams } = urlObj;
      const ensureTrailingSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

      switch (strategy) {
        case 'amp-host': {
          if (hostname.startsWith('amp.')) {
            return null;
          }

          const hostParts = hostname.split('.');
          if (hostParts.length < 2) {
            return null;
          }

          if (hostParts[0] === 'www') {
            hostParts[0] = 'amp';
          } else {
            hostParts.unshift('amp');
          }

          urlObj.hostname = hostParts.join('.');
          return urlObj.toString();
        }
        case 'mobile-host': {
          if (hostname.startsWith('m.')) {
            return null;
          }

          const hostParts = hostname.split('.');
          if (hostParts.length < 2) {
            return null;
          }

          if (hostParts[0] === 'www') {
            hostParts[0] = 'm';
          } else {
            hostParts.unshift('m');
          }

          urlObj.hostname = hostParts.join('.');
          return urlObj.toString();
        }
        case 'amp-query': {
          if (searchParams.has('output') && searchParams.get('output') === 'amp') {
            return null;
          }

          searchParams.set('output', 'amp');
          urlObj.search = searchParams.toString();
          return urlObj.toString();
        }
        case 'amp-path-prefix': {
          if (pathname.startsWith('/amp/')) {
            return null;
          }

          const normalized = ensureTrailingSlash(pathname);
          urlObj.pathname = `/amp${normalized}`;
          return urlObj.toString();
        }
        case 'rss-suffix': {
          if (pathname.includes('/rss')) {
            return null;
          }

          const normalized = ensureTrailingSlash(pathname);
          urlObj.pathname = `${normalized}rss/`;
          return urlObj.toString();
        }
        case 'newsquest-section-rss': {
          const domainKey = this.getDomainKeyFromHost(urlObj.hostname);
          const isNewsquest = this.newsquestDomains.has(domainKey) || 
                              this.domainProfile?.family === 'newsquest';
          
          if (!isNewsquest) {
            return null;
          }

          const normalizedPath = pathname && pathname !== '/' ? ensureTrailingSlash(pathname) : '/news/';
          const basePath = normalizedPath === '/' ? '/news/' : normalizedPath;
          urlObj.pathname = basePath.endsWith('rss/') ? basePath : `${basePath.replace(/\/$/, '')}/rss/`;
          return urlObj.toString();
        }
        default:
          return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ Failed to build alternate route (${strategy}): ${message}`);
      return null;
    }
  }

  private generateAlternateAccessRoutes(url: string): Array<{
    url: string;
    strategy: AlternateRouteStrategy;
  }> {
    const domainKey = this.getDomainKeyFromUrl(url);
    const strategies: AlternateRouteStrategy[] = [
      'amp-host',
      'amp-query',
      'amp-path-prefix',
      'mobile-host',
      'rss-suffix'
    ];

    // Check domain profile first, fallback to hardcoded set
    const isNewsquest = this.domainProfile?.family === 'newsquest' || 
                        this.newsquestDomains.has(domainKey);
    
    if (isNewsquest) {
      strategies.push('newsquest-section-rss');
    }

    // Add custom alternate routes from domain profile
    if (this.domainProfile?.alternateRoutes) {
      for (const route of this.domainProfile.alternateRoutes) {
        if (route.strategy && !strategies.includes(route.strategy)) {
          strategies.push(route.strategy as AlternateRouteStrategy);
        }
      }
    }

    const seen = new Set<string>();
    const alternates: Array<{ url: string; strategy: AlternateRouteStrategy }> = [];

    for (const strategy of strategies) {
      const alternateUrl = this.applyAlternateRoute(url, strategy);
      if (!alternateUrl) {
        continue;
      }

      if (alternateUrl === url) {
        continue;
      }

      const normalized = alternateUrl.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      alternates.push({ url: alternateUrl, strategy });
    }

    return alternates;
  }

  private async attemptAlternateRoutes(
    url: string,
    config: RetryConfig,
    options: {
      cookieHeader?: string;
      reason?: string;
      allowHastingsMode?: boolean;
    } = {}
  ): Promise<string | null> {
    const alternates = this.generateAlternateAccessRoutes(url);

    if (alternates.length === 0) {
      return null;
    }

    const domainKey = this.getDomainKeyFromUrl(url);

    for (const alternate of alternates) {
      try {
        console.log(`🛣️ Trying alternate route (${alternate.strategy}) -> ${alternate.url}`);

        const alternateConfig: RetryConfig = {
          ...config,
          maxRetries: Math.min(config.maxRetries, 2)
        };

        const reason = options.reason ? `${options.reason}:${alternate.strategy}` : `alternate:${alternate.strategy}`;

        const result = options.allowHastingsMode
          ? await this.fetchWithEnhancedRetryHastings(alternate.url, alternateConfig, {
              cookieHeader: options.cookieHeader,
              reason,
              skipAlternateRoutes: true
            })
          : await this.fetchWithEnhancedRetry(alternate.url, alternateConfig, {
              allowAlternateRoutes: false,
              cookieHeader: options.cookieHeader,
              reason
            });

        this.rememberWarmupHint(domainKey, {
          reason: `alternate-route:${alternate.strategy}`,
          blockProfile: {
            diagnosis: 'alternate-route',
            details: `Alternate route ${alternate.strategy} succeeded`
          },
          alternateRoute: {
            strategy: alternate.strategy,
            lastSuccess: Date.now()
          }
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`🛣️ Alternate route failed (${alternate.strategy}): ${message}`);
      }
    }

    return null;
  }

  private extractCookiesFromHeaders(headers: Headers): string | undefined {
    const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
    let rawCookies: string[] = [];

    if (typeof anyHeaders.getSetCookie === 'function') {
      try {
        rawCookies = anyHeaders.getSetCookie();
      } catch (_) {
        rawCookies = [];
      }
    }

    if (!rawCookies.length) {
      const headerValue = headers.get('set-cookie');
      if (headerValue) {
        rawCookies = headerValue.split(/,(?=[^;,\s]+=)/g);
      }
    }

    const cookiePairs = rawCookies
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map(cookie => cookie.split(';')[0])
      .filter(Boolean);

    if (!cookiePairs.length) {
      return undefined;
    }

    return cookiePairs.join('; ');
  }

  private async performCookieWarmup(
    url: string,
    reason: string,
    options: { force?: boolean } = {}
  ): Promise<string | undefined> {
    const hostname = new URL(url).hostname;
    const domainKey = this.getDomainKeyFromHost(hostname);
    const existing = this.dynamicWarmupDomains.get(domainKey);

    if (!options.force && existing && Date.now() - existing.lastUpdated < 60_000) {
      console.log(`🍪 COOKIE_WARMUP_SKIP (cached) for ${hostname}`);
      return existing.cookieHeader;
    }

    const homepageUrl = `https://${hostname}/`;

    console.log(`🍪 COOKIE_WARMUP_START [${reason}] for ${homepageUrl}`);

    try {
      const warmupController = new AbortController();
      const warmupTimeoutId = setTimeout(() => warmupController.abort(), 5000);

      const warmupResponse = await fetch(homepageUrl, {
        method: 'GET',
        signal: warmupController.signal,
        headers: this.getEnhancedHeaders({
          url: homepageUrl,
          isGovernmentSite: this.isGovernmentSite(homepageUrl),
          previousAttempts: 0
        }, this.userAgents[0]),
        redirect: 'follow'
      });

      clearTimeout(warmupTimeoutId);

      const cookieHeader = this.extractCookiesFromHeaders(warmupResponse.headers);

      if (cookieHeader) {
        console.log(`🍪 COOKIE_WARMUP_OK (${hostname})`);
      } else {
        console.log(`🍪 COOKIE_WARMUP_NO_COOKIES (${hostname})`);
      }

      const serverHeader = warmupResponse.headers.get('server') || existing?.blockProfile?.server;

      this.rememberWarmupHint(domainKey, {
        cookieHeader,
        reason: `warmup:${reason}`,
        statusCode: warmupResponse.status,
        blockProfile: {
          server: serverHeader,
          details: `Warm-up returned status ${warmupResponse.status}`,
          diagnosis: existing?.blockProfile?.diagnosis
        }
      });

      await new Promise(resolve => setTimeout(resolve, 750));

      return cookieHeader;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`🍪 COOKIE_WARMUP_FAIL (${hostname}) [${reason}]: ${message}`);

      this.rememberWarmupHint(domainKey, {
        reason: `warmup-failed:${reason}`,
        blockProfile: existing?.blockProfile
      });

      return existing?.cookieHeader;
    }
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
    },
    options: {
      allowAlternateRoutes?: boolean;
      cookieHeader?: string;
      reason?: string;
    } = {}
  ): Promise<string> {
    const context: ScrapingContext = {
      url,
      isGovernmentSite: this.isGovernmentSite(url),
      previousAttempts: 0
    };

    const domainKey = this.getDomainKeyFromUrl(url);
    let dynamicHint = this.dynamicWarmupDomains.get(domainKey);

    const hostname = new URL(url).hostname;
    const countryHint = this.inferCountryFromHost(hostname);

    let activeCookieHeader = options.cookieHeader || dynamicHint?.cookieHeader;
    let extraAttemptsGranted = false;

    const dynamicAlternate =
      options.allowAlternateRoutes !== false
        ? dynamicHint?.alternateRoute
        : undefined;

    const initialUrl = dynamicAlternate
      ? this.applyAlternateRoute(url, dynamicAlternate.strategy) ?? url
      : url;

    if (initialUrl !== url) {
      console.log(`🛣️ Using cached alternate route (${dynamicAlternate?.strategy}) for ${url}`);
    }

    const targetUrl = initialUrl;

    console.log(`🌐 Fetching ${targetUrl} (attempt 1/${config.maxRetries + 1}) ${context.isGovernmentSite ? '[GOV SITE]' : ''}`);

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const userAgent = this.getCurrentUserAgent(attempt);
        const requestContext: ScrapingContext = {
          ...context,
          url: targetUrl
        };

        const headers = this.getEnhancedHeaders(requestContext, userAgent);
        
        // Apply regional headers based on country hint
        this.applyRegionalHeaders(headers, countryHint);

        // Apply adaptive headers based on previous attempt results
        if (attempt > 0 && dynamicHint) {
          const serverHeader = dynamicHint.blockProfile?.server;
          const lastStatus = dynamicHint.lastStatus || 0;

          if (this.shouldUseStealthHeaders(lastStatus, serverHeader, hostname)) {
            this.applyStealthHeaders(headers);
          }

          if (this.shouldUseResidentialIp(lastStatus, dynamicHint, hostname)) {
            this.applyResidentialHeaders(headers, countryHint);
          }
        }
        
        if (activeCookieHeader) {
          headers['Cookie'] = activeCookieHeader;
        }
        
        // Intelligent delay before request (except first attempt)
        if (attempt > 0) {
          const delay = this.calculateDelay(context, config);
          console.log(`⏳ Intelligent delay: ${Math.round(delay)}ms (gov: ${context.isGovernmentSite}, requests: ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const controller = new AbortController();
        const timeout = context.isGovernmentSite ? 15000 : 10000; // Reduced timeout for edge functions
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        console.log(`🌐 Fetching ${targetUrl} (attempt ${attempt + 1}/${config.maxRetries + 1}) ${context.isGovernmentSite ? '[GOV SITE]' : ''}`);

        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers,
          redirect: 'follow'
        });

        clearTimeout(timeoutId);

        // Capture cookies from response for mid-flight learning
        const responseCookies = this.extractCookiesFromHeaders(response.headers);
        if (responseCookies) {
          console.log(`🍪 Captured fresh cookie from response`);
          activeCookieHeader = responseCookies;
          
          // Update hint with fresh cookie
          this.rememberWarmupHint(domainKey, {
            cookieHeader: responseCookies,
            reason: 'mid-flight-capture',
            statusCode: response.status,
            blockProfile: dynamicHint?.blockProfile
          });
          
          // Refresh dynamicHint reference
          dynamicHint = this.dynamicWarmupDomains.get(domainKey);
        }

        // Helper function for GET fallback with Range header
        const tryGetFallback = async (reason: string): Promise<string | null> => {
          console.log(`🔄 GET_RANGE_FALLBACK_START: ${reason}`);
          
          try {
            const rangeHeaders = {
              ...headers,
              'Range': 'bytes=0-8192', // Get first 8KB only
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            };
            
            const rangeController = new AbortController();
            const rangeTimeoutId = setTimeout(() => rangeController.abort(), 5000);
            
            const rangeResponse = await fetch(targetUrl, {
              method: 'GET',
              signal: rangeController.signal,
              headers: rangeHeaders,
              redirect: 'follow'
            });
            
            clearTimeout(rangeTimeoutId);
            
            if (rangeResponse.ok || rangeResponse.status === 206) {
              const content = await rangeResponse.text();
              
              console.log(`🔄 GET_RANGE_FALLBACK_OK (status ${rangeResponse.status}, bytes ${content.length})`);
              
              if (this.isValidContent(content)) {
                console.log(`✅ GET fallback succeeded for ${url} (${content.length} chars)`);
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

        // Phase 1: Check for explicit blocking status codes
        if ([401, 403, 405, 406, 429].includes(response.status)) {
          // Update hint with blocking status
          const serverHeader = response.headers.get('server');
          this.rememberWarmupHint(domainKey, {
            reason: `blocked-${response.status}`,
            statusCode: response.status,
            blockProfile: {
              server: serverHeader || undefined,
              diagnosis: response.status === 403 ? 'residential-required' : 'cookie-required',
              details: `Blocked with status ${response.status}`
            }
          });
          
          // Refresh dynamicHint reference
          dynamicHint = this.dynamicWarmupDomains.get(domainKey);
          
          // Trigger cookie warmup on 403
          if (response.status === 403 && attempt < config.maxRetries) {
            console.log(`🍪 Triggering cookie warmup after 403...`);
            const warmupCookie = await this.performCookieWarmup(url, '403-detected');
            if (warmupCookie) {
              activeCookieHeader = warmupCookie;
              dynamicHint = this.dynamicWarmupDomains.get(domainKey);
            }
          }
          
          const fallbackContent = await tryGetFallback(`${response.status} detected`);
          if (fallbackContent) {
            // Track successful residential IP usage
            if (headers['X-Forwarded-For']) {
              this.rememberWarmupHint(domainKey, {
                reason: 'residential-success',
                statusCode: 200,
                residentialIpHint: {
                  sampleIp: headers['X-Forwarded-For'],
                  country: countryHint,
                  lastTried: Date.now(),
                  lastSuccess: Date.now(),
                  reason: `Residential IP bypassed ${response.status}`
                }
              });
            }
            return fallbackContent;
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Phase 2: Fetch content and validate
        const content = await response.text();
        
        if (this.isValidContent(content)) {
          console.log(`✅ Successfully fetched content from ${url} (${content.length} chars, attempt ${attempt + 1})`);
          
          // Track successful residential IP usage
          if (headers['X-Forwarded-For']) {
            this.rememberWarmupHint(domainKey, {
              reason: 'residential-success',
              statusCode: response.status,
              residentialIpHint: {
                sampleIp: headers['X-Forwarded-For'],
                country: countryHint,
                lastTried: Date.now(),
                lastSuccess: Date.now(),
                reason: 'Residential IP succeeded'
              }
            });
          }
          
          return content;
        }
        
        // Phase 3: Got 200 OK but content is invalid - try GET fallback
        console.log(`⚠️ Got 200 OK but invalid content (${content.length} chars)`);
        const fallbackContent = await tryGetFallback('Invalid content despite 200 OK');
        if (fallbackContent) {
          // Grant extra attempt if warmup succeeded on last retry
          if (attempt === config.maxRetries && !extraAttemptsGranted && activeCookieHeader) {
            console.log(`🔄 Cookie warmup succeeded on last attempt - granting +1 retry`);
            config.maxRetries++;
            extraAttemptsGranted = true;
          }
          return fallbackContent;
        }
        
        // All fallbacks failed
        throw new Error('INVALID_CONTENT: Received error page or minimal content');

      } catch (error) {
        context.previousAttempts = attempt;
        const errorMessage = error instanceof Error ? error.message : String(error);
        context.lastError = errorMessage;
        
        console.log(`❌ Attempt ${attempt + 1} failed: ${errorMessage}`);
        
        // Don't retry on certain errors
        if (this.isFatalError(error)) {
          throw error;
        }
        
        // If this was our last attempt, try alternate routes or throw
        if (attempt === config.maxRetries) {
          // Try alternate routes if enabled
          if (options.allowAlternateRoutes !== false) {
            console.log(`🛣️ Attempting alternate routes for ${url}...`);
            try {
              const alternateResult = await this.attemptAlternateRoutes(url, config, {
                cookieHeader: options.cookieHeader,
                reason: options.reason
              });
              
              if (alternateResult) {
                return alternateResult;
              }
            } catch (altError) {
              console.log(`🛣️ All alternate routes exhausted`);
            }
          }
          
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
  async quickAccessibilityCheck(
    url: string,
    options: { bypassHead?: boolean; domainHint?: string } = {}
  ): Promise<{
    accessible: boolean;
    responseTime: number;
    statusCode?: number;
    error?: string;
    diagnosis: AccessibilityDiagnosis;
    blockingServer?: string;
  }> {
    const startTime = Date.now();
    const domainKey = this.getDomainKeyFromUrl(url);
    const existingHint = this.dynamicWarmupDomains.get(domainKey);
    let blockingServer: string | undefined = existingHint?.blockProfile?.server;
    let diagnosis: AccessibilityDiagnosis = 'unknown';

    const performRequest = async (
      method: 'HEAD' | 'GET',
      timeoutMs: number,
      extraHeaders: Record<string, string> = {}
    ) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers = {
          ...this.getEnhancedHeaders({
            url,
            isGovernmentSite: this.isGovernmentSite(url),
            previousAttempts: 0
          }, this.userAgents[0]),
          ...extraHeaders
        };

        const response = await fetch(url, {
          method,
          signal: controller.signal,
          headers,
          redirect: 'follow'
        });

        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const isLikelyAccessible = (status: number) => status >= 200 && status < 400;
    const shouldFallbackToGet = (status: number) => [401, 403, 405, 406, 429].includes(status);
    let lastWarmupFailure: { status?: number; error?: string } | null = null;

    const attemptWarmupRetry = async (
      trigger: string
    ): Promise<{
      accessible: true;
      responseTime: number;
      statusCode?: number;
      diagnosis: AccessibilityDiagnosis;
      blockingServer?: string;
    } | null> => {
      try {
        const cookieHeader = await this.performCookieWarmup(url, `accessibility:${trigger}`);

        const warmupHeaders: Record<string, string> = {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Range': 'bytes=0-16383',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        };

        if (cookieHeader) {
          warmupHeaders['Cookie'] = cookieHeader;
        }

        const expandedResponse = await performRequest('GET', 8000, warmupHeaders);
        const expandedStatus = expandedResponse.status;
        const expandedServer = expandedResponse.headers.get('server') || blockingServer;
        if (expandedServer) {
          blockingServer = expandedServer;
        }

        if (expandedResponse.ok || isLikelyAccessible(expandedStatus)) {
          try {
            await expandedResponse.arrayBuffer();
          } catch (_) {
            // Ignore partial read errors
          }

          const warmupDiagnosis: AccessibilityDiagnosis = cookieHeader ? 'cookie-required' : 'partial-get-blocked';
          diagnosis = warmupDiagnosis;

          this.rememberWarmupHint(domainKey, {
            cookieHeader,
            reason: `accessibility:${trigger}:expanded`,
            statusCode: expandedStatus,
            blockProfile: {
              server: expandedServer,
              diagnosis: warmupDiagnosis,
              details: `Expanded warm-up GET returned ${expandedStatus}`
            }
          });

          return {
            accessible: true,
            responseTime: Date.now() - startTime,
            statusCode: expandedStatus,
            diagnosis: warmupDiagnosis,
            blockingServer
          } as const;
        }

        if (shouldFallbackToGet(expandedStatus)) {
          const fullHeaders = { ...warmupHeaders };
          delete fullHeaders['Range'];

          const fullResponse = await performRequest('GET', 10_000, fullHeaders);
          const fullStatus = fullResponse.status;
          const fullServer = fullResponse.headers.get('server') || blockingServer;
          if (fullServer) {
            blockingServer = fullServer;
          }

          if (fullResponse.ok || isLikelyAccessible(fullStatus)) {
            try {
              await fullResponse.arrayBuffer();
            } catch (_) {
              // Ignore partial read errors
            }

            const warmupDiagnosis: AccessibilityDiagnosis = cookieHeader ? 'cookie-required' : 'partial-get-blocked';
            diagnosis = warmupDiagnosis;

            this.rememberWarmupHint(domainKey, {
              cookieHeader,
              reason: `accessibility:${trigger}:full`,
              statusCode: fullStatus,
              blockProfile: {
                server: fullServer,
                diagnosis: warmupDiagnosis,
                details: `Full GET after warm-up returned ${fullStatus}`
              }
            });

            return {
              accessible: true,
              responseTime: Date.now() - startTime,
              statusCode: fullStatus,
              diagnosis: warmupDiagnosis,
              blockingServer
            } as const;
          }

          await fullResponse.arrayBuffer().catch(() => {});
          lastWarmupFailure = {
            status: fullStatus,
            error: `Full GET after warm-up failed with status ${fullStatus}`
          };

          this.rememberWarmupHint(domainKey, {
            cookieHeader,
            reason: `accessibility:${trigger}:full-fail`,
            statusCode: fullStatus,
            blockProfile: {
              server: fullServer,
              diagnosis: 'full-block',
              details: `Full GET after warm-up failed with status ${fullStatus}`
            }
          });

          return null;
        }

        await expandedResponse.arrayBuffer().catch(() => {});
        lastWarmupFailure = {
          status: expandedStatus,
          error: `Expanded GET after warm-up failed with status ${expandedStatus}`
        };

        this.rememberWarmupHint(domainKey, {
          cookieHeader,
          reason: `accessibility:${trigger}:expanded-fail`,
          statusCode: expandedStatus,
          blockProfile: {
            server: expandedServer,
            diagnosis: 'full-block',
            details: `Expanded GET after warm-up failed with status ${expandedStatus}`
          }
        });

        return null;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastWarmupFailure = {
          error: `Warm-up retry error: ${errorMessage}`
        };

        this.rememberWarmupHint(domainKey, {
          reason: `accessibility:${trigger}:error`,
          blockProfile: {
            server: blockingServer,
            diagnosis: 'full-block',
            details: `Warm-up retry error: ${errorMessage}`
          }
        });

        return null;
      }
    };
    
    const { bypassHead = false, domainHint } = options;

    try {
      if (bypassHead) {
        console.log(
          `🛡️ Quick accessibility: bypassing HEAD for ${domainKey}` +
          (domainHint ? ` (hint: ${domainHint})` : '')
        );

        try {
          const bypassResponse = await performRequest('GET', 6000, {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Range': 'bytes=0-2047'
          });

          const bypassStatus = bypassResponse.status;
          const bypassServer = bypassResponse.headers.get('server') || blockingServer;
          if (bypassServer) {
            blockingServer = bypassServer;
          }

          if (bypassResponse.ok || isLikelyAccessible(bypassStatus)) {
            try {
              await bypassResponse.arrayBuffer();
            } catch (_) {
              // Ignore partial read errors
            }

            diagnosis = bypassStatus === 206 ? 'partial-get-blocked' : 'ok';

            this.rememberWarmupHint(domainKey, {
              reason: 'accessibility:bypass-head-success',
              statusCode: bypassStatus,
              blockProfile: {
                server: blockingServer,
                diagnosis,
                details: `Bypassed HEAD with direct GET (${bypassStatus})`
              }
            });

            return {
              accessible: true,
              responseTime: Date.now() - startTime,
              statusCode: bypassStatus,
              diagnosis,
              blockingServer
            };
          }

          if (shouldFallbackToGet(bypassStatus)) {
            const warmupRetry = await attemptWarmupRetry(`bypass-head-get-${bypassStatus}`);
            if (warmupRetry) {
              return warmupRetry;
            }
          }

          await bypassResponse.arrayBuffer().catch(() => {});
          lastWarmupFailure = {
            status: bypassStatus,
            error: `Direct GET bypass failed with status ${bypassStatus}`
          };
        } catch (bypassError) {
          const message = bypassError instanceof Error ? bypassError.message : String(bypassError);
          lastWarmupFailure = {
            error: `Bypass GET error: ${message}`
          };
        }
      }

      // First attempt a lightweight HEAD request
      const headResponse = await performRequest('HEAD', 5000);
      const headStatus = headResponse.status;
      const headServer = headResponse.headers.get('server') || blockingServer;
      if (headServer) {
        blockingServer = headServer;
      }

      if (headResponse.ok || isLikelyAccessible(headStatus)) {
        diagnosis = 'ok';
        return {
          accessible: true,
          responseTime: Date.now() - startTime,
          statusCode: headStatus,
          diagnosis,
          blockingServer
        };
      }

      if (shouldFallbackToGet(headStatus)) {
        diagnosis = 'head-blocked';
        this.rememberWarmupHint(domainKey, {
          reason: `accessibility:head-${headStatus}`,
          statusCode: headStatus,
          blockProfile: {
            server: headServer,
            diagnosis,
            details: `HEAD request returned ${headStatus}`
          }
        });

        console.log(`🔄 HEAD blocked (${headStatus}) for ${url}, trying GET fallback...`);
        try {
          // Some sites block HEAD requests – retry with a small GET request
          const getResponse = await performRequest('GET', 6000, {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Range': 'bytes=0-1023'
          });

          const getStatus = getResponse.status;
          const getServer = getResponse.headers.get('server') || blockingServer;
          if (getServer) {
            blockingServer = getServer;
          }

          if (getResponse.ok || isLikelyAccessible(getStatus)) {
            // Consume a tiny chunk to ensure connection closes cleanly
            try {
              await getResponse.arrayBuffer();
            } catch (_) {
              // Ignore partial read errors – we only care about status
            }

            console.log(`✅ GET fallback succeeded for ${url} (status ${getStatus})`);
            diagnosis = 'head-blocked';

            this.rememberWarmupHint(domainKey, {
              reason: `accessibility:head-${headStatus}:get-success`,
              statusCode: getStatus,
              blockProfile: {
                server: getServer,
                diagnosis,
                details: `Initial GET fallback succeeded with status ${getStatus}`
              }
            });

            return {
              accessible: true,
              responseTime: Date.now() - startTime,
              statusCode: getStatus,
              diagnosis,
              blockingServer
            };
          }

          const warmupRetry = await attemptWarmupRetry(`head-${headStatus}-get-${getStatus}`);
          if (warmupRetry) {
            return warmupRetry;
          }

          diagnosis = 'full-block';
          return {
            accessible: false,
            responseTime: Date.now() - startTime,
            statusCode: getStatus,
            error: `GET fallback failed with status ${getStatus}`,
            diagnosis,
            blockingServer
          };
        } catch (fallbackError) {
          const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

          const warmupRetry = await attemptWarmupRetry(`head-${headStatus}-get-error`);
          if (warmupRetry) {
            return warmupRetry;
          }

          diagnosis = 'full-block';
          return {
            accessible: false,
            responseTime: Date.now() - startTime,
            statusCode: headStatus,
            error: `HEAD blocked (${headStatus}), GET fallback error: ${errorMessage}`,
            diagnosis,
            blockingServer
          };
        }
      }

      diagnosis = 'full-block';
      return {
        accessible: false,
        responseTime: Date.now() - startTime,
        statusCode: headStatus,
        error: lastWarmupFailure?.error
          ? `HEAD request blocked with status ${headStatus}. ${lastWarmupFailure.error}`
          : `HEAD request blocked with status ${headStatus}`,
        diagnosis,
        blockingServer
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const lowered = errorMessage.toLowerCase();
      if (
        lowered.includes('proxy') ||
        lowered.includes('tunnel') ||
        lowered.includes('connect') ||
        lowered.includes('enoent') ||
        lowered.includes('enotfound')
      ) {
        diagnosis = 'network-block';
      } else {
        diagnosis = 'full-block';
      }

      this.rememberWarmupHint(domainKey, {
        reason: `accessibility:error`,
        blockProfile: {
          server: blockingServer,
          diagnosis,
          details: errorMessage
        }
      });

      return {
        accessible: false,
        responseTime: Date.now() - startTime,
        error: errorMessage,
        diagnosis,
        blockingServer
      };
    }
  }

  // Enhanced multi-tenant domain-specific strategy (no hardcoded domains)
  async fetchWithDomainSpecificStrategy(url: string): Promise<string> {
    const domain = new URL(url).hostname.toLowerCase();
    const domainKey = this.getDomainKeyFromHost(domain);
    const dynamicHint = this.dynamicWarmupDomains.get(domainKey);

    // Use dynamic strategy determination
    const warmupStrategy = this.determineWarmupStrategy(dynamicHint);
    const cautiousStrategy = this.determineCautiousStrategy(dynamicHint);

    if (dynamicHint?.blockProfile?.diagnosis) {
      console.log(
        `🛡️ Domain ${domain} diagnosed as ${dynamicHint.blockProfile.diagnosis}` +
        (dynamicHint.blockProfile.server ? ` (server: ${dynamicHint.blockProfile.server})` : '') +
        ` | Strategy: warmup=${warmupStrategy.needsWarmup} (${warmupStrategy.reason}), ` +
        `cautious=${cautiousStrategy.useCautious} (${cautiousStrategy.reason})`
      );
    }

    // Dynamic warmup decision based on learned behavior
    if (warmupStrategy.needsWarmup) {
      console.log(
        `🎯 Dynamic warmup triggered for ${domain} ` +
        `(confidence: ${warmupStrategy.confidenceLevel}, reason: ${warmupStrategy.reason})`
      );

      const warmupCookie = await this.performCookieWarmup(url, warmupStrategy.reason, {
        force: warmupStrategy.confidenceLevel === 'low'
      });

      const config: RetryConfig = {
        maxRetries: cautiousStrategy.maxRetries,
        baseDelay: cautiousStrategy.baseDelay,
        maxDelay: 20000,
        exponentialBackoff: true
      };

      const cookieHeader = warmupCookie ?? dynamicHint?.cookieHeader;

      return this.fetchWithEnhancedRetryHastings(url, config, {
        cookieHeader,
        reason: warmupStrategy.reason
      });
    }

    // Use cautious approach if history suggests it
    if (cautiousStrategy.useCautious) {
      console.log(
        `⚠️ Cautious strategy for ${domain} ` +
        `(reason: ${cautiousStrategy.reason}, delay: ${cautiousStrategy.baseDelay}ms)`
      );

      const config: RetryConfig = {
        maxRetries: cautiousStrategy.maxRetries,
        baseDelay: cautiousStrategy.baseDelay,
        maxDelay: 15000,
        exponentialBackoff: true
      };

      return this.fetchWithEnhancedRetry(url, config);
    }

    // Standard approach for domains with no issues or no history
    console.log(`✅ Standard strategy for ${domain} (no issues recorded)`);
    return this.fetchWithEnhancedRetry(url);
  }

  // Specialized variant for Hastings problem sources with expanded Range
  private async fetchWithEnhancedRetryHastings(
    url: string,
    config: RetryConfig,
    options: { cookieHeader?: string; reason?: string } = {}
  ): Promise<string> {
    const context: ScrapingContext = {
      url,
      isGovernmentSite: this.isGovernmentSite(url),
      previousAttempts: 0
    };

    const domainKey = this.getDomainKeyFromUrl(url);

    if (options.cookieHeader) {
      this.rememberWarmupHint(domainKey, {
        cookieHeader: options.cookieHeader,
        reason: options.reason ?? 'warmup-strategy:init'
      });
    }

    console.log(`🌐 Fetching ${url} (Hastings mode, attempt 1/${config.maxRetries + 1})`);

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const userAgent = this.getCurrentUserAgent(attempt);
        const headers = {
          ...this.getEnhancedHeaders(context, userAgent),
          ...(options.cookieHeader ? { 'Cookie': options.cookieHeader } : {})
        };

        // Intelligent delay before request (except first attempt)
        if (attempt > 0) {
          const delay = this.calculateDelay(context, config);
          console.log(`⏳ Intelligent delay: ${Math.round(delay)}ms (Hastings mode, requests: ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const controller = new AbortController();
        const timeout = 15000; // 15 second timeout for these problem sources
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        console.log(`🌐 Fetching ${url} (Hastings mode, attempt ${attempt + 1}/${config.maxRetries + 1})`);

        const response = await fetch(url, {
          signal: controller.signal,
          headers,
          redirect: 'follow'
        });

        clearTimeout(timeoutId);

        const rememberSuccess = (statusCode: number) => {
          this.rememberWarmupHint(domainKey, {
            cookieHeader: options.cookieHeader,
            reason: options.reason ?? 'warmup-strategy:success',
            statusCode
          });
        };

        // Helper function for GET fallback with EXPANDED Range header for anti-bot pages
        const tryGetFallbackExpanded = async (reason: string): Promise<string | null> => {
          console.log(`🔄 GET_RANGE_FALLBACK_START: ${reason}`);

          try {
            const rangeHeaders = {
              ...headers,
              'Range': 'bytes=0-16384', // Get first 16KB (expanded for longer anti-bot pages)
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            };

            const rangeController = new AbortController();
            const rangeTimeoutId = setTimeout(() => rangeController.abort(), 8000); // Longer timeout

            const rangeResponse = await fetch(url, {
              method: 'GET',
              signal: rangeController.signal,
              headers: rangeHeaders,
              redirect: 'follow'
            });

            clearTimeout(rangeTimeoutId);

            if (rangeResponse.ok || rangeResponse.status === 206) {
              const content = await rangeResponse.text();

              console.log(`🔄 GET_RANGE_FALLBACK_OK (status ${rangeResponse.status}, bytes ${content.length})`);

              if (this.isValidContent(content)) {
                console.log(`✅ GET fallback succeeded for ${url} (${content.length} chars)`);
                rememberSuccess(rangeResponse.status);
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

        // Phase 1: Check for explicit blocking status codes
        if ([401, 403, 405, 406, 429].includes(response.status)) {
          const fallbackContent = await tryGetFallbackExpanded(`${response.status} detected`);
          if (fallbackContent) return fallbackContent;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Phase 2: Fetch content and validate
        const content = await response.text();

        if (this.isValidContent(content)) {
          console.log(`✅ Successfully fetched content from ${url} (${content.length} chars, Hastings mode, attempt ${attempt + 1})`);
          rememberSuccess(response.status);
          return content;
        }

        // Phase 3: Got 200 OK but content is invalid - try GET fallback
        console.log(`⚠️ Got 200 OK but invalid content (${content.length} chars)`);
        const fallbackContent = await tryGetFallbackExpanded('Invalid content despite 200 OK');
        if (fallbackContent) return fallbackContent;

        // All fallbacks failed
        throw new Error('INVALID_CONTENT: Received error page or minimal content');

      } catch (error) {
        context.previousAttempts = attempt;
        const errorMessage = error instanceof Error ? error.message : String(error);
        context.lastError = errorMessage;

        console.log(`❌ Attempt ${attempt + 1} failed (Hastings mode): ${errorMessage}`);

        // Don't retry on certain errors
        if (this.isFatalError(error)) {
          throw error;
        }

        // If this was our last attempt, throw the error
        if (attempt === config.maxRetries) {
          const lastErrorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`All retry attempts failed (Hastings mode). Last error: ${lastErrorMessage}`);
        }

        console.log(`⏳ Retrying in ${Math.round(this.calculateDelay(context, config))}ms...`);
      }
    }

    throw new Error('Unexpected end of retry loop (Hastings mode)');
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
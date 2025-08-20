# Comprehensive Web Scraping Specification

## Multi-Strategy Content Extraction System

**CORE PRINCIPLE**: Use multiple extraction methods in priority order to maximize content capture and ensure no articles are missed due to site-specific limitations.

## Scraping Strategy Hierarchy

### Strategy 1: RSS/Atom Feed Discovery & Enhancement
**Purpose**: Find structured article lists, then enhance with full content

1. **Feed Discovery Process**:
   ```
   - Try provided RSS/Atom URL directly
   - Auto-discover feeds from HTML <link> tags
   - Try common feed paths: /feed, /rss, /feed.xml, /rss.xml, /atom.xml
   - Check /robots.txt for sitemap references
   ```

2. **RSS Enhancement Protocol**:
   ```
   For each article URL from RSS:
   → Fetch individual article page
   → Extract full content using HTML parsing
   → Replace RSS summary with complete article
   → Validate content quality (200+ words minimum)
   ```

### Strategy 2: Direct HTML Article Discovery
**Purpose**: Find articles when RSS feeds are unavailable or incomplete

1. **Article Link Discovery**:
   ```javascript
   // Priority selectors for article links
   const articleLinkSelectors = [
     'a[href*="/article/"]', 'a[href*="/news/"]', 'a[href*="/story/"]',
     'a[href*="/post/"]', '.article-link', '.news-link',
     'article a[href]', '.post-title a', '.entry-title a',
     'h1 a', 'h2 a', 'h3 a' // Headlines with links
   ];
   ```

2. **Content Area Parsing**:
   ```javascript
   // Look for article listing areas
   const listingSelectors = [
     '.article-list', '.news-list', '.post-list',
     '.content-area', '.main-content', 'main',
     '[role="main"]', '#content', '.articles'
   ];
   ```

### Strategy 3: Sitemap-Based Discovery
**Purpose**: Systematic discovery via XML sitemaps

1. **Sitemap Location**:
   ```
   - Check /sitemap.xml, /sitemap_index.xml
   - Parse robots.txt for sitemap declarations
   - Look for news-specific sitemaps (/news-sitemap.xml)
   ```

2. **Sitemap Processing**:
   ```
   - Extract article URLs from sitemap
   - Filter by date (last 30 days for news)
   - Process URLs in batches with rate limiting
   ```

### Strategy 4: Intelligent Content Detection
**Purpose**: Extract articles from any HTML page structure

1. **Semantic HTML Detection**:
   ```javascript
   const semanticSelectors = [
     'article', '[role="article"]', '.hentry',
     '[itemtype*="Article"]', '[typeof="Article"]'
   ];
   ```

2. **Heuristic-Based Discovery**:
   ```
   - Detect repeated content patterns
   - Identify date-based URL structures
   - Find pagination patterns
   - Analyze heading hierarchies
   ```

## Content Extraction Protocol

### Title Extraction (Priority Order)
```javascript
const titleSelectors = [
  'meta[property="og:title"]',
  'meta[name="twitter:title"]', 
  'h1.entry-title', 'h1.post-title', 'h1.article-title',
  'h1[class*="title"]', 'h1[class*="headline"]',
  '.page-title h1', 'header h1',
  'h1', 'title' // Fallbacks
];
```

### Content Extraction (Priority Order)
```javascript
const contentSelectors = [
  // WordPress/CMS patterns
  '.entry-content', '.post-content', '.article-content',
  '.content-area .content', '.single-content',
  
  // News site patterns  
  '.article-body', '.story-body', '.news-content',
  '.main-content article', '.primary-content',
  
  // Generic semantic patterns
  'article .content', '[role="main"] .content',
  'main article', '.main .article',
  
  // Fallback patterns
  '.content', 'article', 'main', '[role="main"]'
];
```

### Metadata Extraction
```javascript
// Publication date discovery
const dateSelectors = [
  'meta[property="article:published_time"]',
  'meta[name="date"]', 'meta[name="pubdate"]',
  '.published', '.date', '.post-date',
  'time[datetime]', '.timestamp'
];

// Author discovery  
const authorSelectors = [
  'meta[name="author"]', 'meta[property="article:author"]',
  '.author', '.byline', '.writer', '.journalist',
  '[rel="author"]', '.post-author'
];
```

## Quality Validation Framework

### Content Quality Checks
```javascript
const qualityValidation = {
  minimumWordCount: 50,
  maximumWordCount: 10000,
  minimumParagraphs: 2,
  titleLength: { min: 10, max: 200 },
  
  // Content indicators
  requiredElements: ['title', 'content'],
  blacklistPhrases: [
    'subscribe', 'cookie policy', 'gdpr',
    'advertisement', 'sponsored content'
  ],
  
  // Structure validation
  paragraphMinLength: 20,
  htmlTagRatio: 0.3, // Max 30% HTML vs text
  duplicateContentThreshold: 0.8
};
```

### Extraction Success Metrics
```javascript
const successCriteria = {
  contentExtracted: true,
  wordCount: '>= 50',
  titlePresent: true,
  dateAvailable: true, // Preferred
  authorAvailable: false, // Optional
  
  // Quality scores
  contentQualityScore: '>= 70', // 0-100 scale
  extractionConfidence: '>= 80' // Parser confidence
};
```

## Error Handling & Fallback Logic

### Retry Mechanisms
```javascript
const retryConfig = {
  maxRetries: 3,
  retryDelays: [1000, 3000, 5000], // Progressive backoff
  retryConditions: [
    'timeout', 'network_error', 'http_5xx',
    'empty_content', 'parse_failure'
  ]
};
```

### Progressive Fallback Chain
```
1. RSS + Full Content Extraction
   ↓ (if fails)
2. Direct HTML Article Discovery  
   ↓ (if fails)
3. Sitemap-Based Extraction
   ↓ (if fails)
4. Heuristic Content Detection
   ↓ (if fails)
5. Basic Meta Description Fallback
```

### Failure Classification
```javascript
const failureTypes = {
  'no_content_found': 'Site structure not recognized',
  'content_too_short': 'Extracted text below minimum threshold',
  'parsing_error': 'HTML parsing failed',
  'network_timeout': 'Site unreachable or slow',
  'access_denied': 'Blocked by robots.txt or 403/401',
  'paywall_detected': 'Content behind subscription wall'
};
```

## Performance & Rate Limiting

### Request Management
```javascript
const performanceConfig = {
  concurrentRequests: 3, // Max simultaneous requests
  requestTimeout: 15000, // 15 second timeout
  delayBetweenRequests: 2000, // 2 second delay
  
  // Cache settings
  cacheExtractionRules: true,
  cacheDuration: '24h',
  
  // Resource limits
  maxPageSize: '5MB',
  maxProcessingTime: '30s'
};
```

### User Agent Rotation
```javascript
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (compatible; NewsBot/2.0; +http://example.com/bot)'
];
```

## Site-Specific Adaptations

### Common Patterns Database
```javascript
const sitePatterns = {
  'wordpress': {
    titleSelector: '.entry-title',
    contentSelector: '.entry-content',
    dateSelector: '.posted-on'
  },
  
  'medium': {
    titleSelector: 'h1[data-testid="storyTitle"]',
    contentSelector: 'article section',
    authorSelector: '[data-testid="authorName"]'
  },
  
  'substack': {
    titleSelector: '.post-title',
    contentSelector: '.available-content',
    dateSelector: '.pencraft'
  }
};
```

### Dynamic Content Handling
```javascript
const dynamicContentStrategies = {
  // For JavaScript-heavy sites
  enableJavaScript: false, // Start with static HTML
  waitForSelector: null,   // CSS selector to wait for
  scrollToLoad: false,     // Infinite scroll detection
  
  // Fallback to headless browser if needed
  headlessBrowserFallback: true,
  headlessBrowserTimeout: 30000
};
```

## Integration with Existing System

### Database Storage Protocol
```sql
-- Enhanced article storage
INSERT INTO articles (
  title, body, source_url, published_at, author,
  word_count, extraction_method, quality_score,
  extraction_confidence, content_hash,
  regional_relevance_score, processing_status
) VALUES (...);
```

### Monitoring & Analytics
```javascript
const scrapingMetrics = {
  trackExtractionSuccess: true,
  trackContentQuality: true,
  trackPerformanceMetrics: true,
  
  // Alert conditions
  successRateThreshold: 0.8,  // Alert if below 80%
  avgWordCountThreshold: 100,  // Alert if below 100 words
  timeoutRateThreshold: 0.2    // Alert if 20%+ timeouts
};
```

## Testing & Validation Protocol

### Pre-Deployment Testing
```bash
# Test suite requirements
1. Test with 20+ diverse news sites
2. Validate extraction success rate > 85%
3. Confirm average word count > 200
4. Verify no "word count: 1" articles
5. Test error handling and fallbacks
6. Performance test with rate limits
```

### Continuous Monitoring
```javascript
const monitoringChecks = {
  dailyQualityCheck: true,
  weeklyPerformanceReview: true,
  monthlyPatternAnalysis: true,
  
  // Auto-remediation
  retryFailedExtractions: true,
  updateExtractionPatterns: true,
  blacklistProblematicSites: false // Manual review required
};
```

---

## Critical Success Factors

✅ **Multiple extraction methods** - Never rely on single strategy  
✅ **Full content extraction** - RSS summaries are inadequate  
✅ **Quality validation** - Minimum 50+ word articles  
✅ **Robust error handling** - Graceful degradation  
✅ **Performance optimization** - Rate limiting and timeouts  
✅ **Continuous improvement** - Pattern learning and adaptation  

**REMEMBER: The goal is comprehensive, high-quality content extraction using any method necessary.**
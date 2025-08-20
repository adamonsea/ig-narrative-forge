# Article Content Extraction Specification

## CRITICAL REQUIREMENT: Full Article Extraction

**RSS feeds contain only summaries/excerpts, NOT full article content. We MUST extract the complete article from individual article pages.**

### Two-Stage Extraction Process

#### Stage 1: RSS Feed Processing
- Extract article URLs, titles, publication dates, and authors from RSS/Atom feeds
- RSS descriptions are ONLY placeholders - they contain maybe 1-2 sentences max
- **Never use RSS descriptions as final article content**

#### Stage 2: Full Content Extraction (MANDATORY)
For each article URL from Stage 1:
1. **Fetch the individual article page HTML**
2. **Extract the complete article content** using comprehensive selectors
3. **Replace the RSS summary with full article text**
4. **Ensure word counts are realistic** (300+ words for news articles)

### Content Extraction Selectors (Priority Order)

```javascript
// Title extraction (use first match)
const titleSelectors = [
  'h1.entry-title', 'h1.post-title', 'h1.article-title', 
  'h1[class*="title"]', 'h1[class*="headline"]',
  'h1', '[property="og:title"]', 'title'
];

// Content extraction (use first substantial match)
const contentSelectors = [
  '.entry-content', '.post-content', '.article-content',
  '.main-content', '[class*="content"]', 'article',
  '.text-content', 'main', '[role="main"]'
];

// Extract ALL paragraphs from content area
const paragraphExtraction = /<p[^>]*>([\s\S]*?)<\/p>/gi;
```

### Quality Validation

**Minimum Requirements:**
- Article word count: 50+ words (anything less = extraction failed)
- Title present and meaningful (not generic/empty)
- Content coherent (not navigation/ads)

**If extraction fails:**
- Log the failure with URL and reason
- Fall back to RSS description as last resort
- Mark article for manual review/re-extraction

### Implementation Requirements

1. **Timeout handling**: 15 second max per article fetch
2. **Error handling**: Continue processing other articles if one fails  
3. **Rate limiting**: 2 second delay between article fetches
4. **User agent**: Use realistic browser user agent
5. **Encoding**: Handle UTF-8 properly
6. **Cleaning**: Remove HTML tags, decode entities, normalize whitespace

### Success Metrics

- Average word count: 200+ words per article
- Extraction success rate: 80%+ for well-formed news sites
- Content quality: Complete sentences, proper paragraphs
- No "word count: 1" articles (immediate red flag)

### Common Failure Modes to Avoid

❌ **Using RSS descriptions as final content**  
❌ **Storing articles with word count < 10**  
❌ **Ignoring extraction failures silently**  
❌ **Not following article URLs from RSS feeds**  
❌ **Accepting empty/minimal content without retry**

### Testing Validation

Before deploying any scraper changes:
1. Test with known news sites (BBC, Guardian, local news)
2. Verify articles have 100+ word counts
3. Check that titles are complete and accurate
4. Ensure source URLs open to the correct article
5. Confirm content is readable and complete

---

**REMEMBER: RSS = URLs and metadata only. Article pages = actual content.**
**If you're getting 1-word articles, you're doing it wrong.**
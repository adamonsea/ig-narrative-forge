import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Region-specific configuration for contextual relevance scoring
interface RegionConfig {
  name: string;
  keywords: string[];
  landmarks: string[];
  postcodes: string[];
  organizations: string[];
}

const REGION_CONFIGS: Record<string, RegionConfig> = {
  'Eastbourne': {
    name: 'Eastbourne',
    keywords: ['eastbourne', 'seaford', 'hailsham', 'polegate', 'willingdon', 'beachy head'],
    landmarks: ['beachy head', 'seven sisters', 'south downs', 'eastbourne pier', 'devonshire park', 'congress theatre', 'towner gallery', 'redoubt fortress', 'airbourne', 'eastbourne college'],
    postcodes: ['bn20', 'bn21', 'bn22', 'bn23', 'bn24', 'bn25', 'bn26', 'bn27'],
    organizations: ['eastbourne borough council', 'east sussex fire', 'sussex police', 'eastbourne district general', 'rnli eastbourne', 'eastbourne town fc']
  },
  'Brighton': {
    name: 'Brighton',
    keywords: ['brighton', 'hove', 'preston', 'kemp town', 'hanover', 'brunswick'],
    landmarks: ['brighton pier', 'royal pavilion', 'preston park', 'devil\'s dyke', 'brighton marina', 'lanes', 'north laine'],
    postcodes: ['bn1', 'bn2', 'bn3', 'bn41', 'bn42', 'bn50', 'bn51', 'bn52'],
    organizations: ['brighton & hove city council', 'sussex police', 'royal sussex county hospital', 'amex stadium', 'brighton fc']
  }
};

interface ScrapeResult {
  success: boolean;
  articlesFound: number;
  articlesScraped: number;
  errors: string[];
  method: 'rss' | 'simple_html' | 'fallback';
  articles: any[]; // CRITICAL FIX: Added missing articles property
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region } = await req.json();
    console.log(`🚀 Starting hybrid scrape for: ${feedUrl}`);
    
    // Get source information to determine region and type
    const { data: sourceInfo } = await supabase
      .from('content_sources')
      .select('region, source_type, source_name, canonical_domain')
      .eq('id', sourceId)
      .single();

    const targetRegion = region || sourceInfo?.region || 'Eastbourne';
    console.log(`📍 Target region: ${targetRegion}, Source type: ${sourceInfo?.source_type}`);
    
    const startTime = Date.now();
    let result: ScrapeResult;

    // Strategy 1: Try RSS/Atom first (most reliable)
    result = await tryRSSParsing(feedUrl);
    
    // Strategy 2: If RSS fails, try simple HTML parsing
    if (!result.success) {
      console.log('📄 RSS failed, trying HTML parsing...');
      result = await trySimpleHTMLParsing(feedUrl);
    }
    
    // Strategy 3: Fallback to basic content extraction
    if (!result.success) {
      console.log('🔧 HTML parsing failed, trying fallback method...');
      result = await tryFallbackMethod(feedUrl);
    }

    if (!result.success) {
      throw new Error('All scraping methods failed - no articles found');
    }

    console.log(`✅ Found ${result.articlesFound} articles using ${result.method}`);

    // Filter and store articles with enhanced regional context
    const storeResults = await storeArticles(result.articles, sourceId, targetRegion, sourceInfo, supabase);
    
    // Update source metrics
    if (sourceId) {
      const responseTime = Date.now() - startTime;
      await updateSourceMetrics(sourceId, result.success, result.method, responseTime, supabase);
    }

    const finalResult = {
      ...result,
      articlesScraped: storeResults.storedCount,
      duplicatesSkipped: storeResults.duplicateCount,
      filteredForRelevance: storeResults.filteredCount,
      duration_ms: Date.now() - startTime
    };

    console.log(`🎉 Hybrid scrape completed:`, finalResult);
    
    return new Response(JSON.stringify(finalResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Hybrid scraper error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'none'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Strategy 1: RSS/Atom parsing (most reliable)
async function tryRSSParsing(feedUrl: string): Promise<ScrapeResult> {
  try {
    console.log('🔍 Attempting RSS parsing...');
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'LocalNewsBot/2.0 (News Aggregator)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
      },
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    
    // Check if it's actually XML/RSS content
    if (!content.includes('<rss') && !content.includes('<feed') && !content.includes('<item') && !content.includes('<entry')) {
      throw new Error('Not RSS/XML content');
    }

    const articles = parseRSSContent(content);
    
    if (articles.length === 0) {
      throw new Error('No articles found in RSS feed');
    }

    return {
      success: true,
      articlesFound: articles.length,
      articlesScraped: 0, // Will be updated later
      errors: [],
      method: 'rss',
      articles
    };

  } catch (error) {
    console.log(`❌ RSS parsing failed: ${error.message}`);
    return {
      success: false,
      articlesFound: 0,
      articlesScraped: 0,
      errors: [`RSS parsing failed: ${error.message}`],
      method: 'rss',
      articles: []
    };
  }
}

// Strategy 2: Simple HTML parsing
async function trySimpleHTMLParsing(feedUrl: string): Promise<ScrapeResult> {
  try {
    console.log('🌐 Attempting HTML parsing...');
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 20000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const articles = extractArticlesFromHTML(html, feedUrl);
    
    if (articles.length === 0) {
      throw new Error('No articles found in HTML content');
    }

    return {
      success: true,
      articlesFound: articles.length,
      articlesScraped: 0,
      errors: [],
      method: 'simple_html',
      articles
    };

  } catch (error) {
    console.log(`❌ HTML parsing failed: ${error.message}`);
    return {
      success: false,
      articlesFound: 0,
      articlesScraped: 0,
      errors: [`HTML parsing failed: ${error.message}`],
      method: 'simple_html',
      articles: []
    };
  }
}

// Strategy 3: Fallback method for difficult sites
async function tryFallbackMethod(feedUrl: string): Promise<ScrapeResult> {
  try {
    console.log('🔧 Attempting fallback method...');
    
    // Try to find RSS/XML links in the main page
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LocalNewsBot/2.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Look for RSS/Atom feed links
    const feedLinks = extractFeedLinks(html, feedUrl);
    
    for (const feedLink of feedLinks) {
      console.log(`🔍 Trying discovered feed: ${feedLink}`);
      const rssResult = await tryRSSParsing(feedLink);
      if (rssResult.success) {
        return { ...rssResult, method: 'fallback' };
      }
    }
    
    // Last resort: try basic content extraction
    const articles = extractBasicContent(html, feedUrl);
    
    if (articles.length === 0) {
      throw new Error('No content could be extracted');
    }

    return {
      success: true,
      articlesFound: articles.length,
      articlesScraped: 0,
      errors: [],
      method: 'fallback',
      articles
    };

  } catch (error) {
    console.log(`❌ Fallback method failed: ${error.message}`);
    return {
      success: false,
      articlesFound: 0,
      articlesScraped: 0,
      errors: [`Fallback method failed: ${error.message}`],
      method: 'fallback',
      articles: []
    };
  }
}

// Parse RSS/Atom content and enrich with full article content
async function parseRSSContent(content: string): Promise<any[]> {
  const articles: any[] = [];
  
  // Handle both RSS <item> and Atom <entry> tags
  const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;
  
  while ((match = itemRegex.exec(content)) !== null) {
    const itemContent = match[1];
    
    const title = extractXMLContent(itemContent, 'title');
    const link = extractXMLContent(itemContent, 'link') || extractLinkHref(itemContent);
    const description = extractXMLContent(itemContent, 'description') || 
                      extractXMLContent(itemContent, 'summary') ||
                      extractXMLContent(itemContent, 'content');
    const pubDate = extractXMLContent(itemContent, 'pubDate') || 
                   extractXMLContent(itemContent, 'published') ||
                   extractXMLContent(itemContent, 'updated');
    const author = extractXMLContent(itemContent, 'author') || 
                  extractXMLContent(itemContent, 'dc:creator') ||
                  extractAuthorName(itemContent);
    
    if (title && link) {
      // CRITICAL FIX: Always try to fetch full content from individual article URLs
      let fullContent = '';
      let enrichedTitle = cleanHTML(title).trim();
      let wordCount = 0;
      
      try {
        console.log(`📄 Fetching full content from: ${link}`);
        const articleResponse = await fetch(link, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache'
          },
          signal: AbortSignal.timeout(20000)
        });
        
        if (articleResponse.ok) {
          const articleHTML = await articleResponse.text();
          const extracted = extractFullArticleContent(articleHTML, link);
          
          // Use better title if extracted
          if (extracted.title && extracted.title.length > enrichedTitle.length) {
            enrichedTitle = extracted.title;
          }
          
          // CRITICAL: Ensure we have substantial content, not just RSS summaries
          if (extracted.content && extracted.content.length > 200) {
            fullContent = extracted.content;
            wordCount = extracted.content.split(/\s+/).length;
            console.log(`✅ Extracted ${fullContent.length} chars (${wordCount} words) from ${link}`);
          } else if (extracted.content && extracted.content.length > 50) {
            // Accept shorter content but flag it
            fullContent = extracted.content;
            wordCount = extracted.content.split(/\s+/).length;
            console.log(`⚠️ Short content extracted: ${wordCount} words from ${link}`);
          } else {
            // Last resort: use RSS description if available
            fullContent = description ? cleanHTML(description).trim() : '';
            wordCount = fullContent ? fullContent.split(/\s+/).length : 0;
            console.log(`❌ Minimal content, using RSS description: ${wordCount} words`);
          }
        } else {
          console.log(`❌ Failed to fetch article: HTTP ${articleResponse.status}`);
          fullContent = description ? cleanHTML(description).trim() : '';
          wordCount = fullContent ? fullContent.split(/\s+/).length : 0;
        }
      } catch (error) {
        console.log(`❌ Error fetching article content: ${error.message}`);
        fullContent = description ? cleanHTML(description).trim() : '';
        wordCount = fullContent ? fullContent.split(/\s+/).length : 0;
      }
      
      // QUALITY CHECK: Enforce 50+ word minimum as per COMPREHENSIVE_SCRAPING_SPEC
      if (wordCount < 50) {
        console.log(`⚠️ Skipping article with only ${wordCount} words (below 50-word minimum): ${enrichedTitle}`);
        continue;
      }
      
      articles.push({
        title: enrichedTitle,
        body: fullContent,
        source_url: link.trim(),
        published_at: parseDate(pubDate) || new Date().toISOString(),
        author: author ? cleanHTML(author).trim() : null,
        summary: fullContent ? fullContent.substring(0, 200) + '...' : null,
        word_count: wordCount,
        content_quality_score: Math.min(wordCount * 2, 100), // Score based on word count
        processing_status: 'extracted'
      });
    }
    
    if (articles.length >= 10) break; // Limit to prevent memory issues
  }
  
  return articles;
}

// PHASE 2: Enhanced full article content extraction with progressive fallback chains
function extractFullArticleContent(html: string, url: string): { title: string; content: string } {
  let title = '';
  let content = '';
  
  console.log(`🔍 Starting progressive content extraction for: ${url}`);
  
  // PRIORITY 1: Enhanced title extraction with multiple selectors
  const titlePatterns = [
    // News-specific title patterns (high priority)
    /<h1[^>]*class="[^"]*(?:headline|entry-title|post-title|article-title|story-title)[^"]*"[^>]*>([^<]*)<\/h1>/i,
    /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]*)<\/h1>/i,
    /<title[^>]*class="[^"]*(?:article|story|post)[^"]*"[^>]*>([^<]*)<\/title>/i,
    // Schema.org structured data
    /<h1[^>]*itemprop="headline"[^>]*>([^<]*)<\/h1>/i,
    /<[^>]*itemprop="name"[^>]*>([^<]*)<\/[^>]*>/i,
    // Open Graph and meta tags
    /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i,
    /<meta[^>]*name="twitter:title"[^>]*content="([^"]*)"[^>]*>/i,
    // JSON-LD structured data
    /"headline"\s*:\s*"([^"]*)"[^}]*}/i,
    // Generic patterns (lower priority)
    /<h1[^>]*>([^<]*)<\/h1>/i,
    /<title>([^<]*)<\/title>/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].trim() && match[1].length > 10) {
      title = cleanHTML(match[1]).trim();
      console.log(`✅ Title extracted using pattern: ${title.substring(0, 50)}...`);
      break;
    }
  }
  
  // PRIORITY 2: Progressive content extraction with comprehensive selectors
  const contentExtractionStrategies = [
    // Strategy 1: News-specific content selectors (highest priority)
    {
      name: 'news-specific',
      patterns: [
        /<article[^>]*class="[^"]*(?:story|article|post|entry)[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*(?:story-body|article-body|post-body|entry-content|main-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<section[^>]*class="[^"]*(?:article-content|story-content|post-content)[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
        /<div[^>]*id="[^"]*(?:story|article|post|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ]
    },
    // Strategy 2: Schema.org and structured data
    {
      name: 'structured-data',
      patterns: [
        /<[^>]*itemprop="articleBody"[^>]*>([\s\S]*?)<\/[^>]*>/i,
        /<[^>]*class="[^"]*articleBody[^"]*"[^>]*>([\s\S]*?)<\/[^>]*>/i
      ]
    },
    // Strategy 3: Common CMS patterns
    {
      name: 'cms-patterns',
      patterns: [
        /<div[^>]*class="[^"]*(?:content|text|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/main>/i,
        /<section[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/section>/i
      ]
    },
    // Strategy 4: Generic semantic HTML
    {
      name: 'semantic-html',
      patterns: [
        /<main[^>]*>([\s\S]*?)<\/main>/i,
        /<article[^>]*>([\s\S]*?)<\/article>/i
      ]
    }
  ];
  
  // Try each strategy in order
  for (const strategy of contentExtractionStrategies) {
    console.log(`🔄 Trying ${strategy.name} extraction strategy...`);
    
    for (const pattern of strategy.patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const rawContent = match[1];
        
        // Extract paragraphs with quality filtering
        const extractedContent = extractParagraphsWithQuality(rawContent);
        
        if (extractedContent && extractedContent.length >= 200) { // Minimum 200 chars for strategy success
          content = extractedContent;
          console.log(`✅ Content extracted using ${strategy.name}: ${content.length} chars`);
          break;
        }
      }
    }
    
    if (content) break; // Stop if we found good content
  }
  
  // FALLBACK 1: Extract all paragraphs from entire HTML if strategies failed
  if (!content || content.split(/\s+/).length < 50) {
    console.log(`🔄 Applying fallback: extracting all paragraphs...`);
    const fallbackContent = extractAllParagraphsWithFiltering(html);
    
    if (fallbackContent && fallbackContent.split(/\s+/).length >= 50) {
      content = fallbackContent;
      console.log(`✅ Fallback content extracted: ${content.length} chars`);
    }
  }
  
  // FALLBACK 2: Try readability-style extraction
  if (!content || content.split(/\s+/).length < 50) {
    console.log(`🔄 Applying final fallback: readability extraction...`);
    const readabilityContent = extractReadabilityContent(html);
    
    if (readabilityContent && readabilityContent.split(/\s+/).length >= 50) {
      content = readabilityContent;
      console.log(`✅ Readability content extracted: ${content.length} chars`);
    }
  }
  
  // QUALITY VALIDATION: Ensure content meets minimum standards
  const wordCount = content ? content.split(/\s+/).length : 0;
  console.log(`📊 Final content quality: ${wordCount} words, ${content.length} chars`);
  
  return { title, content };
}

// Extract paragraphs with quality filtering
function extractParagraphsWithQuality(rawContent: string): string {
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  
  while ((pMatch = pRegex.exec(rawContent)) !== null) {
    const paragraph = cleanHTML(pMatch[1]).trim();
    
    // Quality filters for paragraphs
    if (paragraph.length > 30 && 
        !isNavigationText(paragraph) && 
        !isAdvertisingText(paragraph) &&
        !isSocialMediaText(paragraph)) {
      paragraphs.push(paragraph);
    }
  }
  
  return paragraphs.join('\n\n');
}

// Extract all paragraphs with comprehensive filtering
function extractAllParagraphsWithFiltering(html: string): string {
  const allParagraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  
  while ((pMatch = pRegex.exec(html)) !== null) {
    const paragraph = cleanHTML(pMatch[1]).trim();
    
    // Enhanced quality filters
    if (paragraph.length > 40 && 
        !isNavigationText(paragraph) && 
        !isAdvertisingText(paragraph) &&
        !isSocialMediaText(paragraph) &&
        !isMetadataText(paragraph) &&
        hasSubstantialContent(paragraph)) {
      allParagraphs.push(paragraph);
    }
  }
  
  // Return top paragraphs (limit to prevent memory issues)
  return allParagraphs.slice(0, 15).join('\n\n');
}

// Readability-style content extraction
function extractReadabilityContent(html: string): string {
  // Look for divs with substantial text content
  const contentDivs: Array<{content: string, score: number}> = [];
  const divRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
  let divMatch;
  
  while ((divMatch = divRegex.exec(html)) !== null) {
    const divContent = divMatch[1];
    const textContent = cleanHTML(divContent).trim();
    
    if (textContent.length > 100) {
      // Score based on content indicators
      let score = 0;
      
      // Positive indicators
      score += (textContent.match(/\./g) || []).length * 2; // Sentences
      score += (textContent.match(/[A-Z][a-z]+/g) || []).length; // Proper words
      score += textContent.length > 500 ? 10 : 0; // Length bonus
      
      // Negative indicators  
      score -= (textContent.match(/click|subscribe|follow|share/gi) || []).length * 5;
      score -= textContent.includes('cookie') ? 10 : 0;
      
      if (score > 10) {
        contentDivs.push({content: textContent, score});
      }
    }
  }
  
  // Return highest scoring content
  if (contentDivs.length > 0) {
    contentDivs.sort((a, b) => b.score - a.score);
    return contentDivs[0].content;
  }
  
  return '';
}

// Quality filter functions
function isNavigationText(text: string): boolean {
  const navPatterns = /^(home|about|contact|menu|search|login|register|subscribe|follow)$/i;
  const navKeywords = /(click here|read more|continue reading|view all|show more|load more)/i;
  return navPatterns.test(text.trim()) || navKeywords.test(text);
}

function isAdvertisingText(text: string): boolean {
  const adKeywords = /(advertisement|sponsored|promoted|buy now|shop now|limited time|special offer)/i;
  return adKeywords.test(text);
}

function isSocialMediaText(text: string): boolean {
  const socialKeywords = /(share on|follow us|like us|tweet|facebook|instagram|linkedin)/i;
  return socialKeywords.test(text);
}

function isMetadataText(text: string): boolean {
  const metaKeywords = /(published|updated|author|tags|categories|comments|copyright)/i;
  return text.length < 50 && metaKeywords.test(text);
}

function hasSubstantialContent(text: string): boolean {
  // Check for substantial sentences (not just fragments)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  return sentences.length >= 1 && text.split(/\s+/).length >= 15;
}

// PHASE 2: Enhanced HTML article extraction with quality validation
function extractArticlesFromHTML(html: string, baseUrl: string): any[] {
  const articles: any[] = [];
  
  console.log(`🌐 Starting HTML article extraction from: ${baseUrl}`);
  
  // Enhanced article selectors with broader coverage
  const articlePatterns = [
    // High-priority news patterns
    /<article[^>]*class="[^"]*(?:story|article|post|entry|news)[^"]*"[^>]*>([\s\S]*?)<\/article>/gi,
    /<div[^>]*class="[^"]*(?:story|article|post|entry|news)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Content sections
    /<section[^>]*class="[^"]*(?:article|story|content)[^"]*"[^>]*>([\s\S]*?)<\/section>/gi,
    // Generic patterns
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<div[^>]*class="[^"]*(?:content|text|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ];

  for (const pattern of articlePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && articles.length < 8) {
      const articleHTML = match[1];
      
      // Enhanced title extraction
      const title = extractFromHTML(articleHTML, [
        /<h[1-3][^>]*class="[^"]*(?:title|headline)[^"]*"[^>]*>(.*?)<\/h[1-3]>/i,
        /<h[1-6][^>]*>(.*?)<\/h[1-6]>/i,
        /<div[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/div>/i,
        /<title>(.*?)<\/title>/i
      ]);
      
      // Enhanced content extraction with paragraph focus
      let content = '';
      const contentSources = [
        extractFromHTML(articleHTML, [/<div[^>]*class="[^"]*(?:content|text|body)[^"]*"[^>]*>(.*?)<\/div>/is]),
        extractFromHTML(articleHTML, [/<p[^>]*>(.*?)<\/p>/gis])
      ];
      
      // Use the longest content source
      for (const source of contentSources) {
        if (source && source.length > content.length) {
          content = source;
        }
      }
      
      // Extract article URL if available
      const link = extractFromHTML(articleHTML, [
        /<a[^>]*href="([^"]*)"[^>]*>/i,
        /<link[^>]*href="([^"]*)"[^>]*>/i
      ]);

      if (title && content) {
        const cleanTitle = cleanHTML(title).trim();
        const cleanContent = cleanHTML(content).trim();
        const wordCount = cleanContent.split(/\s+/).length;
        
        // QUALITY VALIDATION: 50+ word minimum
        if (wordCount >= 50 && cleanTitle.length > 10) {
          console.log(`✅ HTML article extracted: "${cleanTitle}" (${wordCount} words)`);
          
          articles.push({
            title: cleanTitle,
            body: cleanContent,
            source_url: resolveURL(link || baseUrl, baseUrl),
            published_at: new Date().toISOString(),
            author: null,
            summary: cleanContent.substring(0, 200) + '...',
            word_count: wordCount,
            content_quality_score: Math.min(wordCount * 1.5, 100),
            processing_status: 'extracted'
          });
        } else {
          console.log(`⚠️ Skipping HTML article with insufficient content: ${wordCount} words`);
        }
      }
    }
  }
  
  console.log(`📊 HTML extraction completed: ${articles.length} articles found`);
  return articles;
}

// Extract RSS/Atom feed links from HTML
function extractFeedLinks(html: string, baseUrl: string): string[] {
  const feedLinks: string[] = [];
  
  // Look for link tags with RSS/Atom rel attributes
  const linkRegex = /<link[^>]*rel=["'](?:alternate|feed|rss|atom)["'][^>]*href=["']([^"']*?)["'][^>]*>/gi;
  let match;
  
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href) {
      feedLinks.push(resolveURL(href, baseUrl));
    }
  }
  
  // Common feed paths
  const domain = new URL(baseUrl).origin;
  const commonPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/feeds/all.atom.xml'];
  
  for (const path of commonPaths) {
    feedLinks.push(domain + path);
  }
  
  return [...new Set(feedLinks)]; // Remove duplicates
}

// PHASE 2: Enhanced basic content extraction with quality standards
function extractBasicContent(html: string, baseUrl: string): any[] {
  console.log(`🔧 Applying basic content extraction as last resort...`);
  
  // Enhanced title extraction
  const titlePatterns = [
    /<h1[^>]*>(.*?)<\/h1>/i,
    /<title>(.*?)<\/title>/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i,
    /<meta[^>]*name="title"[^>]*content="([^"]*)"[^>]*>/i
  ];
  
  let title = '';
  for (const pattern of titlePatterns) {
    const titleMatch = html.match(pattern);
    if (titleMatch && titleMatch[1] && titleMatch[1].trim()) {
      title = cleanHTML(titleMatch[1]).trim();
      break;
    }
  }
  
  // Enhanced description extraction
  const descriptionPatterns = [
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["'][^>]*>/i,
    /<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i,
    /<meta[^>]*name="twitter:description"[^>]*content="([^"]*)"[^>]*>/i
  ];
  
  let description = '';
  for (const pattern of descriptionPatterns) {
    const descMatch = html.match(pattern);
    if (descMatch && descMatch[1] && descMatch[1].trim()) {
      description = cleanHTML(descMatch[1]).trim();
      break;
    }
  }
  
  // Try to extract more content from page
  if (!description || description.split(/\s+/).length < 20) {
    console.log(`🔍 Description too short, trying paragraph extraction...`);
    
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    
    while ((pMatch = pRegex.exec(html)) !== null && paragraphs.length < 5) {
      const paragraph = cleanHTML(pMatch[1]).trim();
      if (paragraph.length > 50 && 
          !isNavigationText(paragraph) && 
          !isAdvertisingText(paragraph)) {
        paragraphs.push(paragraph);
      }
    }
    
    if (paragraphs.length > 0) {
      description = paragraphs.join(' ').substring(0, 800);
    }
  }
  
  // QUALITY VALIDATION: Ensure minimum standards
  const wordCount = description ? description.split(/\s+/).length : 0;
  
  if (title && description && title !== 'Untitled' && wordCount >= 50) {
    console.log(`✅ Basic content extracted: "${title}" (${wordCount} words)`);
    
    return [{
      title: title.trim(),
      body: description.trim(),
      source_url: baseUrl,
      published_at: new Date().toISOString(),
      author: null,
      summary: description.substring(0, 200) + '...',
      word_count: wordCount,
      content_quality_score: Math.min(wordCount, 75), // Lower quality score for basic extraction
      processing_status: 'extracted'
    }];
  } else {
    console.log(`❌ Basic extraction failed: insufficient content (${wordCount} words)`);
  }
  
  return [];
}

// Store articles in database with regional relevance scoring
async function storeArticles(articles: any[], sourceId: string, region: string, sourceInfo: any, supabase: any): Promise<{storedCount: number, duplicateCount: number, filteredCount: number}> {
  let storedCount = 0;
  let duplicateCount = 0;
  let filteredCount = 0;
  
  for (const article of articles) {
    try {
      // Check for duplicates by URL
      const { data: existing } = await supabase
        .from('articles')
        .select('id')
        .eq('source_url', article.source_url)
        .maybeSingle();

      if (existing) {
        duplicateCount++;
        console.log(`⏭️ Skipping duplicate: ${article.title}`);
        continue;
      }

      // Calculate regional relevance score using region-agnostic logic
      const relevanceScore = calculateRegionalRelevance(article, sourceInfo, region);
      console.log(`📊 Regional relevance score for "${article.title}": ${relevanceScore}`);

      // Insert new article with relevance score and metadata
      // Note: The database trigger will handle filtering based on source type thresholds
      const { error } = await supabase
        .from('articles')
        .insert({
          ...article,
          source_id: sourceId,
          region: region,
          processing_status: 'new',
          regional_relevance_score: relevanceScore,
          import_metadata: {
            scraping_method: 'hybrid',
            regional_relevance_score: relevanceScore,
            source_type: sourceInfo?.source_type || 'unknown',
            scraped_at: new Date().toISOString()
          }
        });

      if (error) {
        // Check if this was filtered by the relevance trigger
        if (error.message.includes('discarded') || error.message.includes('relevance')) {
          filteredCount++;
          console.log(`🔽 Filtered for low relevance: ${article.title} (score: ${relevanceScore})`);
        } else {
          console.error(`❌ Failed to store: ${article.title} - ${error.message}`);
        }
      } else {
        storedCount++;
        console.log(`💾 Stored: ${article.title} (relevance: ${relevanceScore})`);
      }

    } catch (error) {
      console.error(`❌ Error storing article: ${error.message}`);
    }
  }
  
  return { storedCount, duplicateCount, filteredCount };
}

// Calculate regional relevance score using region-agnostic configuration
function calculateRegionalRelevance(article: any, sourceInfo: any, targetRegion: string): number {
  let score = 0;
  const content = `${article.title} ${article.body} ${article.summary || ''}`.toLowerCase();
  
  // Base score from source type - higher scores for hyperlocal sources
  if (sourceInfo?.source_type === 'hyperlocal') {
    score += 70; // Hyperlocal sources get maximum boost
    console.log(`🏠 Hyperlocal source bonus: +70 points`);
  } else if (sourceInfo?.source_type === 'regional') {
    score += 40; // Regional sources get moderate boost
    console.log(`🗺️ Regional source bonus: +40 points`);
  } else if (sourceInfo?.source_type === 'national') {
    score += 0; // National sources need strong local content
    console.log(`🌍 National source: +0 points (content-dependent)`);
  }

  // Get region configuration
  const regionConfig = REGION_CONFIGS[targetRegion];
  if (!regionConfig) {
    console.log(`⚠️ No configuration found for region: ${targetRegion}`);
    return score;
  }

  // Primary keywords for the region
  for (const keyword of regionConfig.keywords) {
    if (content.includes(keyword.toLowerCase())) {
      score += 25;
      console.log(`📍 Regional keyword "${keyword}": +25 points`);
    }
  }

  // Local landmarks and venues
  for (const landmark of regionConfig.landmarks) {
    if (content.includes(landmark.toLowerCase())) {
      score += 20;
      console.log(`🏛️ Local landmark "${landmark}": +20 points`);
    }
  }

  // Local organizations and services
  for (const org of regionConfig.organizations) {
    if (content.includes(org.toLowerCase())) {
      score += 15;
      console.log(`🏢 Local organization "${org}": +15 points`);
    }
  }

  // Postcode matching
  for (const postcode of regionConfig.postcodes) {
    if (content.includes(postcode.toLowerCase())) {
      score += 15;
      console.log(`📮 Postcode match "${postcode}": +15 points`);
    }
  }

  console.log(`📊 Total relevance score: ${score} for "${article.title}"`);
  return Math.min(score, 100); // Cap at 100
}

// Update source metrics after scraping
async function updateSourceMetrics(sourceId: string, success: boolean, method: string, responseTime: number, supabase: any) {
  try {
    const { error } = await supabase
      .from('content_sources')
      .update({
        last_scraped_at: new Date().toISOString(),
        scraping_method: method,
        avg_response_time_ms: responseTime,
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceId);

    if (error) {
      console.error('❌ Failed to update source metrics:', error);
    } else {
      console.log(`📊 Updated source metrics: ${method}, ${responseTime}ms`);
    }
  } catch (error) {
    console.error('❌ Error updating source metrics:', error);
  }
}

// Utility functions
function extractXMLContent(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractLinkHref(content: string): string {
  const hrefMatch = content.match(/href=["']([^"']*?)["']/i);
  return hrefMatch ? hrefMatch[1] : '';
}

function extractAuthorName(content: string): string {
  const nameMatch = content.match(/<name[^>]*>([^<]*)<\/name>/i);
  return nameMatch ? nameMatch[1] : '';
}

function extractFromHTML(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return '';
}

function cleanHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .trim();
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function resolveURL(url: string, base: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}
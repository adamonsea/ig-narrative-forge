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
      
      // QUALITY CHECK: Skip articles with insufficient content
      if (wordCount < 20) {
        console.log(`⚠️ Skipping article with only ${wordCount} words: ${enrichedTitle}`);
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

// Extract full article content from individual article pages
function extractFullArticleContent(html: string, url: string): { title: string; content: string } {
  let title = '';
  let content = '';
  
  // Extract title from multiple sources
  const titlePatterns = [
    /<h1[^>]*class="[^"]*(?:title|headline|entry-title|post-title)[^"]*"[^>]*>([^<]*)<\/h1>/i,
    /<h1[^>]*>([^<]*)<\/h1>/i,
    /<title>([^<]*)<\/title>/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].trim()) {
      title = cleanHTML(match[1]).trim();
      break;
    }
  }
  
  // Extract main content from multiple sources
  const contentPatterns = [
    // Article content selectors
    /<article[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*(?:post-content|entry-content|article-content|main-content|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i
  ];
  
  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      let rawContent = match[1];
      
      // Extract paragraphs from the content area
      const paragraphs: string[] = [];
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch;
      
      while ((pMatch = pRegex.exec(rawContent)) !== null) {
        const paragraph = cleanHTML(pMatch[1]).trim();
        if (paragraph.length > 20) { // Only include substantial paragraphs
          paragraphs.push(paragraph);
        }
      }
      
      if (paragraphs.length > 0) {
        content = paragraphs.join('\n\n');
        break;
      }
    }
  }
  
  // Fallback: extract all paragraphs from the entire HTML
  if (!content) {
    const allParagraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    
    while ((pMatch = pRegex.exec(html)) !== null) {
      const paragraph = cleanHTML(pMatch[1]).trim();
      if (paragraph.length > 30 && !paragraph.includes('cookie') && !paragraph.includes('subscribe')) {
        allParagraphs.push(paragraph);
      }
    }
    
    if (allParagraphs.length > 0) {
      content = allParagraphs.slice(0, 10).join('\n\n'); // Limit to first 10 paragraphs
    }
  }
  
  return { title, content };
}

// Extract articles from HTML using common patterns
function extractArticlesFromHTML(html: string, baseUrl: string): any[] {
  const articles: any[] = [];
  
  // Common article selectors
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*news[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ];

  for (const pattern of articlePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && articles.length < 5) {
      const articleHTML = match[1];
      
      const title = extractFromHTML(articleHTML, [
        /<h[1-6][^>]*>(.*?)<\/h[1-6]>/i,
        /<title>(.*?)<\/title>/i,
        /<div[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/div>/i
      ]);
      
      const content = extractFromHTML(articleHTML, [
        /<p[^>]*>(.*?)<\/p>/gi,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/i
      ]);
      
      const link = extractFromHTML(articleHTML, [
        /<a[^>]*href="([^"]*)"[^>]*>/i
      ]);

      if (title && content) {
        articles.push({
          title: cleanHTML(title).trim(),
          body: cleanHTML(content).trim(),
          source_url: resolveURL(link || baseUrl, baseUrl),
          published_at: new Date().toISOString(),
          author: null,
          summary: cleanHTML(content).substring(0, 200) + '...'
        });
      }
    }
  }
  
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

// Extract basic content as last resort
function extractBasicContent(html: string, baseUrl: string): any[] {
  // Very basic content extraction
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? cleanHTML(titleMatch[1]) : 'Untitled';
  
  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["'][^>]*>/i);
  const description = descMatch ? cleanHTML(descMatch[1]) : '';
  
  if (title && description && title !== 'Untitled') {
    return [{
      title: title.trim(),
      body: description.trim(),
      source_url: baseUrl,
      published_at: new Date().toISOString(),
      author: null,
      summary: description.substring(0, 200) + '...'
    }];
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
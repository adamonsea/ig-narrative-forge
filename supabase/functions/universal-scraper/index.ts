import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapingConfig {
  method: 'rss' | 'rss_enhanced' | 'api' | 'html';
  url: string;
  headers?: Record<string, string>;
  retryAttempts: number;
  timeout: number;
}

interface ScrapingResult {
  success: boolean;
  articles: any[];
  errors: string[];
}

interface ScrapedArticle {
  title: string;
  content: string;
  author?: string;
  publishedDate?: string;
  summary?: string;
  url: string;
  imageUrl?: string;
}

interface ScrapeResult {
  success: boolean;
  articlesFound: number;
  articlesScraped: number;
  errors: string[];
  method: 'rss' | 'web_scraping' | 'hybrid';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region = 'Eastbourne' } = await req.json();
    
    console.log(`Starting intelligent scrape for: ${feedUrl}`);
    const startTime = Date.now();
    
    // Get scraping configurations for this domain
    const configs = await getScrapingConfig(feedUrl, supabase);
    console.log(`Using ${configs.length} scraping configurations`);
    
    // Attempt intelligent scraping with multiple strategies
    const scrapeResult = await intelligentScrape(configs, openAIApiKey);
    
    if (!scrapeResult.success) {
      throw new Error('All scraping methods failed');
    }
    
    console.log(`Found ${scrapeResult.articles.length} articles`);
    
    // Process articles with regional context enhancement
    const processedArticles = await processArticlesWithRegionalContext(
      scrapeResult.articles, 
      sourceId, 
      supabase, 
      openAIApiKey
    );
    
    // Store processed articles in database
    let articlesScraped = 0;
    const errors: string[] = [];

    for (const article of processedArticles) {
      try {
        // Check for existing article by URL
        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('source_url', article.source_url)
          .maybeSingle();

        if (existing) {
          console.log(`Skipping duplicate article: ${article.title}`);
          continue;
        }

        // Insert article with processing_status = 'new'
        const { error: insertError } = await supabase
          .from('articles')
          .insert({
            ...article,
            processing_status: 'new' // Mark as new for dashboard filtering
          });

        if (insertError) {
          errors.push(`Failed to insert article "${article.title}": ${insertError.message}`);
        } else {
          articlesScraped++;
          console.log(`Saved: ${article.title}`);
        }

      } catch (error) {
        errors.push(`Error processing article "${article.title}": ${error.message}`);
      }
    }

    // Update source metrics
    if (sourceId) {
      const responseTime = Date.now() - startTime;
      await updateSourceMetrics(sourceId, errors.length === 0, 'intelligent', supabase);
    }

    const result = {
      success: true,
      articlesFound: scrapeResult.articles.length,
      articlesScraped,
      errors,
      method: 'intelligent'
    };

    console.log(`Intelligent scrape completed: ${JSON.stringify(result)}`);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Intelligent scraper error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'intelligent'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Get domain-specific scraping configurations
async function getScrapingConfig(sourceUrl: string, supabase: any): Promise<ScrapingConfig[]> {
  const domain = new URL(sourceUrl).hostname.replace('www.', '');
  
  // Domain-specific configurations for key sources
  const domainConfigs: Record<string, ScrapingConfig[]> = {
    'bournefreelive.co.uk': [
      {
        method: 'rss_enhanced',
        url: 'https://bournefreelive.co.uk/feed/',
        retryAttempts: 3,
        timeout: 15000,
        headers: {
          'User-Agent': 'LocalNewsBot/1.0 (Eastbourne News Aggregator)',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      },
      {
        method: 'html',
        url: sourceUrl,
        retryAttempts: 2,
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LocalNewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }
    ],
    'sussexbylines.co.uk': [
      {
        method: 'rss_enhanced',
        url: 'https://sussexbylines.co.uk/feed/',
        retryAttempts: 3,
        timeout: 20000,
        headers: {
          'User-Agent': 'LocalNewsBot/1.0 (Sussex News Aggregator)',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      },
      {
        method: 'html',
        url: sourceUrl,
        retryAttempts: 2,
        timeout: 25000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LocalNewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }
    ],
    'itv.com': [
      {
        method: 'rss',
        url: 'https://www.itv.com/news/meridian/feed.xml',
        retryAttempts: 3,
        timeout: 15000,
        headers: {
          'User-Agent': 'LocalNewsBot/1.0',
          'Accept': 'application/rss+xml, application/xml'
        }
      }
    ],
    'moreradio.online': [
      {
        method: 'html',
        url: sourceUrl,
        retryAttempts: 2,
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LocalNewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }
    ],
    'reuters.com': [
      {
        method: 'rss',
        url: 'https://feeds.reuters.com/reuters/UKdomesticNews',
        retryAttempts: 3,
        timeout: 15000,
        headers: {
          'User-Agent': 'LocalNewsBot/1.0',
          'Accept': 'application/rss+xml, application/xml'
        }
      }
    ]
  };

  // Return domain-specific config or default
  return domainConfigs[domain] || [{
    method: 'html',
    url: sourceUrl,
    retryAttempts: 2,
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  }];
}

// Intelligent scraping with multiple strategies
async function intelligentScrape(configs: ScrapingConfig[], openAIApiKey: string): Promise<ScrapingResult> {
  const errors: string[] = [];
  
  for (const config of configs) {
    try {
      console.log(`Attempting ${config.method} scraping for: ${config.url}`);
      
      // Fetch with retries and proper error handling
      let content = '';
      for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), config.timeout);
          
          const response = await fetch(config.url, {
            headers: config.headers || {},
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          content = await response.text();
          break;
        } catch (error) {
          console.log(`Attempt ${attempt} failed: ${error.message}`);
          if (attempt === config.retryAttempts) {
            throw error;
          }
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
      
      // Parse content based on method
      let articles: any[] = [];
      switch (config.method) {
        case 'rss':
          articles = await parseRSSContent(content);
          break;
        case 'rss_enhanced':
          articles = await parseRSSEnhancedContent(content, openAIApiKey);
          break;
        case 'api':
          articles = await parseAPIContent(content);
          break;
        case 'html':
          articles = await parseHTMLContent(content, config.url, openAIApiKey);
          break;
      }
      
      if (articles.length > 0) {
        console.log(`Successfully scraped ${articles.length} articles using ${config.method}`);
        return { success: true, articles, errors };
      }
      
    } catch (error) {
      const message = `${config.method.toUpperCase()} scraping failed: ${error.message}`;
      console.error(message);
      errors.push(message);
    }
  }
  
  return { success: false, articles: [], errors };
}

// Parse RSS content
async function parseRSSContent(content: string): Promise<any[]> {
  const articles: any[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(content)) !== null) {
    const itemContent = match[1];
    
    const title = extractXMLContent(itemContent, 'title');
    const link = extractXMLContent(itemContent, 'link');
    const description = extractXMLContent(itemContent, 'description');
    const pubDate = extractXMLContent(itemContent, 'pubDate');
    const author = extractXMLContent(itemContent, 'author') || extractXMLContent(itemContent, 'dc:creator');
    
    if (title && link) {
      articles.push({
        title: cleanHTML(title),
        body: cleanHTML(description || ''),
        source_url: link,
        published_at: pubDate || new Date().toISOString(),
        author: author ? cleanHTML(author) : null,
        summary: description ? cleanHTML(description).substring(0, 200) + '...' : null
      });
    }
  }
  
  return articles.slice(0, 10); // Limit to 10 most recent
}

// Parse RSS with enhanced full content extraction
async function parseRSSEnhancedContent(content: string, openAIApiKey: string): Promise<any[]> {
  const articles: any[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  const urlsToFetch: Array<{title: string, url: string, description: string, pubDate: string, author: string | null}> = [];
  
  // First pass: extract article URLs from RSS
  while ((match = itemRegex.exec(content)) !== null) {
    const itemContent = match[1];
    
    const title = extractXMLContent(itemContent, 'title');
    const link = extractXMLContent(itemContent, 'link');
    const description = extractXMLContent(itemContent, 'description');
    const pubDate = extractXMLContent(itemContent, 'pubDate');
    const author = extractXMLContent(itemContent, 'author') || extractXMLContent(itemContent, 'dc:creator');
    
    if (title && link) {
      urlsToFetch.push({
        title: cleanHTML(title),
        url: link,
        description: cleanHTML(description || ''),
        pubDate: pubDate || new Date().toISOString(),
        author: author ? cleanHTML(author) : null
      });
    }
  }
  
  // Second pass: fetch full content from each article URL
  for (const item of urlsToFetch.slice(0, 5)) { // Limit to 5 to avoid overwhelming
    try {
      const response = await fetch(item.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LocalNewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      
      if (response.ok) {
        const htmlContent = await response.text();
        const fullContent = await extractFullArticleContent(htmlContent, openAIApiKey);
        
        articles.push({
          title: item.title,
          body: fullContent || item.description, // Fallback to RSS description if extraction fails
          source_url: item.url,
          published_at: item.pubDate,
          author: item.author,
          summary: item.description.length > 200 ? item.description.substring(0, 200) + '...' : item.description
        });
      }
    } catch (error) {
      console.log(`Failed to fetch full content for ${item.url}: ${error.message}`);
      // Fallback to RSS description
      articles.push({
        title: item.title,
        body: item.description,
        source_url: item.url,
        published_at: item.pubDate,
        author: item.author,
        summary: item.description.length > 200 ? item.description.substring(0, 200) + '...' : item.description
      });
    }
  }
  
  return articles;
}

// Extract full article content from HTML page
async function extractFullArticleContent(html: string, openAIApiKey: string): Promise<string> {
  const prompt = `Extract the complete main article content from this HTML page. 

CRITICAL INSTRUCTIONS:
- Extract ONLY the main article body text, ignore all navigation, sidebars, ads, comments, related articles sections
- If the article is broken up by images or other elements, reconstruct the complete flowing text
- Combine all article paragraphs into one continuous text, maintaining the original order
- Ignore any content from secondary columns, widget areas, or promotional sections
- Focus on the primary content area that contains the actual news story
- Return the complete article as clean, flowing text without HTML tags

HTML content:
${html.substring(0, 15000)}`; // Increased limit for complex layouts

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('Failed to extract full content with AI:', error);
    return '';
  }
}

// Parse API JSON content
async function parseAPIContent(content: string): Promise<any[]> {
  try {
    const data = JSON.parse(content);
    
    // Try common API response structures
    const articlesArray = data.articles || data.items || data.posts || data.data || 
                         (Array.isArray(data) ? data : []);
    
    return articlesArray.slice(0, 10).map((item: any) => ({
      title: item.title || item.headline || 'Untitled',
      body: item.content || item.body || item.description || '',
      source_url: item.url || item.link || item.permalink || '',
      published_at: item.publishedAt || item.published_at || item.date || new Date().toISOString(),
      author: item.author || item.byline || null,
      summary: item.summary || item.excerpt || null
    }));
  } catch (error) {
    console.error('Failed to parse API content:', error);
    return [];
  }
}

// Parse HTML content using AI
async function parseHTMLContent(content: string, sourceUrl: string, openAIApiKey: string): Promise<any[]> {
  try {
    console.log('Using AI to extract articles from HTML...');
    
    // Clean and truncate HTML for AI processing
    const cleanContent = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .substring(0, 8000); // Limit content size
    
    const prompt = `Extract news articles from this HTML content. Focus on finding articles relevant to Eastbourne or local UK news. 

CRITICAL: For each article, extract ONLY the main article content from the primary content area. Ignore sidebars, navigation, ads, related articles, and secondary columns.

Return a JSON array with this structure:
    [
      {
        "title": "Article title",
        "body": "Complete main article content (extract from primary content area only)",
        "source_url": "Article URL",
        "published_at": "Publication date (ISO format)",
        "author": "Author name",
        "summary": "Brief summary"
      }
    ]
    
    HTML content:
    ${cleanContent}
    
    Source URL: ${sourceUrl}
    
    Return only valid JSON, no other text.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    
    const aiResult = await response.json();
    const extractedArticles = JSON.parse(aiResult.choices[0].message.content);
    
    console.log(`AI extracted ${extractedArticles.length} articles`);
    return extractedArticles.slice(0, 5); // Limit AI extractions
    
  } catch (error) {
    console.error('AI HTML parsing failed:', error);
    return [];
  }
}

// Process articles with regional context enhancement
async function processArticlesWithRegionalContext(
  articles: any[], 
  sourceId: string, 
  supabase: any, 
  openAIApiKey: string
): Promise<any[]> {
  const processedArticles: any[] = [];
  
  for (const article of articles) {
    try {
      // Enhance with regional context using AI
      const enhancedArticle = await enhanceRegionalContext(article, openAIApiKey);
      
      // Calculate regional relevance score
      const relevanceScore = calculateRegionalRelevance(enhancedArticle);
      
      // Only include articles with some relevance to the region
      if (relevanceScore > 0) {
        processedArticles.push({
          title: enhancedArticle.title.substring(0, 500),
          body: enhancedArticle.body,
          summary: enhancedArticle.summary?.substring(0, 500) || null,
          author: enhancedArticle.author,
          source_url: enhancedArticle.source_url,
          canonical_url: enhancedArticle.source_url,
          published_at: enhancedArticle.published_at,
          region: enhancedArticle.region || 'Eastbourne',
          source_id: sourceId,
          word_count: enhancedArticle.body ? enhancedArticle.body.split(/\s+/).length : 0,
          reading_time_minutes: enhancedArticle.body ? Math.ceil(enhancedArticle.body.split(/\s+/).length / 200) : 0,
          import_metadata: {
            imported_from: 'intelligent_scraper',
            scraped_at: new Date().toISOString(),
            regional_relevance_score: relevanceScore,
            ai_enhanced: true
          }
        });
      } else {
        console.log(`Skipping article with low regional relevance: ${article.title}`);
      }
    } catch (error) {
      console.error(`Failed to process article: ${article.title}`, error);
    }
  }
  
  return processedArticles;
}

// Enhance article with regional context using AI
async function enhanceRegionalContext(article: any, openAIApiKey: string): Promise<any> {
  try {
    const prompt = `Analyze this article and add regional context for Eastbourne/East Sussex area. If the article mentions local places, events, or people, highlight the regional significance. Return JSON with enhanced content:
    
    {
      "title": "Enhanced title with regional context if relevant",
      "body": "Enhanced body content with regional context added",
      "summary": "Enhanced summary",
      "region": "Eastbourne" or specific local area,
      "regional_significance": "Brief explanation of why this matters locally",
      "regional_relevance_score": 1-10 (how relevant to Eastbourne)
    }
    
    Original article:
    Title: ${article.title}
    Content: ${article.body?.substring(0, 1000) || 'No content'}
    
    Return only valid JSON.`;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    
    const aiResult = await response.json();
    const enhancement = JSON.parse(aiResult.choices[0].message.content);
    
    return {
      ...article,
      title: enhancement.title || article.title,
      body: enhancement.body || article.body,
      summary: enhancement.summary || article.summary,
      region: enhancement.region || 'Eastbourne',
      regional_significance: enhancement.regional_significance,
      ai_regional_relevance_score: enhancement.regional_relevance_score || 0
    };
    
  } catch (error) {
    console.error('Regional context enhancement failed:', error);
    return article; // Return original if enhancement fails
  }
}

// Calculate regional relevance score
function calculateRegionalRelevance(article: any): number {
  const searchText = `${article.title} ${article.body}`.toLowerCase();
  let score = 0;
  
  // High relevance terms for Eastbourne
  const eastbourneTerms = ['eastbourne', 'beachy head', 'eastbourne pier', 'eastbourne council'];
  const eastSussexTerms = ['east sussex', 'sussex', 'brighton', 'hastings', 'lewes'];
  const localTerms = ['local', 'residents', 'community', 'neighbourhood'];
  
  // Score based on term presence
  eastbourneTerms.forEach(term => {
    if (searchText.includes(term)) score += 10;
  });
  
  eastSussexTerms.forEach(term => {
    if (searchText.includes(term)) score += 5;
  });
  
  localTerms.forEach(term => {
    if (searchText.includes(term)) score += 2;
  });
  
  // Bonus for title mentions
  if (article.title.toLowerCase().includes('eastbourne')) score += 15;
  
  // Use AI score if available
  if (article.ai_regional_relevance_score) {
    score += article.ai_regional_relevance_score;
  }
  
  return Math.min(score, 100); // Cap at 100
}

// Update source metrics
async function updateSourceMetrics(sourceId: string, success: boolean, method: string, supabase: any) {
  try {
    const updates: any = {
      last_scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (success) {
      updates.scraping_config = { last_successful_method: method };
    }
    
    const { error } = await supabase
      .from('content_sources')
      .update(updates)
      .eq('id', sourceId);
    
    if (error) {
      console.error('Failed to update source metrics:', error);
    }
  } catch (error) {
    console.error('Error updating source metrics:', error);
  }
}

// Helper function to extract XML content
function extractXMLContent(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : '';
}

// Helper function to clean HTML
function cleanHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function isRSSUrl(url: string): boolean {
  const rssIndicators = [
    '/rss', '/feed', 'rss.xml', 'feed.xml', 'atom.xml',
    '?service=rss', 'feeds.', '/api/rss', '/rss/'
  ];
  return rssIndicators.some(indicator => url.toLowerCase().includes(indicator));
}

async function scrapeRSSFeed(url: string): Promise<ScrapedArticle[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'NewsSlides-Bot/1.0',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const rssText = await response.text();
  const items = parseRSSFeed(rssText);
  
  const articles: ScrapedArticle[] = [];
  
  for (const item of items.slice(0, 10)) { // Limit to 10 most recent
    try {
      const fullArticle = await scrapeFullArticle(item.link);
      if (fullArticle.content.length > 100) {
        articles.push({
          title: item.title,
          content: fullArticle.content,
          author: fullArticle.author || item.author,
          publishedDate: item.pubDate,
          summary: fullArticle.summary || item.description,
          url: item.link,
          imageUrl: fullArticle.imageUrl
        });
      }
    } catch (error) {
      console.error(`Failed to scrape RSS article: ${item.link}`);
    }
  }
  
  return articles;
}

async function scrapeWebsite(url: string): Promise<ScrapedArticle[]> {
  console.log(`Intelligently scraping website: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Website fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }

  // Look for article links on the page
  const articleLinks = extractArticleLinks(doc, url);
  console.log(`Found ${articleLinks.length} potential article links`);
  
  const articles: ScrapedArticle[] = [];
  
  // If we found article links, scrape them
  if (articleLinks.length > 0) {
    for (const link of articleLinks.slice(0, 15)) { // Limit to 15 articles
      try {
        const article = await scrapeFullArticle(link);
        if (article.content.length > 150) {
          articles.push({
            title: article.title,
            content: article.content,
            author: article.author,
            publishedDate: article.publishedDate,
            summary: article.summary,
            url: link,
            imageUrl: article.imageUrl
          });
        }
        
        // Respectful delay
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`Failed to scrape article: ${link}`);
      }
    }
  } else {
    // Try to extract content from the current page if it looks like an article
    const pageArticle = extractArticleFromPage(doc, url);
    if (pageArticle.content.length > 150) {
      articles.push(pageArticle);
    }
  }
  
  return articles;
}

function extractArticleLinks(doc: any, baseUrl: string): string[] {
  const links: string[] = [];
  const base = new URL(baseUrl);
  
  // Common selectors for article links
  const linkSelectors = [
    'a[href*="/news/"]',
    'a[href*="/article"]',
    'a[href*="/story"]',
    'a[href*="/post"]',
    'article a',
    '.news-item a',
    '.article-link',
    '.story-link',
    'h1 a', 'h2 a', 'h3 a',
    '.headline a',
    '.title a'
  ];
  
  for (const selector of linkSelectors) {
    const elements = doc.querySelectorAll(selector);
    for (const element of elements) {
      const href = element.getAttribute('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          
          // Filter for news-like URLs
          if (isNewsArticleUrl(absoluteUrl) && absoluteUrl.includes(base.hostname)) {
            links.push(absoluteUrl);
          }
        } catch (error) {
          // Invalid URL, skip
        }
      }
    }
  }
  
  // Remove duplicates and return
  return [...new Set(links)];
}

function isNewsArticleUrl(url: string): boolean {
  const newsPatterns = [
    '/news/', '/article', '/story', '/post/', '/2024/', '/2025/',
    'eastbourne', 'sussex', 'local'
  ];
  
  const excludePatterns = [
    'mailto:', 'javascript:', 'tel:', '#', 'facebook.com', 'twitter.com',
    'instagram.com', 'youtube.com', '/search', '/tag', '/category',
    '/author', '/contact', '/about', '/privacy', '/terms'
  ];
  
  const lowerUrl = url.toLowerCase();
  
  // Must match at least one news pattern
  const hasNewsPattern = newsPatterns.some(pattern => lowerUrl.includes(pattern));
  // Must not match any exclude patterns
  const hasExcludePattern = excludePatterns.some(pattern => lowerUrl.includes(pattern));
  
  return hasNewsPattern && !hasExcludePattern;
}

function extractArticleFromPage(doc: any, url: string): ScrapedArticle {
  const contentSelectors = [
    'article',
    '.article-content', 
    '.post-content',
    '.entry-content',
    '.story-body',
    '.news-content',
    '.main-content',
    '[role="main"]'
  ];

  let content = '';
  let title = '';
  let author = '';
  let publishedDate = '';
  let summary = '';
  let imageUrl = '';

  // Extract title
  const titleElement = doc.querySelector('h1') || doc.querySelector('title');
  title = titleElement?.textContent?.trim() || 'Untitled Article';

  // Extract author
  const authorSelectors = ['.author', '.byline', '[rel="author"]', '.writer'];
  for (const selector of authorSelectors) {
    const element = doc.querySelector(selector);
    if (element?.textContent?.trim()) {
      author = element.textContent.trim().replace(/^(By|Author:)\s*/i, '');
      break;
    }
  }

  // Extract published date
  const dateElement = doc.querySelector('time[datetime]') || doc.querySelector('.date');
  publishedDate = dateElement?.getAttribute('datetime') || dateElement?.textContent?.trim() || '';

  // Extract main image
  const imgElement = doc.querySelector('article img') || doc.querySelector('.featured-image img');
  imageUrl = imgElement?.getAttribute('src') || '';

  // Extract main content
  for (const selector of contentSelectors) {
    const element = doc.querySelector(selector);
    if (element) {
      // Remove unwanted elements
      element.querySelectorAll('script, style, .advertisement, .social-share, nav, aside')
        ?.forEach((el: any) => el.remove());
      
      content = element.textContent?.trim() || '';
      if (content.length > 200) break;
    }
  }

  // Fallback content extraction
  if (content.length < 200) {
    const paragraphs = doc.querySelectorAll('p');
    const paragraphTexts = Array.from(paragraphs)
      .map((p: any) => p.textContent?.trim())
      .filter((text: string) => text && text.length > 30);
    
    if (paragraphTexts.length > 2) {
      content = paragraphTexts.slice(0, 10).join('\n\n');
    }
  }

  // Generate summary
  summary = content.split('.')[0] + '.' || content.substring(0, 200) + '...';

  return {
    title,
    content,
    author,
    publishedDate,
    summary,
    url,
    imageUrl
  };
}

async function scrapeFullArticle(url: string): Promise<{
  title: string;
  content: string;
  author?: string;
  publishedDate?: string;
  summary?: string;
  imageUrl?: string;
}> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  return extractArticleFromPage(doc, url);
}

function parseRSSFeed(rssText: string): any[] {
  const items: any[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(rssText)) !== null) {
    const itemContent = match[1];
    
    const item = {
      title: extractTag(itemContent, 'title') || 'Untitled',
      link: extractTag(itemContent, 'link') || '',
      description: extractTag(itemContent, 'description') || '',
      pubDate: extractTag(itemContent, 'pubDate') || new Date().toISOString(),
      author: extractTag(itemContent, 'author') || extractTag(itemContent, 'dc:creator'),
      category: extractTag(itemContent, 'category')
    };
    
    if (item.title && item.link) {
      items.push(item);
    }
  }
  
  return items;
}

function extractTag(content: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : undefined;
}

function checkEastbourneRelevance(article: ScrapedArticle): boolean {
  const eastbourneTerms = [
    'eastbourne', 'beachy head', 'eastbourne borough council', 
    'eastbourne pier', 'seafront', 'sussex police eastbourne'
  ];
  
  const searchText = `${article.title} ${article.content} ${article.url}`.toLowerCase();
  return eastbourneTerms.some(term => searchText.includes(term));
}

function calculateRelevanceScore(article: ScrapedArticle): number {
  const searchText = `${article.title} ${article.content}`.toLowerCase();
  let score = 0;
  
  // High relevance terms
  if (searchText.includes('eastbourne council')) score += 15;
  if (searchText.includes('eastbourne residents')) score += 15;
  if (searchText.includes('eastbourne pier')) score += 10;
  if (searchText.includes('beachy head')) score += 10;
  
  // Medium relevance
  if (searchText.includes('eastbourne')) score += 5;
  if (searchText.includes('sussex')) score += 3;
  
  // Title mentions
  if (article.title.toLowerCase().includes('eastbourne')) score += 10;
  
  return score;
}

async function generateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return url;
  }
}

async function updateSourceStats(supabase: any, sourceId: string, articlesCount: number, responseTime: number, success: boolean) {
  const { data: source } = await supabase
    .from('content_sources')
    .select('articles_scraped, success_rate, avg_response_time_ms')
    .eq('id', sourceId)
    .single();

  if (source) {
    const totalScraped = (source.articles_scraped || 0) + articlesCount;
    const currentSuccessRate = source.success_rate || 100;
    const newSuccessRate = success ? Math.min(100, currentSuccessRate + 1) : Math.max(0, currentSuccessRate - 5);
    const avgResponseTime = Math.round(((source.avg_response_time_ms || 0) + responseTime) / 2);

    await supabase
      .from('content_sources')
      .update({
        articles_scraped: totalScraped,
        success_rate: newSuccessRate,
        avg_response_time_ms: avgResponseTime,
        last_scraped_at: new Date().toISOString()
      })
      .eq('id', sourceId);
  }
}
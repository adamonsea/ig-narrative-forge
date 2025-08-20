import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapingConfig {
  method: 'rss' | 'api' | 'html' | 'fallback';
  url: string;
  headers?: Record<string, string>;
  retryAttempts: number;
  timeout: number;
  userAgent?: string;
}

interface ScrapingResult {
  success: boolean;
  articles: any[];
  error?: string;
  method?: string;
  source?: string;
}

// Regional configuration for different areas
interface RegionConfig {
  name: string;
  keywords: string[];
  landmarks: string[];
  postcodes: string[];
  organizations: string[];
}

const REGION_CONFIGS: Record<string, RegionConfig> = {
  'Eastbourne': {
    name: 'Eastbourne/East Sussex',
    keywords: ['eastbourne', 'east sussex', 'sussex', 'pier', 'seafront', 'south downs'],
    landmarks: ['Eastbourne Pier', 'Beachy Head', 'South Downs', 'Sovereign Harbour', 'Devonshire Park'],
    postcodes: ['BN20', 'BN21', 'BN22', 'BN23', 'BN24'],
    organizations: ['Eastbourne Borough Council', 'East Sussex County Council', 'Sussex Police']
  },
  'Brighton': {
    name: 'Brighton & Hove',
    keywords: ['brighton', 'hove', 'sussex', 'seafront', 'lanes', 'pier'],
    landmarks: ['Brighton Pier', 'Royal Pavilion', 'The Lanes', 'Brighton Marina', 'Hove Seafront'],
    postcodes: ['BN1', 'BN2', 'BN3', 'BN41', 'BN42'],
    organizations: ['Brighton & Hove City Council', 'Sussex Police', 'University of Brighton']
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!supabaseUrl || !supabaseKey || !openAIApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { sourceUrl, sourceId } = await req.json();

    console.log('Starting intelligent scraping for:', sourceUrl);

    // Get source info for regional context
    const { data: sourceInfo } = await supabase
      .from('content_sources')
      .select('source_name, canonical_domain, region, source_type')
      .eq('id', sourceId)
      .single();

    console.log(`📊 Source info: ${sourceInfo?.source_name} (Type: ${sourceInfo?.source_type}, Region: ${sourceInfo?.region})`);

    // Get intelligent scraping configuration for this source
    const config = await getScrapingConfig(sourceUrl, supabase);
    
    // Attempt scraping with multiple strategies
    const result = await intelligentScrape(config, openAIApiKey);
    
    if (result.success && result.articles.length > 0) {
      // Process articles with regional context
      const targetRegion = sourceInfo?.region || 'Eastbourne'; // Use source region or default
      const processedArticles = await processArticlesWithRegionalContext(
        result.articles,
        sourceInfo,
        targetRegion,
        openAIApiKey
      );
      
      // Add source ID to processed articles
      const articlesWithSourceId = processedArticles.map(article => ({
        ...article,
        source_id: sourceId,
        processing_status: 'new'
      }));
      
      // Store articles in database
      const { error: insertError } = await supabase
        .from('articles')
        .insert(articlesWithSourceId);

      if (insertError) {
        console.error('Error inserting articles:', insertError);
        throw new Error(`Failed to insert articles: ${insertError.message}`);
      }

      // Update source success metrics
      await updateSourceMetrics(sourceId, true, result.method, supabase);
      
      console.log(`Successfully scraped ${processedArticles.length} articles from ${sourceUrl}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          articlesCount: processedArticles.length,
          method: result.method,
          source: sourceUrl
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Update source failure metrics
      await updateSourceMetrics(sourceId, false, 'failed', supabase);
      
      throw new Error(result.error || 'No articles found');
    }

  } catch (error) {
    console.error('Error in intelligent-scraper function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function getScrapingConfig(sourceUrl: string, supabase: any): Promise<ScrapingConfig[]> {
  const domain = new URL(sourceUrl).hostname.toLowerCase();
  
  // Domain-specific configurations
  const configs: Record<string, ScrapingConfig[]> = {
    'bournefreelive.co.uk': [
      {
        method: 'rss',
        url: 'https://bournefreelive.co.uk/feed/',
        retryAttempts: 2,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +https://lovable.dev/bot)'
        }
      },
      {
        method: 'html',
        url: sourceUrl,
        retryAttempts: 3,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    ],
    'itv.com': [
      {
        method: 'api',
        url: 'https://www.itv.com/news/topic/eastbourne.json',
        retryAttempts: 2,
        timeout: 8000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
        }
      },
      {
        method: 'html',
        url: sourceUrl,
        retryAttempts: 2,
        timeout: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      }
    ],
    'moreradio.online': [
      {
        method: 'html',
        url: 'https://www.moreradio.online/eastbourne/',
        retryAttempts: 3,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      {
        method: 'rss',
        url: 'https://www.moreradio.online/feed/',
        retryAttempts: 2,
        timeout: 8000
      }
    ],
    'reuters.com': [
      {
        method: 'rss',
        url: 'https://feeds.reuters.com/reuters/UKNews',
        retryAttempts: 3,
        timeout: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +https://lovable.dev/bot)'
        }
      },
      {
        method: 'api',
        url: 'https://www.reuters.com/pf/api/v3/content/fetch/articles-by-section-alias-or-id-v1?query=%7B%22section_id%22%3A%22%2Fworld%2Fuk%22%2C%22size%22%3A20%7D',
        retryAttempts: 2,
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      }
    ]
  };

  return configs[domain] || [
    {
      method: 'rss',
      url: sourceUrl,
      retryAttempts: 2,
      timeout: 8000
    },
    {
      method: 'html',
      url: sourceUrl,
      retryAttempts: 2,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  ];
}

async function intelligentScrape(configs: ScrapingConfig[], openAIApiKey: string): Promise<ScrapingResult> {
  for (const config of configs) {
    try {
      console.log(`Attempting ${config.method} scraping:`, config.url);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      
      const response = await fetch(config.url, {
        headers: config.headers || {},
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.log(`${config.method} failed with status:`, response.status);
        continue;
      }
      
      const content = await response.text();
      
      let articles: any[] = [];
      
      switch (config.method) {
        case 'rss':
          articles = await parseRSSContent(content);
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
        return {
          success: true,
          articles,
          method: config.method,
          source: config.url
        };
      }
      
    } catch (error) {
      console.log(`${config.method} scraping failed:`, error.message);
      continue;
    }
  }
  
  return {
    success: false,
    articles: [],
    error: 'All scraping methods failed'
  };
}

async function parseRSSContent(content: string): Promise<any[]> {
  const articles: any[] = [];
  
  // Simple RSS parsing - extract items
  const itemMatches = content.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
  
  if (itemMatches) {
    for (const item of itemMatches.slice(0, 10)) { // Limit to 10 articles
      const title = extractXMLContent(item, 'title');
      const description = extractXMLContent(item, 'description');
      const link = extractXMLContent(item, 'link');
      const pubDate = extractXMLContent(item, 'pubDate');
      
      if (title && link) {
        articles.push({
          title: cleanHTML(title),
          body: cleanHTML(description || ''),
          source_url: link,
          published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
        });
      }
    }
  }
  
  return articles;
}

async function parseAPIContent(content: string): Promise<any[]> {
  try {
    const data = JSON.parse(content);
    const articles: any[] = [];
    
    // Handle different API response structures
    const items = data.articles || data.items || data.results || data;
    
    if (Array.isArray(items)) {
      for (const item of items.slice(0, 10)) {
        const title = item.title || item.headline || item.name;
        const description = item.description || item.summary || item.excerpt || item.body;
        const url = item.url || item.link || item.permalink;
        const published = item.published_at || item.publishedAt || item.date || item.created_at;
        
        if (title && url) {
          articles.push({
            title: cleanHTML(title),
            body: cleanHTML(description || ''),
            source_url: url,
            published_at: published ? new Date(published).toISOString() : new Date().toISOString()
          });
        }
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error parsing API content:', error);
    return [];
  }
}

async function parseHTMLContent(content: string, sourceUrl: string, openAIApiKey: string): Promise<any[]> {
  // Use AI to intelligently extract articles from HTML
  const prompt = `Extract news articles from this HTML content. Return a JSON array of articles with title, body (summary/excerpt), and any URLs found. Focus on actual news content, ignore navigation, ads, etc.

HTML Content (truncated):
${content.substring(0, 8000)}...

Return format:
{
  "articles": [
    {
      "title": "Article title",
      "body": "Article summary or excerpt",
      "url": "article URL (if found, otherwise use source URL)"
    }
  ]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: 'You are an expert at extracting structured news article data from HTML content.' },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    
    return (parsed.articles || []).map((article: any) => ({
      title: article.title,
      body: article.body,
      source_url: article.url || sourceUrl,
      published_at: new Date().toISOString()
    })).slice(0, 10);
    
  } catch (error) {
    console.error('Error parsing HTML with AI:', error);
    return [];
  }
}

async function processArticlesWithRegionalContext(
  articles: any[],
  sourceInfo: any,
  targetRegion: string,
  openAIApiKey: string
): Promise<any[]> {
  const processedArticles = [];
  
  for (const article of articles) {
    // Enhance with regional context
    const enhancedArticle = await enhanceRegionalContext(article, targetRegion, openAIApiKey);
    
    // Calculate regional relevance
    const relevanceScore = calculateRegionalRelevance(enhancedArticle, sourceInfo, targetRegion);
    
    processedArticles.push({
      ...enhancedArticle,
      region: enhancedArticle.region || 'Unknown',
      import_metadata: {
        scraping_method: 'intelligent-scraper',
        regional_relevance_score: relevanceScore,
        enhanced: true,
        scraped_at: new Date().toISOString()
      }
    });
  }
  
  return processedArticles;
}

async function enhanceRegionalContext(article: any, targetRegion: string, openAIApiKey: string): Promise<any> {
  const regionConfig = REGION_CONFIGS[targetRegion] || REGION_CONFIGS['Eastbourne']; // fallback
  
  const prompt = `Analyze this news article and enhance it with regional/geographic context:

Title: ${article.title}
Content: ${article.body}

Tasks:
1. Identify the primary geographic location (city, town, region)
2. Add relevant regional context and local significance
3. Identify local landmarks, events, or community connections
4. Rate regional relevance (1-100) for ${regionConfig.name} area

Return JSON:
{
  "enhanced_title": "title with regional context if needed",
  "enhanced_body": "body with additional regional context",
  "region": "primary location",
  "local_context": "local significance/connections",
  "regional_relevance": 85,
  "keywords": ["keyword1", "keyword2"]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: `You are an expert at identifying and enhancing regional context in news articles, especially for the ${regionConfig.name} area.` },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" }
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const enhanced = JSON.parse(data.choices[0].message.content);
      
      return {
        ...article,
        title: enhanced.enhanced_title || article.title,
        body: enhanced.enhanced_body || article.body,
        region: enhanced.region,
        keywords: enhanced.keywords,
        import_metadata: {
          ...article.import_metadata,
          local_context: enhanced.local_context,
          regional_relevance: enhanced.regional_relevance
        }
      };
    }
  } catch (error) {
    console.error('Error enhancing regional context:', error);
  }
  
  return article;
}

function calculateRegionalRelevance(article: any, sourceInfo: any, targetRegion: string): number {
  let score = 0;
  
  // Base score based on source type
  const sourceType = sourceInfo?.source_type || 'national';
  if (sourceType === 'hyperlocal') {
    score += 70; // High base score for hyperlocal sources
  } else if (sourceType === 'regional') {
    score += 40; // Medium base score for regional sources
  }
  // National sources get 0 base score
  
  const regionConfig = REGION_CONFIGS[targetRegion] || REGION_CONFIGS['Eastbourne'];
  const title = (article.title || '').toLowerCase();
  const body = (article.body || '').toLowerCase();
  const content = `${title} ${body}`;
  
  // Region-specific keywords (weighted by importance)
  const primaryKeywords = regionConfig.keywords.map((keyword, index) => ({
    term: keyword.toLowerCase(),
    weight: 20 - (index * 2) // Decreasing weight for each keyword
  }));
  
  primaryKeywords.forEach(keyword => {
    if (content.includes(keyword.term)) {
      score += keyword.weight;
    }
  });
  
  // Local landmarks and places
  regionConfig.landmarks.forEach(landmark => {
    if (content.includes(landmark.toLowerCase())) {
      score += 8;
    }
  });
  
  // Local organizations and institutions
  regionConfig.organizations.forEach(org => {
    if (content.includes(org.toLowerCase())) {
      score += 10;
    }
  });
  
  // Postcode patterns
  const postcodePattern = new RegExp(`\\b(${regionConfig.postcodes.join('|')})\\b`, 'gi');
  const postcodeMatches = content.match(postcodePattern);
  if (postcodeMatches) {
    score += postcodeMatches.length * 15;
  }
  
  return Math.min(score, 100);
}

async function updateSourceMetrics(sourceId: string, success: boolean, method: string, supabase: any) {
  const updateData: any = {
    last_scraped_at: new Date().toISOString(),
    scraping_config: { last_successful_method: success ? method : null }
  };
  
  if (success) {
    updateData.articles_scraped = 1; // This would be incremented in a real implementation
    updateData.success_rate = 100; // Simplified - would calculate actual rate
  }
  
  await supabase
    .from('content_sources')
    .update(updateData)
    .eq('id', sourceId);
}

function extractXMLContent(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function cleanHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}
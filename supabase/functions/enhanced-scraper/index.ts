import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapingConfig {
  method: 'rss' | 'html_enhanced' | 'fallback';
  url: string;
  headers?: Record<string, string>;
  retryAttempts: number;
  timeout: number;
  contentSelector?: string;
  titleSelector?: string;
  authorSelector?: string;
}

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
    const { sourceUrl, sourceId, articleUrl } = await req.json();

    console.log('Starting enhanced scraping for:', articleUrl || sourceUrl);

    // Get enhanced scraping configuration
    const config = getEnhancedScrapingConfig(sourceUrl);
    
    // Target URL - either specific article or source URL
    const targetUrl = articleUrl || sourceUrl;

    // Attempt enhanced scraping
    const result = await enhancedScrape(config, targetUrl, openAIApiKey);
    
    if (result.success && result.articles.length > 0) {
      // Process articles with enhanced content extraction
      const processedArticles = await processArticlesWithEnhancedExtraction(
        result.articles, 
        sourceId, 
        supabase, 
        openAIApiKey
      );
      
      // Store articles
      const { error: insertError } = await supabase
        .from('articles')
        .insert(processedArticles);

      if (insertError) {
        console.error('Error inserting articles:', insertError);
        throw new Error(`Failed to insert articles: ${insertError.message}`);
      }

      console.log(`Successfully scraped ${processedArticles.length} articles with enhanced extraction`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          articlesCount: processedArticles.length,
          method: result.method,
          contentQuality: processedArticles.map(a => ({
            id: a.id,
            wordCount: a.word_count,
            qualityScore: a.content_quality_score
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error(result.error || 'No articles found with enhanced extraction');
    }

  } catch (error) {
    console.error('Error in enhanced-scraper function:', error);
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

function getEnhancedScrapingConfig(sourceUrl: string): ScrapingConfig[] {
  const domain = new URL(sourceUrl).hostname.toLowerCase();
  
  const configs: Record<string, ScrapingConfig[]> = {
    'bournefreelive.co.uk': [
      {
        method: 'html_enhanced',
        url: sourceUrl,
        retryAttempts: 3,
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache'
        },
        contentSelector: '.entry-content, .post-content, article, .content',
        titleSelector: '.entry-title, .post-title, h1, .title',
        authorSelector: '.author, .byline, .post-author'
      },
      {
        method: 'rss',
        url: 'https://bournefreelive.co.uk/feed/',
        retryAttempts: 2,
        timeout: 10000
      }
    ]
  };

  return configs[domain] || [
    {
      method: 'html_enhanced',
      url: sourceUrl,
      retryAttempts: 2,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  ];
}

async function enhancedScrape(
  configs: ScrapingConfig[], 
  targetUrl: string, 
  openAIApiKey: string
): Promise<{ success: boolean; articles: any[]; error?: string; method?: string }> {
  
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
        case 'html_enhanced':
          articles = await parseHTMLEnhanced(content, config.url, openAIApiKey, config);
          break;
      }
      
      if (articles.length > 0) {
        console.log(`Successfully scraped ${articles.length} articles using ${config.method}`);
        return {
          success: true,
          articles,
          method: config.method
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
    error: 'All enhanced scraping methods failed'
  };
}

async function parseRSSContent(content: string): Promise<any[]> {
  const articles: any[] = [];
  const itemMatches = content.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
  
  if (itemMatches) {
    for (const item of itemMatches.slice(0, 10)) {
      const title = extractXMLContent(item, 'title');
      const description = extractXMLContent(item, 'description');
      const link = extractXMLContent(item, 'link');
      const pubDate = extractXMLContent(item, 'pubDate');
      
      if (title && link) {
        articles.push({
          title: cleanHTML(title),
          body: cleanHTML(description || ''),
          source_url: link,
          published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          content_quality_score: description ? Math.min(description.length / 10, 100) : 20
        });
      }
    }
  }
  
  return articles;
}

async function parseHTMLEnhanced(
  content: string, 
  sourceUrl: string, 
  openAIApiKey: string,
  config: ScrapingConfig
): Promise<any[]> {
  
  // Enhanced AI prompt with truncation detection for bournefreelive.co.uk
  const domain = new URL(sourceUrl).hostname.toLowerCase();
  const isBourneFreeLive = domain.includes('bournefreelive.co.uk');
  
  const prompt = `You are an expert web scraper specializing in news content extraction. Extract full news articles from this HTML content.

CRITICAL REQUIREMENTS:
${isBourneFreeLive ? `
SPECIAL HANDLING FOR BOURNEFREELIVE.CO.UK:
- This site often truncates content with "[…]" or "[...]"
- Look for the COMPLETE article content, not truncated versions
- If you find truncated content ending with "[…]", "[...]", or "Read more", mark it as incomplete
- Extract ALL available paragraphs and full story details
- Minimum 200 words for substantial articles from this source
` : ''}
- Extract COMPLETE article text, not summaries or excerpts
- Full article body content (multiple paragraphs)
- Complete news stories, not just headlines or captions
- Actual journalistic content with substantial word count

Source URL: ${sourceUrl}
Content selectors to prioritize: ${config.contentSelector || 'article, .content, .post-content'}

HTML Content (first 15000 chars):
${content.substring(0, 15000)}

Requirements:
1. Extract FULL article content (minimum ${isBourneFreeLive ? '200' : '50'} words per article)
2. Include complete paragraphs and details
3. Detect and flag truncated content (ending with [...], […], "Read more", etc.)
4. Avoid short captions, navigation text, or summaries
5. Prioritize substantial news content

Return JSON format:
{
  "articles": [
    {
      "title": "Full article title",
      "body": "COMPLETE article content with all paragraphs and details",
      "url": "article URL or source URL",
      "author": "author name if found",
      "wordCount": estimated_word_count,
      "isTruncated": false,
      "qualityScore": 1-100_based_on_completeness_and_length
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
        model: 'gpt-5-2025-08-07',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert at extracting complete, full-length news articles from HTML. Always extract the ENTIRE article content, not summaries.' 
          },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 4000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    
    const articles = (parsed.articles || [])
      .filter((article: any) => {
        const minLength = new URL(sourceUrl).hostname.includes('bournefreelive.co.uk') ? 200 : 50;
        return article.body && article.body.length > minLength;
      })
      .map((article: any) => {
        const wordCount = article.wordCount || article.body.split(/\s+/).length;
        const isTruncated = article.isTruncated || 
          article.body.includes('[…]') || 
          article.body.includes('[...]') || 
          article.body.toLowerCase().includes('read more');
        
        return {
          title: article.title,
          body: article.body,
          author: article.author || null,
          source_url: article.url || sourceUrl,
          published_at: new Date().toISOString(),
          word_count: wordCount,
          content_quality_score: isTruncated ? Math.min(article.qualityScore || 30, 50) : Math.min(article.qualityScore || article.body.length / 10, 100),
          extraction_attempts: 1,
          import_metadata: {
            is_truncated: isTruncated,
            extraction_quality: article.qualityScore || 0,
            source_domain: new URL(sourceUrl).hostname
          }
        };
      })
      .slice(0, 10);

    // Log truncated articles for debugging
    const truncatedArticles = articles.filter(a => a.import_metadata.is_truncated);
    if (truncatedArticles.length > 0) {
      console.log(`Warning: Found ${truncatedArticles.length} potentially truncated articles from ${sourceUrl}`);
    }

    return articles;
      
  } catch (error) {
    console.error('Error parsing HTML with enhanced AI:', error);
    return [];
  }
}

async function processArticlesWithEnhancedExtraction(
  articles: any[], 
  sourceId: string, 
  supabase: any, 
  openAIApiKey: string
): Promise<any[]> {
  const processedArticles = [];
  
  for (const article of articles) {
    // Enhanced regional context
    const enhancedArticle = await enhanceWithRegionalContext(article, openAIApiKey);
    
    // Calculate quality metrics
    const qualityScore = calculateContentQuality(enhancedArticle);
    const relevanceScore = calculateRegionalRelevance(enhancedArticle);
    
    processedArticles.push({
      ...enhancedArticle,
      source_id: sourceId,
      region: enhancedArticle.region || 'Unknown',
      processing_status: 'new',
      content_quality_score: qualityScore,
      import_metadata: {
        scraping_method: 'enhanced-scraper',
        regional_relevance_score: relevanceScore,
        content_quality_score: qualityScore,
        enhanced_extraction: true,
        scraped_at: new Date().toISOString()
      }
    });
  }
  
  return processedArticles;
}

async function enhanceWithRegionalContext(article: any, openAIApiKey: string): Promise<any> {
  const prompt = `Enhance this news article with regional context for Eastbourne/East Sussex area:

Title: ${article.title}
Content: ${article.body}

Tasks:
1. Identify primary geographic location
2. Add local significance and community connections
3. Rate regional relevance (1-100) for Eastbourne/East Sussex
4. Extract key local terms and landmarks
5. Determine article category (news, events, business, etc.)

Return JSON:
{
  "enhanced_title": "title with regional context",
  "enhanced_body": "body with local context added",
  "region": "primary location",
  "category": "news category",
  "local_significance": "why this matters locally",
  "regional_relevance": 85,
  "keywords": ["keyword1", "keyword2"],
  "tags": ["tag1", "tag2"]
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
          { 
            role: 'system', 
            content: 'You are an expert at enhancing news articles with regional context for Eastbourne and East Sussex.' 
          },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 1500,
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
        category: enhanced.category,
        keywords: enhanced.keywords,
        tags: enhanced.tags,
        import_metadata: {
          ...article.import_metadata,
          local_significance: enhanced.local_significance,
          regional_relevance: enhanced.regional_relevance
        }
      };
    }
  } catch (error) {
    console.error('Error enhancing regional context:', error);
  }
  
  return article;
}

function calculateContentQuality(article: any): number {
  let score = 0;
  const wordCount = article.word_count || 0;
  const bodyLength = article.body?.length || 0;
  
  // Word count scoring
  if (wordCount >= 200) score += 40;
  else if (wordCount >= 100) score += 25;
  else if (wordCount >= 50) score += 15;
  
  // Content length scoring
  if (bodyLength >= 1000) score += 30;
  else if (bodyLength >= 500) score += 20;
  else if (bodyLength >= 200) score += 10;
  
  // Structure scoring
  if (article.title && article.title.length > 20) score += 15;
  if (article.author) score += 10;
  if (article.category) score += 5;
  
  return Math.min(score, 100);
}

function calculateRegionalRelevance(article: any): number {
  let score = 0;
  const title = article.title.toLowerCase();
  const firstParagraph = article.body.substring(0, 500).toLowerCase(); // First 500 chars
  const fullContent = `${title} ${article.body}`.toLowerCase();
  
  // STRICT: Regional terms must appear in title OR first paragraph (not just anywhere on page)
  const titleContent = `${title} ${firstParagraph}`;
  
  // Eastbourne-specific terms (high value) - must be in title or first paragraph
  const eastbourneTerms = ['eastbourne', 'beachy head', 'pier', 'seafront', 'airshow', 'meads', 'old town', 'devonshire park'];
  eastbourneTerms.forEach(term => {
    if (titleContent.includes(term)) score += 30;
  });
  
  // East Sussex terms (medium value) - must be in title or first paragraph
  const sussexTerms = ['east sussex', 'hastings', 'lewes', 'brighton', 'hove', 'seaford', 'polegate'];
  sussexTerms.forEach(term => {
    if (titleContent.includes(term)) score += 15;
  });
  
  // General local terms (low value) - only if in title/first paragraph 
  const localTerms = ['council', 'local', 'residents', 'community', 'borough'];
  localTerms.forEach(term => {
    if (titleContent.includes(term)) score += 5;
  });

  // Negative scoring for generic/national content in title/first paragraph
  const genericTerms = ['uk wide', 'national', 'england', 'britain', 'london', 'government'];
  genericTerms.forEach(term => {
    if (titleContent.includes(term)) score -= 10;
  });
  
  // Minimum threshold - if score is below 20, reject the article
  return Math.max(0, Math.min(score, 100));
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
    .replace(/&#039;/g, "'")
    .trim();
}
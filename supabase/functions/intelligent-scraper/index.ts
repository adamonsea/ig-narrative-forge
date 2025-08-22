import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import shared utilities
import { ScrapingResult } from '../_shared/types.ts';
import { ScrapingStrategies } from '../_shared/scraping-strategies.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const targetRegion = sourceInfo?.region || 'Eastbourne';
    const startTime = Date.now();
    
    // Initialize scraping strategies and database operations
    const scrapingStrategies = new ScrapingStrategies(targetRegion, sourceInfo);
    const dbOps = new DatabaseOperations(supabase);
    
    // Get intelligent scraping configuration for this source
    const config = await getIntelligentScrapingConfig(sourceUrl, supabase);
    
    let result: ScrapingResult;
    
    // Use AI to determine the best scraping strategy
    const strategy = await determineScrapingStrategy(sourceUrl, config, openAIApiKey);
    console.log(`🧠 AI selected strategy: ${strategy}`);
    
    // Execute the selected strategy
    switch (strategy) {
      case 'rss':
        result = await scrapingStrategies.tryRSSParsing(sourceUrl);
        break;
      case 'html':
        result = await scrapingStrategies.tryHTMLParsing(sourceUrl);
        break;
      default:
        result = await scrapingStrategies.tryFallbackMethod(sourceUrl);
    }
    
    // If the selected strategy fails, try others
    if (!result.success) {
      const fallbackStrategies = ['rss', 'html', 'fallback'].filter(s => s !== strategy);
      
      for (const fallbackStrategy of fallbackStrategies) {
        console.log(`🔄 Primary strategy failed, trying ${fallbackStrategy}...`);
        
        switch (fallbackStrategy) {
          case 'rss':
            result = await scrapingStrategies.tryRSSParsing(sourceUrl);
            break;
          case 'html':
            result = await scrapingStrategies.tryHTMLParsing(sourceUrl);
            break;
          default:
            result = await scrapingStrategies.tryFallbackMethod(sourceUrl);
        }
        
        if (result.success) break;
      }
    }
    
    if (result.success && result.articles.length > 0) {
      // Use AI to analyze and improve content quality
      result.articles = await processArticlesWithAI(result.articles, targetRegion, openAIApiKey);
      
      // Store processed articles
      const storeResults = await dbOps.storeArticles(result.articles, sourceId, targetRegion);
      
      // Update source metrics and save successful strategy for future use
      if (sourceId) {
        const responseTime = Date.now() - startTime;
        await dbOps.updateSourceMetrics(sourceId, result.success, result.method, responseTime);
        
        // Save the successful strategy for this source
        await updateSourceScrapingConfig(sourceId, strategy, supabase);
      }

      // Log successful scraping
      await dbOps.logSystemEvent('info', 'Intelligent scraping completed successfully', {
        sourceUrl,
        sourceId,
        strategy,
        articlesFound: result.articlesFound,
        articlesStored: storeResults.stored,
        duplicates: storeResults.duplicates,
        discarded: storeResults.discarded,
        method: result.method,
        responseTime: Date.now() - startTime
      }, 'intelligent-scraper');

      return new Response(JSON.stringify({
        success: true,
        strategy,
        articlesFound: result.articlesFound,
        articlesScraped: storeResults.stored,
        duplicates: storeResults.duplicates,
        discarded: storeResults.discarded,
        method: result.method,
        responseTime: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('All intelligent scraping strategies failed');
    }

  } catch (error) {
    console.error('❌ Intelligent scraper error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      articlesFound: 0,
      articlesScraped: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Get scraping configuration for a source
async function getIntelligentScrapingConfig(sourceUrl: string, supabase: any): Promise<any> {
  const domain = new URL(sourceUrl).hostname;
  
  // Check if we have stored configuration for this source
  const { data: config } = await supabase
    .from('content_sources')
    .select('scraping_config, scraping_method')
    .ilike('canonical_domain', `%${domain}%`)
    .single();
  
  return config || {
    method: 'auto',
    retryAttempts: 3,
    timeout: 15000
  };
}

// Use AI to determine the best scraping strategy
async function determineScrapingStrategy(sourceUrl: string, config: any, apiKey: string): Promise<string> {
  // If we have a known working method, use it
  if (config.scraping_method && config.scraping_method !== 'auto') {
    return config.scraping_method;
  }
  
  try {
    const prompt = `Analyze this URL and determine the best scraping strategy: ${sourceUrl}

Based on the URL structure and domain, recommend one of these strategies:
1. "rss" - if this appears to be an RSS feed URL or the site likely has RSS feeds
2. "html" - if this is a regular webpage that should be scraped via HTML parsing
3. "fallback" - if this is a complex site that might need multiple approaches

Consider:
- Does the URL contain "rss", "feed", ".xml", or "atom"?
- Is this a known news site that typically has RSS feeds?
- Is this a complex site that might require fallback methods?

Respond with just one word: "rss", "html", or "fallback"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a web scraping expert. Analyze URLs and recommend the best scraping strategy.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      })
    });

    if (response.ok) {
      const result = await response.json();
      const strategy = result.choices[0]?.message?.content?.trim().toLowerCase();
      
      if (['rss', 'html', 'fallback'].includes(strategy)) {
        return strategy;
      }
    }
  } catch (error) {
    console.log(`⚠️ AI strategy selection failed: ${error.message}`);
  }
  
  // Fallback to URL-based heuristics
  if (sourceUrl.includes('rss') || sourceUrl.includes('feed') || sourceUrl.includes('.xml') || sourceUrl.includes('atom')) {
    return 'rss';
  }
  
  return 'html';
}

// Process articles with AI analysis
async function processArticlesWithAI(articles: any[], region: string, apiKey: string): Promise<any[]> {
  const processedArticles = [];
  
  for (const article of articles.slice(0, 2)) { // Limit to 2 articles to control costs
    try {
      console.log(`🧠 AI processing article: ${article.title.substring(0, 50)}...`);
      
      const prompt = `Analyze this news article for regional relevance to ${region} and improve its quality:

Title: ${article.title}
Content: ${article.body.substring(0, 1000)}...

Please:
1. Rate the regional relevance to ${region} (0-100)
2. Identify any local keywords or references
3. Suggest an improved title if needed
4. Provide a quality score (0-100) based on content depth and readability

Return your analysis in JSON format:
{
  "regional_relevance": 85,
  "local_keywords": ["keyword1", "keyword2"],
  "improved_title": "Better Title Here",
  "quality_score": 90,
  "reasoning": "Brief explanation"
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a news analysis expert. Analyze articles for regional relevance and quality.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.2
        })
      });

      if (response.ok) {
        const result = await response.json();
        const analysisText = result.choices[0]?.message?.content;
        
        try {
          const analysis = JSON.parse(analysisText);
          
          processedArticles.push({
            ...article,
            title: analysis.improved_title || article.title,
            regional_relevance_score: analysis.regional_relevance || article.regional_relevance_score,
            content_quality_score: analysis.quality_score || article.content_quality_score,
            import_metadata: {
              ...article.import_metadata,
              ai_analysis: analysis,
              ai_processed: true,
              processing_timestamp: new Date().toISOString()
            }
          });
          
          console.log(`✅ AI analysis completed: relevance ${analysis.regional_relevance}, quality ${analysis.quality_score}`);
        } catch (parseError) {
          processedArticles.push(article);
          console.log(`⚠️ AI analysis parsing failed, using original`);
        }
      } else {
        processedArticles.push(article);
        console.log(`❌ AI analysis API error: ${response.status}`);
      }
      
    } catch (error) {
      processedArticles.push(article);
      console.log(`❌ AI processing error: ${error.message}`);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Add remaining articles without AI processing
  processedArticles.push(...articles.slice(2));
  
  return processedArticles;
}

// Update source scraping configuration
async function updateSourceScrapingConfig(sourceId: string, successfulStrategy: string, supabase: any): Promise<void> {
  try {
    await supabase
      .from('content_sources')
      .update({
        scraping_method: successfulStrategy,
        scraping_config: {
          preferred_method: successfulStrategy,
          last_successful: new Date().toISOString()
        }
      })
      .eq('id', sourceId);
    
    console.log(`📝 Updated scraping config for source: ${successfulStrategy}`);
  } catch (error) {
    console.error(`❌ Failed to update scraping config: ${error.message}`);
  }
}
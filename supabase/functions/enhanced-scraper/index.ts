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
    const { sourceUrl, sourceId, articleUrl } = await req.json();

    console.log('Starting enhanced scraping for:', articleUrl || sourceUrl);

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
    
    // Target URL - either specific article or source URL
    const targetUrl = articleUrl || sourceUrl;
    let result: ScrapingResult;

    // Try different scraping strategies
    if (targetUrl.includes('rss') || targetUrl.includes('feed') || targetUrl.includes('.xml')) {
      result = await scrapingStrategies.tryRSSParsing(targetUrl);
    } else {
      result = await scrapingStrategies.tryHTMLParsing(targetUrl);
    }
    
    // Fallback strategy
    if (!result.success) {
      console.log('🔧 Primary method failed, trying fallback...');
      result = await scrapingStrategies.tryFallbackMethod(targetUrl);
    }
    
    if (result.success && result.articles.length > 0) {
      // Use AI to enhance content quality if available
      if (openAIApiKey) {
        try {
          result.articles = await enhanceArticlesWithAI(result.articles, openAIApiKey);
          console.log(`🤖 AI enhancement completed for ${result.articles.length} articles`);
        } catch (aiError) {
          console.log(`⚠️ AI enhancement failed: ${aiError.message}, proceeding without enhancement`);
        }
      }
      
      // Store enhanced articles
      const storeResults = await dbOps.storeArticles(result.articles, sourceId, targetRegion);
      
      // Update source metrics
      if (sourceId) {
        const responseTime = Date.now() - startTime;
        await dbOps.updateSourceMetrics(sourceId, result.success, result.method, responseTime);
      }

      // Log successful scraping
      await dbOps.logSystemEvent('info', 'Enhanced scraping completed successfully', {
        targetUrl,
        sourceId,
        articlesFound: result.articlesFound,
        articlesStored: storeResults.stored,
        duplicates: storeResults.duplicates,
        discarded: storeResults.discarded,
        method: result.method,
        aiEnhanced: !!openAIApiKey,
        responseTime: Date.now() - startTime
      }, 'enhanced-scraper');

      return new Response(JSON.stringify({
        success: true,
        articlesFound: result.articlesFound,
        articlesScraped: storeResults.stored,
        duplicates: storeResults.duplicates,
        discarded: storeResults.discarded,
        method: result.method,
        aiEnhanced: !!openAIApiKey,
        responseTime: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('No articles could be extracted');
    }

  } catch (error) {
    console.error('❌ Enhanced scraper error:', error);
    
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

// AI enhancement for articles using OpenAI
async function enhanceArticlesWithAI(articles: any[], apiKey: string): Promise<any[]> {
  const enhancedArticles = [];
  
  for (const article of articles.slice(0, 3)) { // Limit to 3 articles to control costs
    try {
      console.log(`🤖 Enhancing article: ${article.title.substring(0, 50)}...`);
      
      const prompt = `Please enhance this news article by improving its structure and readability while maintaining accuracy:

Title: ${article.title}
Content: ${article.body}

Please provide:
1. An improved, more engaging title (if needed)
2. Better structured content with clear paragraphs
3. Keep all factual information intact
4. Improve readability without changing the meaning

Return only the enhanced content in a clean format.`;

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
              content: 'You are a professional news editor. Enhance article quality while maintaining accuracy and factual integrity.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1500,
          temperature: 0.2
        })
      });

      if (response.ok) {
        const result = await response.json();
        const enhancedContent = result.choices[0]?.message?.content;
        
        if (enhancedContent && enhancedContent.length > article.body.length * 0.8) {
          // Use enhanced content if it's substantial
          const wordCount = enhancedContent.split(/\s+/).length;
          
          enhancedArticles.push({
            ...article,
            body: enhancedContent,
            word_count: wordCount,
            content_quality_score: Math.min(wordCount * 2, 100),
            import_metadata: {
              ...article.import_metadata,
              ai_enhanced: true,
              enhancement_timestamp: new Date().toISOString()
            }
          });
          
          console.log(`✅ Article enhanced: ${wordCount} words`);
        } else {
          enhancedArticles.push(article);
          console.log(`⚠️ Enhancement insufficient, using original`);
        }
      } else {
        enhancedArticles.push(article);
        console.log(`❌ AI enhancement API error: ${response.status}`);
      }
      
    } catch (error) {
      enhancedArticles.push(article);
      console.log(`❌ AI enhancement error: ${error.message}`);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Add remaining articles without enhancement
  enhancedArticles.push(...articles.slice(3));
  
  return enhancedArticles;
}
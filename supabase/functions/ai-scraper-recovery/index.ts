import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIRecoveryRequest {
  feedUrl: string;
  sourceId: string;
  region?: string;
  topicId?: string;
  failureType: 'url_not_found' | 'access_denied' | 'parsing_failed' | 'no_content';
  originalError?: string;
}

interface AIRecoveryResult {
  success: boolean;
  method: string;
  articles?: any[];
  articlesFound?: number;
  articlesScraped?: number;
  error?: string;
  suggestedUrl?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!deepseekApiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables');
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Server configuration error',
        method: 'ai_recovery'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region, topicId, failureType, originalError }: AIRecoveryRequest = await req.json();

    if (!feedUrl || !sourceId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters: feedUrl, sourceId',
          method: 'ai_recovery'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🤖 AI Scraper Recovery starting for: ${feedUrl}`);
    console.log(`🔍 Failure type: ${failureType}`);
    console.log(`❌ Original error: ${originalError}`);

    // Get source information
    const { data: source, error: sourceError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      console.error('❌ Failed to fetch source information:', sourceError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Source not found',
          method: 'ai_recovery'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: AIRecoveryResult;

    // Strategy 1: URL Recovery - Try to find working feed URLs
    if (failureType === 'url_not_found' || feedUrl.includes('404') || originalError?.includes('404')) {
      console.log('🔧 Attempting URL recovery...');
      result = await tryUrlRecovery(feedUrl, source, deepseekApiKey);
      
      if (result.success && result.suggestedUrl) {
        // Try scraping with the suggested URL
        console.log(`🔄 Trying suggested URL: ${result.suggestedUrl}`);
        const scrapeResult = await tryAIContentExtraction(result.suggestedUrl, source, region, topicId, deepseekApiKey);
        if (scrapeResult.success) {
          result = scrapeResult;
        }
      }
    } 
    // Strategy 2: Content Extraction - Use AI to extract content when blocked
    else if (failureType === 'access_denied' || failureType === 'parsing_failed' || failureType === 'no_content') {
      console.log('🧠 Attempting AI content extraction...');
      result = await tryAIContentExtraction(feedUrl, source, region, topicId, deepseekApiKey);
    } else {
      // Default: try both strategies
      console.log('🎯 Attempting comprehensive AI recovery...');
      result = await tryAIContentExtraction(feedUrl, source, region, topicId, deepseekApiKey);
    }

    // Store articles if successful
    if (result.success && result.articles && result.articles.length > 0) {
      let storedCount = 0;
      let duplicateCount = 0;

      for (const article of result.articles) {
        try {
          // Check for duplicates
          const { data: existingArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('source_url', article.source_url)
            .single();

          if (existingArticle) {
            duplicateCount++;
            continue;
          }

          // Store article
          const { error } = await supabase
            .from('articles')
            .insert(article);

          if (!error) {
            storedCount++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ Article storage failed: ${errorMessage}`);
        }
      }

      result.articlesScraped = storedCount;
      console.log(`✅ AI Recovery successful: ${storedCount} articles stored, ${duplicateCount} duplicates skipped`);

      // Update source with AI recovery success
      await supabase
        .from('content_sources')
        .update({
          last_scraped_at: new Date().toISOString(),
          articles_scraped: storedCount,
          success_rate: 100,
          scraping_method: 'ai_recovery'
        })
        .eq('id', sourceId);
    }

    // Log the recovery attempt
    await supabase.rpc('log_event', {
      p_level: result.success ? 'info' : 'warn',
      p_message: `AI scraper recovery ${result.success ? 'succeeded' : 'failed'}`,
      p_context: {
        source_id: sourceId,
        source_name: source.source_name,
        feed_url: feedUrl,
        failure_type: failureType,
        recovery_method: result.method,
        articles_found: result.articlesFound || 0,
        articles_stored: result.articlesScraped || 0
      },
      p_function_name: 'ai_scraper_recovery'
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 AI Scraper Recovery error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        method: 'ai_recovery',
        articles: [],
        articlesFound: 0,
        articlesScraped: 0
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Strategy 1: URL Recovery using AI
async function tryUrlRecovery(failedUrl: string, source: any, apiKey: string): Promise<AIRecoveryResult> {
  try {
    const domain = new URL(failedUrl).hostname;
    
    // Import optimized prompt builder
    const { DeepSeekPromptBuilder } = await import('../_shared/prompt-optimization.ts');
    
    const prompt = new DeepSeekPromptBuilder()
      .context(`The RSS/news feed URL "${failedUrl}" for "${source.source_name}" (${domain}) is not working and needs recovery.`)
      .addCriticalPoint(`Focus on the most likely working URLs for ${domain}`)
      .addCriticalPoint('Provide only valid, testable URL suggestions')
      .addInstruction('Analyze common RSS feed URL patterns for this domain', [
        'Standard RSS paths: /feed, /rss, /news/feed, /feed.xml, /atom.xml',
        'News-specific paths: /news/rss, /articles/feed, /blog/feed',
        'Domain-specific variations and subdomain possibilities',
        'Alternative feed formats (Atom, RSS2.0) and extensions'
      ])
      .addInstruction('Generate prioritized URL suggestions', [
        'Provide 3-5 most likely working alternatives',
        'Order suggestions by probability of success',
        'Consider the source name and typical news site structures',
        'Include brief technical reasoning for each suggestion'
      ])
      .outputFormat('JSON object with suggestedUrls array and reasoning string', {
        suggestedUrls: ['string (complete URLs)'],
        reasoning: 'string (brief explanation of selection logic)'
      })
      .build();

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    try {
      const urlSuggestions = JSON.parse(aiResponse);
      console.log(`🔍 AI suggested URLs:`, urlSuggestions.suggestedUrls);
      
      return {
        success: true,
        method: 'url_recovery',
        suggestedUrl: urlSuggestions.suggestedUrls[0],
        articlesFound: 0,
        articlesScraped: 0
      };
    } catch {
      // Fallback: extract URLs from response text
      const urlPattern = /https?:\/\/[^\s<>"']+/g;
      const urls = aiResponse.match(urlPattern) || [];
      
      return {
        success: urls.length > 0,
        method: 'url_recovery',
        suggestedUrl: urls[0],
        articlesFound: 0,
        articlesScraped: 0
      };
    }
  } catch (error) {
    console.error('❌ URL recovery failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      method: 'url_recovery_failed',
      error: errorMessage
    };
  }
}

// Strategy 2: AI Content Extraction
async function tryAIContentExtraction(url: string, source: any, region?: string, topicId?: string, apiKey?: string): Promise<AIRecoveryResult> {
  try {
    console.log(`🧠 AI extracting content from: ${url}`);
    
    // Fetch the webpage with enhanced headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 Fetched ${html.length} characters for AI analysis`);

    // Use optimized DeepSeek prompt for content extraction
    const { DeepSeekPromptBuilder } = await import('../_shared/prompt-optimization.ts');
    
    const prompt = new DeepSeekPromptBuilder()
      .context(`Extract structured news article data from this HTML webpage content:\n\nHTML Content:\n${html.substring(0, 15000)}...`)
      .addCriticalPoint('Focus on complete, substantial articles with meaningful content (minimum 100 words)')
      .addCriticalPoint('Extract up to 10 recent news articles maximum')
      .addInstruction('Identify and extract article elements from HTML', [
        'Article headlines/titles (look for <h1>, <h2>, title tags)',
        'Full article body content (exclude navigation, ads, sidebars)',
        'Author bylines and publication information',
        'Publication timestamps and dates',
        'Direct article URLs and canonical links'
      ])
      .addInstruction('Structure the extracted content', [
        'Ensure each article has substantial content (100+ words minimum)',
        'Clean HTML tags and formatting artifacts',
        'Preserve paragraph breaks and content structure',
        'Format dates in ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)'
      ])
      .addInstruction('Quality control and validation', [
        'Skip promotional content, navigation, or advertisement text',
        'Verify articles are news content, not category pages',
        'Ensure article URLs are complete and valid',
        'Prioritize recent articles over older archived content'
      ])
      .outputFormat('JSON array of article objects', {
        type: 'array',
        maxItems: 10,
        items: {
          title: 'string (clear headline)',
          content: 'string (full article text, 100+ words)',
          author: 'string|null (author name if available)',
          published_at: 'string (ISO date format)',
          article_url: 'string (direct article link)'
        }
      })
      .build();

    const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`DeepSeek API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const extractedContent = aiData.choices[0].message.content;
    
    console.log('🤖 AI extraction response:', extractedContent.substring(0, 200));

    // Parse AI response
    let articles;
    try {
      // Try to parse as JSON
      const jsonMatch = extractedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        articles = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array found in response');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('❌ Failed to parse AI response as JSON:', errorMessage);
      return {
        success: false,
        method: 'ai_extraction_failed',
        error: 'Failed to parse AI response',
        articlesFound: 0,
        articlesScraped: 0
      };
    }

    // Process and validate articles
    const processedArticles = [];
    
    for (const article of articles) {
      if (!article.title || !article.content || article.content.length < 100) {
        continue;
      }

      const processedArticle = {
        title: article.title.trim(),
        body: article.content.trim(),
        author: article.author || null,
        published_at: article.published_at || new Date().toISOString(),
        source_url: article.article_url || url,
        canonical_url: article.article_url || url,
        word_count: article.content.split(/\s+/).length,
        regional_relevance_score: calculateRegionalRelevance(article.content, article.title, region),
        content_quality_score: calculateContentQuality(article.content, article.title),
        processing_status: 'new' as const,
        source_id: source.id,
        topic_id: topicId,
        region: region,
        import_metadata: {
          extraction_method: 'ai_recovery',
          scrape_timestamp: new Date().toISOString(),
          extractor_version: '1.0',
          ai_extracted: true
        }
      };

      processedArticles.push(processedArticle);
    }

    console.log(`✅ AI extracted ${processedArticles.length} articles`);

    return {
      success: processedArticles.length > 0,
      method: 'ai_content_extraction',
      articles: processedArticles,
      articlesFound: articles.length,
      articlesScraped: 0 // Will be set after database storage
    };

  } catch (error) {
    console.error('❌ AI content extraction failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      method: 'ai_extraction_failed',
      error: errorMessage,
      articlesFound: 0,
      articlesScraped: 0
    };
  }
}

// Helper functions
function calculateRegionalRelevance(content: string, title: string, region?: string): number {
  if (!region) return 50;
  
  const text = `${title} ${content}`.toLowerCase();
  const regionLower = region.toLowerCase();
  
  let score = 10;
  if (text.includes(regionLower)) score += 30;
  if (text.includes('local')) score += 15;
  if (text.includes('council') || text.includes('borough')) score += 10;
  
  return Math.min(100, score);
}

function calculateContentQuality(content: string, title: string): number {
  const wordCount = content.split(/\s+/).length;
  let score = 30;
  
  if (wordCount > 100) score += 20;
  if (wordCount > 300) score += 20;
  if (title.length > 10) score += 10;
  if (content.includes('.') && content.includes(',')) score += 10;
  if (wordCount > 500) score += 10;
  
  return Math.min(100, score);
}
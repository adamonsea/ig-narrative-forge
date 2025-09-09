import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScreenshotScrapingResult {
  success: boolean;
  articles: any[];
  articlesFound: number;
  articlesScraped: number;
  errors: string[];
  method: string;
  cost?: number;
  screenshotUrl?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!deepseekApiKey) {
    return new Response(
      JSON.stringify({ error: 'DeepSeek API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, region } = await req.json();

    if (!feedUrl || !sourceId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: feedUrl and sourceId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📸 Starting screenshot scraping for: ${feedUrl}`);

    // Take screenshot of the website
    const screenshotResult = await takeScreenshot(feedUrl);
    if (!screenshotResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: [`Screenshot failed: ${screenshotResult.error}`],
          method: 'screenshot-ai'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📸 Screenshot taken successfully, extracting content with DeepSeek...`);

    // Extract content using DeepSeek Vision API
    const extractionResult = await extractContentWithDeepSeek(
      screenshotResult.screenshotBase64!,
      feedUrl
    );

    if (!extractionResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          articles: [],
          articlesFound: 0,
          articlesScraped: 0,
          errors: [`DeepSeek extraction failed: ${extractionResult.error}`],
          method: 'screenshot-ai',
          cost: extractionResult.cost || 0
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const articles = extractionResult.articles || [];

    // Store articles in database if any were extracted
    let storedCount = 0;
    if (articles.length > 0) {
      const { data: insertedArticles, error: insertError } = await supabase
        .from('articles')
        .insert(articles)
        .select('id');

      if (insertError) {
        console.error('Error storing articles:', insertError);
      } else {
        storedCount = insertedArticles?.length || 0;
        console.log(`✅ Stored ${storedCount} articles from screenshot extraction`);
      }
    }

    // Log the successful extraction
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Screenshot AI scraping completed successfully',
      context: {
        source_id: sourceId,
        feed_url: feedUrl,
        articles_found: articles.length,
        articles_stored: storedCount,
        method: 'screenshot-ai',
        cost: extractionResult.cost || 0
      },
      function_name: 'screenshot-ai-scraper'
    });

    return new Response(
      JSON.stringify({
        success: true,
        articles: articles,
        articlesFound: articles.length,
        articlesScraped: storedCount,
        errors: [],
        method: 'screenshot-ai',
        cost: extractionResult.cost || 0,
        screenshotUrl: screenshotResult.screenshotUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Screenshot AI scraper error:', error);
    
    await supabase.from('system_logs').insert({
      level: 'error',
      message: 'Screenshot AI scraper failed',
      context: {
        error: error.message,
        stack: error.stack
      },
      function_name: 'screenshot-ai-scraper'
    });

    return new Response(
      JSON.stringify({
        success: false,
        articles: [],
        articlesFound: 0,
        articlesScraped: 0,
        errors: [error.message],
        method: 'screenshot-ai'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function takeScreenshot(url: string): Promise<{
  success: boolean;
  screenshotBase64?: string;
  screenshotUrl?: string;
  error?: string;
}> {
  try {
    console.log(`📸 Taking screenshot of: ${url}`);
    
    // Get ScreenshotAPI token from environment
    const screenshotApiToken = Deno.env.get('SCREENSHOTAPI_TOKEN');
    if (!screenshotApiToken) {
      throw new Error('SCREENSHOTAPI_TOKEN environment variable not set');
    }
    
    // Use ScreenshotAPI.net to take screenshot
    const screenshotApiUrl = `https://shot.screenshotapi.net/screenshot`;
    const screenshotParams = new URLSearchParams({
      token: screenshotApiToken,
      url: url,
      width: '1920',
      height: '1080',
      output: 'base64',
      file_type: 'png',
      wait_for_event: 'load',
      delay: '2000' // Wait 2 seconds for content to load
    });
    
    const response = await fetch(`${screenshotApiUrl}?${screenshotParams.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`ScreenshotAPI failed: ${response.status} ${response.statusText}`);
    }

    const screenshotBase64 = await response.text();
    
    // Validate the response is actually base64 image data
    if (!screenshotBase64 || screenshotBase64.length < 100) {
      throw new Error('Invalid screenshot response - data too short');
    }
    
    return {
      success: true,
      screenshotBase64: screenshotBase64,
      screenshotUrl: `data:image/png;base64,${screenshotBase64}`
    };

  } catch (error) {
    console.error('Screenshot error:', error);
    
    // Fallback to traditional web scraping if screenshot fails
    try {
      console.log('🔄 Screenshot failed, attempting web scraping fallback...');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        success: false,
        error: `Screenshot service unavailable. Traditional scraping should be used instead. Error: ${error.message}`
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        error: `Both screenshot and fallback failed. Screenshot: ${error.message}. Fallback: ${fallbackError.message}`
      };
    }
  }
}

async function extractContentWithDeepSeek(
  screenshotBase64: string,
  sourceUrl: string
): Promise<{
  success: boolean;
  articles?: any[];
  cost?: number;
  error?: string;
}> {
  try {
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    const prompt = `You are an expert web content extractor. Analyze this screenshot of a news website and extract ALL visible news articles.

For each article you find, extract:
1. Title (headline)
2. Body/description/summary (any visible text content)
3. Author (if visible)
4. Publication date (if visible)
5. Article URL (if you can see any links or if it's mentioned)

Return the results as a JSON array with this exact structure:
[
  {
    "title": "Article title here",
    "body": "Article content/description here",
    "author": "Author name or null",
    "published_at": "2024-01-01T00:00:00Z or null",
    "source_url": "${sourceUrl}",
    "word_count": 100,
    "regional_relevance_score": 75,
    "content_quality_score": 80,
    "processing_status": "new",
    "import_metadata": {
      "extraction_method": "screenshot_ai",
      "ai_provider": "deepseek",
      "screenshot_timestamp": "${new Date().toISOString()}"
    }
  }
]

IMPORTANT: 
- Only extract actual news articles, not navigation, ads, or other page elements
- If you can't see clear article content, return an empty array
- Make reasonable estimates for quality and relevance scores (50-90)
- Calculate approximate word count based on visible text
- Return valid JSON only, no other text`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-vl',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${screenshotBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const extractedContent = data.choices[0]?.message?.content;

    if (!extractedContent) {
      throw new Error('No content extracted from DeepSeek response');
    }

    console.log('📄 DeepSeek extracted content:', extractedContent);

    // Parse the JSON response
    let articles;
    try {
      articles = JSON.parse(extractedContent);
    } catch (parseError) {
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = extractedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        articles = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse DeepSeek JSON response: ${parseError.message}`);
      }
    }

    if (!Array.isArray(articles)) {
      throw new Error('DeepSeek response is not an array of articles');
    }

    // Estimate cost (DeepSeek is very cheap, approximately $0.0014 per 1K tokens)
    const estimatedTokens = prompt.length / 4 + 1000; // Rough estimate
    const estimatedCost = (estimatedTokens / 1000) * 0.0014;

    console.log(`✅ DeepSeek extracted ${articles.length} articles (estimated cost: $${estimatedCost.toFixed(4)})`);

    return {
      success: true,
      articles: articles,
      cost: estimatedCost
    };

  } catch (error) {
    console.error('DeepSeek extraction error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
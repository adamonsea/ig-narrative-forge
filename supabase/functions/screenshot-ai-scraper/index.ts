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

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!openaiApiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
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

    console.log(`📸 Screenshot taken successfully, extracting content with OpenAI...`);

    // Extract content using OpenAI Vision API
    const extractionResult = await extractContentWithOpenAI(
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
          errors: [`OpenAI extraction failed: ${extractionResult.error}`],
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

async function extractContentWithOpenAI(
  screenshotBase64: string,
  sourceUrl: string
): Promise<{
  success: boolean;
  articles?: any[];
  cost?: number;
  error?: string;
}> {
  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Validate and optimize image size
    const optimizedBase64 = await optimizeImageSize(screenshotBase64);
    
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
      "ai_provider": "openai",
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

    console.log(`🔍 Sending request to OpenAI with image size: ${Math.round(optimizedBase64.length * 0.75)} bytes`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
                  url: `data:image/png;base64,${optimizedBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 4000
      })
    });

    const responseText = await response.text();
    console.log(`📡 OpenAI API Response Status: ${response.status}`);
    
    if (!response.ok) {
      console.error('❌ OpenAI API Error Response:', responseText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}. Response: ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse OpenAI response:', responseText);
      throw new Error(`Failed to parse OpenAI JSON response: ${parseError.message}`);
    }

    const extractedContent = data.choices?.[0]?.message?.content;

    if (!extractedContent) {
      console.error('❌ No content in OpenAI response:', data);
      throw new Error('No content extracted from OpenAI response');
    }

    console.log('📄 OpenAI extracted content:', extractedContent.substring(0, 500) + '...');

    // Parse the JSON response
    let articles;
    try {
      articles = JSON.parse(extractedContent);
    } catch (parseError) {
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = extractedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          articles = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          console.error('❌ Failed to parse extracted JSON:', jsonMatch[0]);
          throw new Error(`Failed to parse extracted JSON: ${secondParseError.message}`);
        }
      } else {
        console.error('❌ No JSON array found in response:', extractedContent);
        throw new Error(`No valid JSON array found in OpenAI response. Content: ${extractedContent.substring(0, 200)}...`);
      }
    }

    if (!Array.isArray(articles)) {
      console.error('❌ OpenAI response is not an array:', articles);
      throw new Error('OpenAI response is not an array of articles');
    }

    // Estimate cost for GPT-4o-mini (input: $0.15/1M tokens, output: $0.6/1M tokens)
    const inputTokens = Math.ceil((prompt.length + optimizedBase64.length * 0.00085) / 4); // Vision tokens calculated differently
    const outputTokens = Math.ceil(extractedContent.length / 4);
    const estimatedCost = (inputTokens * 0.15 / 1000000) + (outputTokens * 0.6 / 1000000);

    console.log(`✅ OpenAI extracted ${articles.length} articles (estimated cost: $${estimatedCost.toFixed(6)})`);

    return {
      success: true,
      articles: articles,
      cost: estimatedCost
    };

  } catch (error) {
    console.error('OpenAI extraction error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function optimizeImageSize(base64Image: string): Promise<string> {
  try {
    // Check if image is too large (>20MB base64 = ~15MB actual for OpenAI)
    const imageSizeBytes = (base64Image.length * 3) / 4;
    const maxSizeBytes = 20 * 1024 * 1024; // 20MB limit for OpenAI Vision
    
    console.log(`🖼️ Original image size: ${Math.round(imageSizeBytes / 1024)} KB`);
    
    if (imageSizeBytes > maxSizeBytes) {
      console.log(`⚠️ Image too large (${Math.round(imageSizeBytes / 1024 / 1024)} MB), would need compression`);
      // For now, just truncate if too large - in production would implement actual image resize
      const maxBase64Length = Math.floor((maxSizeBytes * 4) / 3);
      const truncated = base64Image.substring(0, maxBase64Length);
      console.log(`📏 Truncated to ${Math.round(truncated.length * 0.75 / 1024)} KB`);
      return truncated;
    }
    
    return base64Image;
  } catch (error) {
    console.log(`⚠️ Image optimization failed: ${error.message}, using original`);
    return base64Image;
  }
}
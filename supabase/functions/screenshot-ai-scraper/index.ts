import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

interface ScreenshotScrapingResult {
  success: boolean;
  articles?: any[];
  cost?: number;
  screenshotUrl?: string;
  error?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Progressive logging function to track function execution
async function logProgress(supabase: any, step: string, status: 'start' | 'success' | 'error', details?: any) {
  try {
    await supabase.from('system_logs').insert({
      level: status === 'error' ? 'error' : 'info',
      message: `Screenshot AI Scraper - ${step}: ${status}`,
      context: { 
        step,
        status,
        details,
        timestamp: new Date().toISOString()
      },
      function_name: 'screenshot-ai-scraper-debug'
    });
    console.log(`📊 [${step}] ${status.toUpperCase()}:`, details || '');
  } catch (logError) {
    console.error('Failed to log progress:', logError);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  const screenshotApiToken = Deno.env.get('SCREENSHOTAPI_TOKEN');

  // Create supabase client early for logging
  let supabase;
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  } catch (clientError) {
    console.error('Failed to create Supabase client:', clientError);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Failed to create Supabase client: ${clientError.message}`,
        debug: 'Check Supabase configuration'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    await logProgress(supabase, 'function-start', 'start', { 
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseServiceKey,
      hasOpenAI: !!openaiApiKey,
      hasScreenshotAPI: !!screenshotApiToken
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      await logProgress(supabase, 'config-check', 'error', 'Missing Supabase configuration');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logProgress(supabase, 'request-parsing', 'start');
    const requestBody = await req.json();
    const { feedUrl, sourceId, region } = requestBody;
    
    await logProgress(supabase, 'request-parsing', 'success', { feedUrl, sourceId, region });

    if (!feedUrl) {
      await logProgress(supabase, 'validation', 'error', 'Missing feedUrl parameter');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing feedUrl parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logProgress(supabase, 'validation', 'success', 'All required parameters present');

    // Take screenshot with enhanced error handling
    await logProgress(supabase, 'screenshot', 'start', { url: feedUrl });
    const screenshotResult = await takeScreenshot(feedUrl, supabase);
    
    if (!screenshotResult.success) {
      await logProgress(supabase, 'screenshot', 'error', screenshotResult.error);
      
      // Test URL accessibility as fallback
      try {
        await logProgress(supabase, 'fallback-test', 'start');
        const fallbackResponse = await fetch(feedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        await logProgress(supabase, 'fallback-test', 'success', { 
          status: fallbackResponse.status,
          accessible: fallbackResponse.ok 
        });
      } catch (fallbackError) {
        await logProgress(supabase, 'fallback-test', 'error', fallbackError.message);
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Screenshot failed: ${screenshotResult.error}`,
          fallback_attempted: true 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logProgress(supabase, 'screenshot', 'success', { 
      imageSize: screenshotResult.screenshotBase64?.length 
    });

    // Check if OpenAI key is available
    if (!openaiApiKey) {
      await logProgress(supabase, 'ai-extraction', 'error', 'No OpenAI API key available');
      return new Response(
        JSON.stringify({ 
          success: true, 
          screenshotUrl: screenshotResult.screenshotUrl,
          articles: [],
          message: 'Screenshot captured but no AI extraction performed (missing OpenAI key)'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract content with AI
    await logProgress(supabase, 'ai-extraction', 'start');
    const extractionResult = await extractContentWithOpenAI(
      screenshotResult.screenshotBase64!, 
      feedUrl,
      supabase
    );

    if (!extractionResult.success) {
      await logProgress(supabase, 'ai-extraction', 'error', extractionResult.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `AI extraction failed: ${extractionResult.error}`,
          screenshotUrl: screenshotResult.screenshotUrl
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { articles, cost } = extractionResult;
    await logProgress(supabase, 'ai-extraction', 'success', { 
      articlesCount: articles.length,
      cost 
    });

    // Store articles in database
    if (articles.length > 0) {
      await logProgress(supabase, 'database-insert', 'start', { count: articles.length });
      
      const articlesToInsert = articles.map((article: any) => ({
        title: article.title || 'Untitled',
        body: article.body || '',
        author: article.author || null,
        published_at: article.date ? new Date(article.date).toISOString() : null,
        source_url: article.url || feedUrl,
        content_quality_score: 75,
        regional_relevance_score: region ? 50 : 0,
        processing_status: 'new',
        import_metadata: {
          extraction_method: 'screenshot_ai',
          cost_usd: cost || 0,
          screenshot_url: screenshotResult.screenshotUrl,
          source_id: sourceId,
          extracted_at: new Date().toISOString()
        }
      }));

      const { data: insertedArticles, error: insertError } = await supabase
        .from('articles')
        .insert(articlesToInsert)
        .select();

      if (insertError) {
        await logProgress(supabase, 'database-insert', 'error', insertError.message);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Database insert failed: ${insertError.message}`,
            articles,
            cost,
            screenshotUrl: screenshotResult.screenshotUrl
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logProgress(supabase, 'database-insert', 'success', { 
        insertedCount: insertedArticles?.length || 0 
      });
    }

    await logProgress(supabase, 'function-complete', 'success', {
      articlesExtracted: articles.length,
      cost: cost || 0
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        articles,
        articlesFound: articles.length,
        cost,
        screenshotUrl: screenshotResult.screenshotUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Critical function error:', error);
    console.error('💥 Stack trace:', error.stack);
    
    // Always log critical errors
    try {
      await logProgress(supabase, 'critical-error', 'error', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    } catch (logError) {
      console.error('💥 Failed to log critical error:', logError);
    }
    
    // Always return a proper response, never let the function crash
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Critical error: ${error.message}`,
        timestamp: new Date().toISOString(),
        debug: 'Check system_logs table for detailed error information'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function takeScreenshot(url: string, supabase?: any): Promise<{
  success: boolean;
  screenshotBase64?: string;
  screenshotUrl?: string;
  error?: string;
}> {
  try {
    if (supabase) await logProgress(supabase, 'screenshot-api-call', 'start', { url });
    
    // Get ScreenshotAPI token from environment
    const screenshotApiToken = Deno.env.get('SCREENSHOTAPI_TOKEN');
    if (!screenshotApiToken) {
      console.error('❌ SCREENSHOTAPI_TOKEN not found in environment variables');
      throw new Error('SCREENSHOTAPI_TOKEN environment variable not set');
    }
    
    console.log(`✅ ScreenshotAPI token found (length: ${screenshotApiToken.length})`);
    
    // Use smaller dimensions to reduce memory usage and improve performance
    const screenshotApiUrl = `https://shot.screenshotapi.net/screenshot`;
    const screenshotParams = new URLSearchParams({
      token: screenshotApiToken,
      url: url,
      width: '1280',      // Reduced from 1920
      height: '800',      // Reduced from 1080
      output: 'json',     // Request JSON response with URL
      file_type: 'png',
      wait_for_event: 'load',
      delay: '1000',      // Reduced from 2000
      fresh: 'true'       // Bypass cache for testing
    });
    
    const fullUrl = `${screenshotApiUrl}?${screenshotParams.toString()}`;
    console.log(`📡 Making request to ScreenshotAPI with reduced dimensions`);
    
    if (supabase) await logProgress(supabase, 'screenshot-api-call', 'start', { 
      dimensions: '1280x800',
      output: 'json'
    });
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; eeZee-News-Scraper/1.0)'
      }
    });
    
    clearTimeout(timeoutId);

    console.log(`📡 ScreenshotAPI Response Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ ScreenshotAPI Error Response: ${errorText}`);
      if (supabase) await logProgress(supabase, 'screenshot-api-call', 'error', { 
        status: response.status,
        error: errorText 
      });
      throw new Error(`ScreenshotAPI failed: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    console.log(`📸 Screenshot response received. Length: ${responseText.length} characters`);
    
    if (supabase) await logProgress(supabase, 'screenshot-response-parse', 'start', {
      responseLength: responseText.length
    });
    
    // Parse JSON response
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(responseText);
    } catch (parseError) {
      if (supabase) await logProgress(supabase, 'screenshot-response-parse', 'error', 'Invalid JSON');
      throw new Error(`Invalid JSON response from ScreenshotAPI: ${parseError.message}`);
    }
    
    if (!jsonResponse.screenshot) {
      if (supabase) await logProgress(supabase, 'screenshot-response-parse', 'error', 'No screenshot URL');
      throw new Error('No screenshot URL in response');
    }
    
    console.log('📸 Got screenshot URL from ScreenshotAPI:', jsonResponse.screenshot);
    
    if (supabase) await logProgress(supabase, 'screenshot-download', 'start', {
      screenshotUrl: jsonResponse.screenshot
    });
    
    // Fetch the actual image with timeout
    const imageController = new AbortController();
    const imageTimeoutId = setTimeout(() => imageController.abort(), 20000); // 20 second timeout
    
    const imageResponse = await fetch(jsonResponse.screenshot, {
      signal: imageController.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; eeZee-News-Scraper/1.0)'
      }
    });
    
    clearTimeout(imageTimeoutId);
    
    if (!imageResponse.ok) {
      if (supabase) await logProgress(supabase, 'screenshot-download', 'error', imageResponse.status);
      throw new Error(`Failed to fetch screenshot from URL: ${imageResponse.status}`);
    }
    
    // Convert to base64 with size limits
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageSizeMB = imageBuffer.byteLength / (1024 * 1024);
    
    console.log(`📸 Image downloaded. Size: ${imageSizeMB.toFixed(2)} MB`);
    
    if (imageSizeMB > 20) {
      if (supabase) await logProgress(supabase, 'screenshot-download', 'error', `Image too large: ${imageSizeMB.toFixed(2)} MB`);
      throw new Error(`Image too large for processing: ${imageSizeMB.toFixed(2)} MB (max 20MB)`);
    }
    
    // Use more memory-efficient base64 conversion
    const chunks = [];
    const uint8Array = new Uint8Array(imageBuffer);
    const chunkSize = 8192;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      chunks.push(String.fromCharCode(...chunk));
    }
    
    const base64Image = btoa(chunks.join(''));
    const screenshotUrl = `data:image/png;base64,${base64Image}`;
    
    if (supabase) await logProgress(supabase, 'screenshot-download', 'success', {
      imageSizeMB: imageSizeMB.toFixed(2),
      base64Length: base64Image.length
    });
    
    console.log(`✅ Screenshot processed successfully. Size: ${imageSizeMB.toFixed(2)} MB`);
    
    return {
      success: true,
      screenshotBase64: base64Image,
      screenshotUrl: screenshotUrl
    };

  } catch (error) {
    console.error('💥 Screenshot error:', error);
    
    if (supabase) await logProgress(supabase, 'screenshot-error', 'error', {
      message: error.message,
      type: error.name
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

async function extractContentWithOpenAI(
  screenshotBase64: string,
  sourceUrl: string,
  supabase?: any
): Promise<{
  success: boolean;
  articles?: any[];
  cost?: number;
  error?: string;
}> {
  try {
    if (supabase) await logProgress(supabase, 'openai-setup', 'start');
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    console.log(`🤖 Starting OpenAI content extraction...`);
    console.log(`📸 Input screenshot size: ${screenshotBase64.length} characters`);
    
    // Validate screenshot data
    if (!screenshotBase64 || screenshotBase64.length < 100) {
      throw new Error(`Invalid screenshot data. Length: ${screenshotBase64?.length || 0}`);
    }
    
    if (supabase) await logProgress(supabase, 'openai-setup', 'success', {
      screenshotSize: screenshotBase64.length
    });
    
    // Check base64 size limits for OpenAI (20MB limit)
    const imageSizeMB = (screenshotBase64.length * 0.75) / (1024 * 1024);
    if (imageSizeMB > 19) {
      if (supabase) await logProgress(supabase, 'openai-image-validation', 'error', `Image too large: ${imageSizeMB.toFixed(2)} MB`);
      throw new Error(`Image too large for OpenAI: ${imageSizeMB.toFixed(2)} MB (max 19MB)`);
    }
    
    if (supabase) await logProgress(supabase, 'openai-api-call', 'start', {
      imageSizeMB: imageSizeMB.toFixed(2)
    });
    
    const prompt = `Analyze this screenshot of a news website and extract ALL visible news articles.

For each article, return JSON with:
- title: The headline
- body: Any visible description/summary text
- author: Author name if visible, or null
- date: Publication date if visible, or null
- url: The source URL provided

Return as JSON array:
[{"title": "...", "body": "...", "author": null, "date": null, "url": "${sourceUrl}"}]

Extract only actual news articles, not navigation or ads. If no clear articles are visible, return empty array [].`;

    const requestBody = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${screenshotBase64}` }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    };
    
    console.log(`📡 Making request to OpenAI API...`);
    
    // Add timeout for OpenAI request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    clearTimeout(timeoutId);

    console.log(`📡 OpenAI API Response Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API Error Response:', errorText);
      if (supabase) await logProgress(supabase, 'openai-api-call', 'error', { 
        status: response.status,
        error: errorText 
      });
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const extractedContent = data.choices?.[0]?.message?.content;
    
    if (!extractedContent) {
      if (supabase) await logProgress(supabase, 'openai-api-call', 'error', 'No content in response');
      throw new Error('No content extracted from OpenAI response');
    }
    
    if (supabase) await logProgress(supabase, 'openai-response-parse', 'start', {
      contentLength: extractedContent.length
    });
    
    console.log('📄 OpenAI extracted content length:', extractedContent.length);
    
    // Parse the JSON response with better error handling
    let articles;
    try {
      articles = JSON.parse(extractedContent);
    } catch (parseError) {
      // Try to extract JSON array from the response
      const jsonMatch = extractedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          articles = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          if (supabase) await logProgress(supabase, 'openai-response-parse', 'error', 'Failed to parse JSON');
          throw new Error(`Failed to parse extracted JSON: ${secondParseError.message}`);
        }
      } else {
        if (supabase) await logProgress(supabase, 'openai-response-parse', 'error', 'No JSON array found');
        throw new Error('No valid JSON array found in OpenAI response');
      }
    }
    
    if (!Array.isArray(articles)) {
      if (supabase) await logProgress(supabase, 'openai-response-parse', 'error', 'Response not an array');
      throw new Error('OpenAI response is not an array of articles');
    }
    
    // Calculate cost estimation
    const inputTokens = Math.ceil((prompt.length + (screenshotBase64.length * 0.1)) / 4);
    const outputTokens = Math.ceil(extractedContent.length / 4);
    const estimatedCost = (inputTokens * 0.00015) + (outputTokens * 0.0006); // gpt-4o-mini pricing
    
    if (supabase) await logProgress(supabase, 'openai-response-parse', 'success', {
      articlesFound: articles.length,
      estimatedCost: estimatedCost.toFixed(4)
    });
    
    console.log(`✅ Successfully extracted ${articles.length} articles`);
    console.log(`💰 Estimated cost: $${estimatedCost.toFixed(4)}`);
    
    return {
      success: true,
      articles: articles,
      cost: estimatedCost
    };

  } catch (error) {
    console.error('💥 OpenAI extraction error:', error);
    
    if (supabase) await logProgress(supabase, 'openai-error', 'error', {
      message: error.message,
      type: error.name
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}
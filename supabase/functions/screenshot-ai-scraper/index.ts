import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

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

// Safe date parsing function to handle various date formats
function safeParseDateString(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  // Clean the date string
  const cleaned = dateStr.trim();
  
  try {
    // Try direct parsing first
    const directParse = new Date(cleaned);
    if (!isNaN(directParse.getTime())) {
      return directParse;
    }

    // Handle relative dates like "2 hours ago", "yesterday", etc.
    const now = new Date();
    const lowerStr = cleaned.toLowerCase();
    
    if (lowerStr.includes('hour') && lowerStr.includes('ago')) {
      const hours = parseInt(lowerStr.match(/(\d+)\s*hour/)?.[1] || '0');
      return new Date(now.getTime() - (hours * 60 * 60 * 1000));
    }
    
    if (lowerStr.includes('minute') && lowerStr.includes('ago')) {
      const minutes = parseInt(lowerStr.match(/(\d+)\s*minute/)?.[1] || '0');
      return new Date(now.getTime() - (minutes * 60 * 1000));
    }
    
    if (lowerStr === 'yesterday') {
      return new Date(now.getTime() - (24 * 60 * 60 * 1000));
    }
    
    if (lowerStr === 'today') {
      return new Date();
    }

    // Try parsing different formats
    const formats = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // MM/DD/YYYY
      /(\d{4})-(\d{2})-(\d{2})/,        // YYYY-MM-DD
      /(\d{1,2})-(\d{1,2})-(\d{4})/     // DD-MM-YYYY
    ];

    for (const format of formats) {
      const match = cleaned.match(format);
      if (match) {
        const parsed = new Date(cleaned);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Date parsing error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

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
        error: `Failed to create Supabase client: ${clientError instanceof Error ? clientError.message : String(clientError)}`,
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
    const { feedUrl, sourceId, region, individualArticle = false } = requestBody;
    
    await logProgress(supabase, 'request-parsing', 'success', { feedUrl, sourceId, region, individualArticle });

    // Validate that this is an individual article URL, not an index page
    if (!individualArticle && isIndexPage(feedUrl)) {
      console.log('🚫 Index page detected - screenshot scraper should not be used for index pages');
      await logProgress(supabase, 'validation', 'error', 'Index page rejected');
      return new Response(JSON.stringify({
        success: false,
        error: 'Screenshot scraper should only be used for individual article pages, not index/listing pages',
        articlesExtracted: 0,
        articlesInserted: 0,
        duplicatesFound: 0,
        cost: 0,
        recommendation: 'Use discover-article-urls service for index pages'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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
        await logProgress(supabase, 'fallback-test', 'error', fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
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
      articlesCount: articles?.length || 0,
      cost 
    });

    // Initialize variables at function level to avoid scope issues
    let insertedCount = 0;
    let duplicateCount = 0;
    let actualErrors = [];
    let successfullyInserted = [];

    // Store articles in database
    if (articles && articles.length > 0) {
      await logProgress(supabase, 'database-insert', 'start', { count: articles.length });
      
      const articlesToInsert = articles.map((article: any) => {
        // Safe date parsing with detailed logging
        let parsedDate = null;
        if (article.date) {
          const safeDate = safeParseDateString(article.date);
          parsedDate = safeDate ? safeDate.toISOString() : null;
          
          // Log date parsing for debugging
          console.log(`📅 Date parsing: "${article.date}" -> ${parsedDate ? 'SUCCESS' : 'FAILED'}`);
        }

        return {
          title: article.title || 'Untitled',
          body: article.body || '',
          author: article.author || null,
          published_at: parsedDate,
          source_url: article.url || feedUrl,
          content_quality_score: 75,
          regional_relevance_score: region ? 50 : 0,
          processing_status: 'new',
          import_metadata: {
            extraction_method: 'screenshot_ai',
            cost_usd: cost || 0,
            screenshot_url: screenshotResult.screenshotUrl,
            source_id: sourceId,
            extracted_at: new Date().toISOString(),
            date_parsing_info: {
              original_date: article.date,
              parsed_successfully: parsedDate !== null
            }
          }
        };
      });

      // Try to insert articles individually to handle duplicates gracefully
      for (const article of articlesToInsert) {
        try {
          const { data: insertResult, error: singleInsertError } = await supabase
            .from('articles')
            .insert([article])
            .select();

          if (singleInsertError) {
            // Check if this is a duplicate prevention (expected behavior)
            if (singleInsertError.message && singleInsertError.message.includes('DUPLICATE_ARTICLE_PREVENTED')) {
              duplicateCount++;
              console.log(`📊 [database-insert] ERROR: DUPLICATE_ARTICLE_PREVENTED: ${singleInsertError.message.split(': ')[1] || 'unknown'}`);
            } else {
              // This is an actual database error
              actualErrors.push({
                article: article.title,
                error: singleInsertError.message
              });
            }
          } else {
            insertedCount++;
            successfullyInserted.push(insertResult[0]);
          }
        } catch (error) {
          actualErrors.push({
            article: article.title,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // If there are actual database errors (not duplicates), return error
      if (actualErrors.length > 0) {
        await logProgress(supabase, 'database-insert', 'error', { 
          actualErrors,
          insertedCount,
          duplicateCount 
        });
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Database insert failed for ${actualErrors.length} articles`,
            insertedCount,
            duplicateCount,
            errors: actualErrors,
            articles,
            cost,
            screenshotUrl: screenshotResult.screenshotUrl
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logProgress(supabase, 'database-insert', 'success', { 
        insertedCount,
        duplicateCount,
        totalProcessed: articlesToInsert.length
      });
    }

    await logProgress(supabase, 'function-complete', 'success', {
      articlesExtracted: articles?.length || 0,
      articlesInserted: insertedCount || 0,
      duplicatesFound: duplicateCount || 0,
      cost: cost || 0
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        articles: articles || [],
        articlesFound: articles?.length || 0,
        articlesInserted: insertedCount || 0,
        duplicatesFound: duplicateCount || 0,
        cost,
        screenshotUrl: screenshotResult.screenshotUrl,
        message: duplicateCount > 0 ? 
          `Successfully extracted ${articles?.length || 0} articles. ${insertedCount || 0} new articles added, ${duplicateCount} duplicates prevented.` :
          `Successfully extracted and stored ${articles?.length || 0} articles.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Critical function error:', error);
    console.error('💥 Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    
    // Always log critical errors
    try {
      await logProgress(supabase, 'critical-error', 'error', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString()
      });
    } catch (logError) {
      console.error('💥 Failed to log critical error:', logError);
    }
    
    // Always return a proper response, never let the function crash
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Critical error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        debug: 'Check system_logs table for detailed error information'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

export async function takeScreenshot(url: string, supabase?: any): Promise<{
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
      width: '1280',
      height: '1024',      // Taller for articles
      output: 'json',     
      file_type: 'png',
      wait_for_event: 'load',
      full_page: 'true',   // Full page screenshot for complete content
      delay: '2000',       // Wait for content to load
      fresh: 'true',
      block_ads: 'true',
      block_cookie_banners: 'true'
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
      throw new Error(`Invalid JSON response from ScreenshotAPI: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
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
      message: error instanceof Error ? error.message : String(error),
      type: error instanceof Error ? error.name : 'unknown'
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
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
          throw new Error(`Failed to parse extracted JSON: ${secondParseError instanceof Error ? secondParseError.message : String(secondParseError)}`);
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
    
    // Calculate cost estimation using correct OpenAI vision pricing
    // GPT-4o-mini vision: $0.00015 per 1K tokens for input, $0.0006 per 1K tokens for output
    const base64Length = screenshotBase64.length;
    const estimatedImageBytes = (base64Length * 3) / 4; // Convert base64 to actual bytes
    const visionTokens = Math.max(85, Math.ceil(estimatedImageBytes / 750)); // More accurate token estimation
    const textTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(extractedContent.length / 4);
    
    const inputCost = ((visionTokens + textTokens) / 1000) * 0.00015;
    const outputCost = (outputTokens / 1000) * 0.0006;
    const estimatedCost = inputCost + outputCost;
    
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
    
    if (supabase) await logProgress(supabase, 'content-extraction-error', 'error', {
      message: error instanceof Error ? error.message : String(error),
      type: error instanceof Error ? error.name : 'unknown'
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isIndexPage(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    
    // Common index page patterns
    const indexPatterns = [
      /\/blog\/?$/,
      /\/news\/?$/,
      /\/articles?\/?$/,
      /\/posts?\/?$/,
      /\/category\//,
      /\/tag\//,
      /\/archive\//,
      /\/page\/\d+/,
      /\/$/, // Root paths
      /\/index\.(html?|php)$/,
    ];
    
    return indexPatterns.some(pattern => pattern.test(pathname));
  } catch {
    return false;
  }
}
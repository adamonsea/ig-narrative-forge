import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import shared utilities
import { extractContentFromHTML, fetchWithRetry } from '../_shared/content-processor.ts';
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
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const dbOps = new DatabaseOperations(supabase);
    const { articleId, articleUrl, forceRefresh = false } = await req.json();

    if (!articleId && !articleUrl) {
      throw new Error('Article ID or URL is required');
    }

    console.log('Content extraction request:', { articleId, articleUrl, forceRefresh });

    // If we have articleId, get the URL from the database
    let targetUrl = articleUrl;
    let articleRecord = null;

    if (articleId) {
      const { data, error } = await supabase
        .from('articles')
        .select('id, source_url, body, word_count, last_extraction_attempt, extraction_attempts')
        .eq('id', articleId)
        .single();

      if (error) {
        throw new Error(`Article not found: ${error.message}`);
      }

      articleRecord = data;
      targetUrl = data.source_url;

      // Check if we should extract (empty body, low word count, or force refresh)
      const shouldExtract = forceRefresh || 
                           !data.body || 
                           data.body.trim().length < 100 || 
                           (data.word_count && data.word_count < 50);

      if (!shouldExtract) {
        return new Response(JSON.stringify({
          success: true,
          message: 'Article already has content',
          articleId: data.id,
          wordCount: data.word_count,
          extracted: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update extraction attempt counter
      await supabase
        .from('articles')
        .update({
          extraction_attempts: (data.extraction_attempts || 0) + 1,
          last_extraction_attempt: new Date().toISOString()
        })
        .eq('id', articleId);
    }

    console.log('Extracting content from URL:', targetUrl);

    // Extract content using shared utilities
    let extractedContent = null;
    let extractionMethod = 'direct';
    let error_message = null;

    try {
      console.log('Attempting direct content extraction...');
      const html = await fetchWithRetry(targetUrl);
      extractedContent = extractContentFromHTML(html, targetUrl);
      
      if (extractedContent && extractedContent.word_count >= 50) {
        console.log(`✅ Content extracted successfully: ${extractedContent.word_count} words`);
      } else {
        throw new Error('Insufficient content extracted');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Direct extraction failed: ${errorMessage}`);
      error_message = errorMessage;
      
      // Try AI enhancement if OpenAI API key is available
      if (openAIApiKey && articleRecord) {
        try {
          console.log('Attempting AI-enhanced extraction...');
          extractedContent = await enhanceContentWithAI(targetUrl, openAIApiKey);
          extractionMethod = 'ai_enhanced';
          
          if (extractedContent && extractedContent.word_count >= 50) {
            console.log(`✅ AI enhancement successful: ${extractedContent.word_count} words`);
            error_message = null;
          } else {
            throw new Error('AI enhancement produced insufficient content');
          }
        } catch (aiError) {
          const aiErrorMessage = aiError instanceof Error ? aiError.message : String(aiError);
          const originalErrorMessage = error instanceof Error ? error.message : String(error);
          console.log(`❌ AI enhancement failed: ${aiErrorMessage}`);
          error_message = `Direct: ${originalErrorMessage}, AI: ${aiErrorMessage}`;
        }
      }
    }

    // Update article record if we have one
    if (articleRecord && extractedContent && extractedContent.word_count >= 50) {
      const updateData = {
        title: extractedContent.title || articleRecord.title,
        body: extractedContent.body,
        author: extractedContent.author,
        published_at: extractedContent.published_at,
        word_count: extractedContent.word_count,
        content_quality_score: extractedContent.content_quality_score,
        processing_status: 'processed',
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('articles')
        .update(updateData)
        .eq('id', articleId);

      if (updateError) {
        console.error(`❌ Failed to update article: ${updateError.message}`);
      } else {
        console.log(`✅ Article updated successfully`);
      }

      // Log successful extraction
      await dbOps.logSystemEvent('info', 'Content extraction completed', {
        articleId,
        targetUrl,
        method: extractionMethod,
        wordCount: extractedContent.word_count,
        qualityScore: extractedContent.content_quality_score
      }, 'content-extractor');
    }

    // Return response
    const response = {
      success: extractedContent && extractedContent.word_count >= 50,
      articleId: articleRecord?.id,
      url: targetUrl,
      method: extractionMethod,
      wordCount: extractedContent?.word_count || 0,
      qualityScore: extractedContent?.content_quality_score || 0,
      title: extractedContent?.title || 'Untitled',
      extracted: extractedContent && extractedContent.word_count >= 50,
      error: error_message
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Content extractor error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      extracted: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// AI-enhanced content extraction using OpenAI with optimized prompting
async function enhanceContentWithAI(url: string, apiKey: string): Promise<any> {
  // Import optimized prompt builder
  const { OpenAIPromptBuilder } = await import('../_shared/prompt-optimization.ts');
  
  const promptData = new OpenAIPromptBuilder()
    .context(`Target URL: ${url}\nTask: Extract main article content from webpage`)
    .instructions([
      'Identify and extract the primary article content from the webpage',
      'Extract article title, complete body text, author, and publication date',
      'Focus on the main article content, excluding navigation and peripheral elements',
      'Preserve the original structure and formatting where relevant',
      'Ensure extracted content is complete and coherent'
    ])
    .constraints([
      'Extract complete article text, not summaries or excerpts',
      'Exclude advertisements, navigation menus, and sidebar content',
      'Maintain original tone, style, and factual accuracy',
      'Return only structured data in the specified format',
      'Skip content that appears to be boilerplate or template text'
    ])
    .outputFormat(
      {
        title: { type: 'string', description: 'Main article headline' },
        body: { type: 'string', description: 'Complete article content' },
        author: { type: 'string|null', description: 'Article author if available' },
        published_at: { type: 'string|null', description: 'Publication date in ISO format' },
        word_count: { type: 'number', description: 'Total word count of extracted content' }
      },
      'Return structured JSON object with extracted article data'
    )
    .buildWithSystem('You are a specialized content extraction assistant. Your role is to identify and extract clean, complete article content from web pages while filtering out non-article elements.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-2025-04-14', // Use newer model
      messages: [
        {
          role: 'system',
          content: promptData.system
        },
        {
          role: 'user',
          content: promptData.user
        }
      ],
      max_completion_tokens: 2000 // Use max_completion_tokens for newer models
      // Note: temperature not supported in newer models
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('OpenAI API Error:', errorData);
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
  }

  const result = await response.json();
  const content = result.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content returned from OpenAI');
  }

  try {
    // Try to parse structured JSON response
    const extractedData = JSON.parse(content);
    
    // Validate required fields and calculate metrics
    const wordCount = extractedData.body ? extractedData.body.split(/\s+/).length : 0;
    
    return {
      title: extractedData.title || 'AI Extracted Content',
      body: extractedData.body || content,
      author: extractedData.author || null,
      published_at: extractedData.published_at || new Date().toISOString(),
      word_count: extractedData.word_count || wordCount,
      content_quality_score: Math.min(wordCount * 1.5, 100)
    };
  } catch (parseError) {
    console.warn('Failed to parse structured response, using raw content:', parseError);
    
    // Fallback to raw content processing
    const wordCount = content.split(/\s+/).length;
    
    return {
      title: 'AI Extracted Content',
      body: content,
      author: null,
      published_at: new Date().toISOString(),
      word_count: wordCount,
      content_quality_score: Math.min(wordCount * 1.5, 100)
    };
  }
}
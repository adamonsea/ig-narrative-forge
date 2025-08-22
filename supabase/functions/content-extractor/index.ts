import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
      console.log(`❌ Direct extraction failed: ${error.message}`);
      error_message = error.message;
      
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
          console.log(`❌ AI enhancement failed: ${aiError.message}`);
          error_message = `Direct: ${error.message}, AI: ${aiError.message}`;
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
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      extracted: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// AI-enhanced content extraction using OpenAI
async function enhanceContentWithAI(url: string, apiKey: string): Promise<any> {
  const prompt = `Extract the main article content from this URL: ${url}
  
Please provide:
1. Title of the article
2. Main body content (full text, not summary)
3. Author if available
4. Publication date if available

Focus on extracting the complete article text, excluding navigation, ads, and sidebar content.`;

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
          content: 'You are a content extraction assistant. Extract clean, readable article content from web pages.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content returned from AI');
  }

  // Parse the AI response to extract structured data
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
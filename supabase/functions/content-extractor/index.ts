import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

    // Extract content using multiple strategies
    let extractedContent = null;
    let extractionMethod = '';
    let error_message = null;

    // Strategy 1: Try direct fetch and parse
    try {
      console.log('Attempting direct content extraction...');
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
      });

      if (response.ok) {
        const html = await response.text();
        extractedContent = extractContentFromHTML(html);
        extractionMethod = 'direct_fetch';
        console.log('Direct extraction successful, content length:', extractedContent.body.length);
      }
    } catch (error) {
      console.log('Direct extraction failed:', error.message);
    }

    // Strategy 2: Use OpenAI for enhanced extraction if available and direct method failed
    if (!extractedContent && openAIApiKey) {
      try {
        console.log('Attempting AI-enhanced extraction...');
        
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +http://example.com/bot)',
          },
        });

        if (response.ok) {
          const html = await response.text();
          const cleanText = extractContentFromHTML(html);
          
          // Use OpenAI to clean and enhance the extracted content
          const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a content extraction specialist. Clean up the provided article text, removing navigation, ads, and irrelevant content. Return only the main article content including title, author, and body. Preserve the original writing style and all factual information. Format as JSON with title, author, and body fields.'
                },
                {
                  role: 'user',
                  content: `Please extract and clean this article content:\n\n${cleanText.body.substring(0, 8000)}`
                }
              ],
              max_tokens: 4000,
              temperature: 0.1
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const aiContent = aiData.choices[0].message.content;
            
            try {
              const parsed = JSON.parse(aiContent);
              extractedContent = {
                title: parsed.title || cleanText.title,
                author: parsed.author || cleanText.author,
                body: parsed.body || cleanText.body,
                publishedAt: cleanText.publishedAt
              };
              extractionMethod = 'ai_enhanced';
              console.log('AI-enhanced extraction successful');
            } catch (parseError) {
              // If JSON parsing fails, use the AI response as body
              extractedContent = {
                ...cleanText,
                body: aiContent
              };
              extractionMethod = 'ai_enhanced_text';
            }
          }
        }
      } catch (error) {
        console.log('AI-enhanced extraction failed:', error.message);
      }
    }

    if (!extractedContent) {
      throw new Error('Failed to extract content using all available methods');
    }

    // Calculate word count
    const wordCount = extractedContent.body ? 
      extractedContent.body.trim().split(/\s+/).length : 0;

    // Update article in database if we have an articleId
    if (articleId) {
      const updateData: any = {
        body: extractedContent.body,
        word_count: wordCount,
        reading_time_minutes: Math.max(1, Math.round(wordCount / 200)),
        processing_status: wordCount > 50 ? 'processed' : 'discarded',
        updated_at: new Date().toISOString()
      };

      // Update title and author if they're better than what we have
      if (extractedContent.title && extractedContent.title.length > (articleRecord?.title?.length || 0)) {
        updateData.title = extractedContent.title;
      }
      if (extractedContent.author && !articleRecord?.author) {
        updateData.author = extractedContent.author;
      }

      const { error: updateError } = await supabase
        .from('articles')
        .update(updateData)
        .eq('id', articleId);

      if (updateError) {
        console.error('Failed to update article:', updateError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      articleId,
      extractionMethod,
      wordCount,
      title: extractedContent.title,
      author: extractedContent.author,
      bodyLength: extractedContent.body?.length || 0,
      extracted: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Content extraction error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function extractContentFromHTML(html: string) {
  // Remove scripts, styles, and other non-content elements
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Extract title
  const titleMatch = cleaned.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                    cleaned.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                    cleaned.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Extract author
  const authorMatch = cleaned.match(/class="[^"]*author[^"]*"[^>]*>([^<]+)</i) ||
                     cleaned.match(/by\s+([A-Za-z\s]+)/i);
  const author = authorMatch ? authorMatch[1].trim() : '';

  // Extract main content - Enhanced patterns for The Argus and other news sites
  const contentPatterns = [
    // The Argus specific patterns (exact selectors)
    /<div[^>]*class="article-body"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="entry-content"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="post-content"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="story-body"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="content-body"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
    /<div[^>]*id="post-\d+"[^>]*>([\s\S]*?)<\/div>/i,
    // Generic news patterns
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*class="[^"]*story[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  ];

  let bodyContent = '';
  for (const pattern of contentPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1].length > bodyContent.length) {
      bodyContent = match[1];
    }
  }

  // If no specific content found, extract all paragraph text
  if (!bodyContent || bodyContent.length < 200) {
    const paragraphs = cleaned.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    bodyContent = paragraphs.join('\n');
    
    // Additional fallback: look for divs with substantial text content
    if (!bodyContent || bodyContent.length < 100) {
      const textDivs = cleaned.match(/<div[^>]*>[^<]*[a-zA-Z]{50,}[^<]*<\/div>/gi) || [];
      if (textDivs.length > 0) {
        bodyContent = textDivs.join('\n');
      }
    }
  }

  // Clean up the body content
  bodyContent = bodyContent
    .replace(/<[^>]+>/g, ' ') // Remove HTML tags
    .replace(/&[a-zA-Z0-9]+;/g, ' ') // Remove HTML entities
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Extract publish date
  const dateMatch = cleaned.match(/datetime="([^"]+)"/i) ||
                   cleaned.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const publishedAt = dateMatch ? dateMatch[1] : null;

  return {
    title,
    author,
    body: bodyContent,
    publishedAt
  };
}
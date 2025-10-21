import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { UniversalContentExtractor } from '../_shared/universal-content-extractor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { minWordCount = 100, maxArticles = 50, topicId } = await req.json();

    console.log('🔄 Starting article re-extraction process...');

    // Find articles with low word count that might be snippets
    let query = supabase
      .from('topic_articles')
      .select(`
        id,
        shared_content_id,
        topic_id,
        shared_article_content!inner(
          id,
          url,
          title,
          body,
          word_count
        )
      `)
      .lt('shared_article_content.word_count', minWordCount)
      .limit(maxArticles);

    if (topicId) {
      query = query.eq('topic_id', topicId);
    }

    const { data: articles, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch articles: ${error.message}`);
    }

    console.log(`📄 Found ${articles?.length || 0} articles with low word count`);

    const results = {
      processed: 0,
      improved: 0,
      failed: 0,
      errors: [] as string[]
    };

    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    for (const article of articles) {
      try {
        results.processed++;
        const sharedContent = article.shared_article_content;
        const originalWordCount = sharedContent.word_count || 0;
        
        console.log(`🔍 Re-extracting: ${sharedContent.title} (${originalWordCount} words)`);

        // Re-extract content using the universal extractor
        const extractor = new UniversalContentExtractor(sharedContent.url);
        const articleHtml = await extractor.fetchWithRetry(sharedContent.url);
        const extractedContent = extractor.extractContentFromHTML(articleHtml, sharedContent.url);

        const newWordCount = extractedContent.word_count || 0;

        // Only update if we got significantly better content
        if (newWordCount > originalWordCount * 2 && newWordCount >= 150) {
          console.log(`✅ Improved content: ${originalWordCount} → ${newWordCount} words`);
          
          // Update the shared content
          const { error: updateError } = await supabase
            .from('shared_article_content')
            .update({
              title: extractedContent.title || sharedContent.title,
              body: extractedContent.body,
              author: extractedContent.author || sharedContent.author,
              published_at: extractedContent.published_at || sharedContent.published_at,
              word_count: newWordCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', sharedContent.id);

          if (updateError) {
            throw updateError;
          }

          // Update the topic article quality scores
          const qualityScore = Math.min(100, Math.max(0, 
            (newWordCount >= 300 ? 80 : newWordCount >= 200 ? 70 : newWordCount >= 150 ? 60 : 40)
          ));

          await supabase
            .from('topic_articles')
            .update({
              content_quality_score: qualityScore,
              processing_status: 'processed',
              updated_at: new Date().toISOString(),
              import_metadata: {
                ...article.import_metadata,
                re_extracted_at: new Date().toISOString(),
                original_word_count: originalWordCount,
                improved_word_count: newWordCount
              }
            })
            .eq('id', article.id);

          results.improved++;
        } else {
          console.log(`⚠️ No improvement: ${originalWordCount} → ${newWordCount} words`);
        }

      } catch (error) {
        console.error(`❌ Failed to re-extract article: ${error instanceof Error ? error.message : String(error)}`);
        results.failed++;
        results.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    console.log(`✅ Re-extraction complete: ${results.improved}/${results.processed} improved`);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Re-extraction failed:', error);
    return new Response(JSON.stringify({
      processed: 0,
      improved: 0,
      failed: 1,
      errors: [error instanceof Error ? error.message : String(error)]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
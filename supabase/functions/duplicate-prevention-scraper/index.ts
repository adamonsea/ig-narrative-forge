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
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { articles, topicId } = await req.json();

    console.log(`🛡️ Processing ${articles.length} articles with duplicate prevention for topic ${topicId}`);

    let insertedCount = 0;
    let duplicatesSkipped = 0;
    let errors = 0;

    for (const article of articles) {
      try {
        // Check for existing article with same normalized URL
        const { data: normalizeResult } = await supabase.rpc('normalize_url', { 
          input_url: article.source_url 
        });
        
        if (!normalizeResult) {
          console.log('⚠️ Could not normalize URL:', article.source_url);
          continue;
        }

        // Check for existing articles with same normalized URL within the same topic
        const { data: existingArticles } = await supabase
          .from('articles')
          .select('id, title, processing_status')
          .eq('source_url', article.source_url)
          .eq('topic_id', topicId)
          .not('processing_status', 'eq', 'discarded');

        if (existingArticles && existingArticles.length > 0) {
          console.log(`⚡ Skipping duplicate URL: ${article.source_url} (existing: ${existingArticles[0].id})`);
          duplicatesSkipped++;
          
          // Update the existing article's timestamp to mark as recently seen
          await supabase
            .from('articles')
            .update({ 
              updated_at: new Date().toISOString(),
              import_metadata: {
                duplicate_prevented: true,
                last_seen: new Date().toISOString(),
                scraper_version: 'duplicate-prevention-v1'
              }
            })
            .eq('id', existingArticles[0].id);
          
          continue;
        }

        // Insert the article (trigger will handle additional duplicate detection)
        const { error: insertError } = await supabase
          .from('articles')
          .insert({
            ...article,
            topic_id: topicId,
            processing_status: 'new',
            import_metadata: {
              ...article.import_metadata,
              scraper_version: 'duplicate-prevention-v1',
              duplicate_check_enabled: true
            }
          });

        if (insertError) {
          // Check if it's a duplicate prevention error
          if (insertError.message.includes('DUPLICATE_ARTICLE_PREVENTED')) {
            console.log(`⚡ Duplicate prevented by trigger: ${article.title}`);
            duplicatesSkipped++;
          } else {
            console.error('Error inserting article:', insertError);
            errors++;
          }
        } else {
          insertedCount++;
          console.log(`✅ Inserted: ${article.title}`);
        }
      } catch (error: any) {
        if (error.message.includes('DUPLICATE_ARTICLE_PREVENTED')) {
          console.log(`⚡ Duplicate prevented: ${article.title}`);
          duplicatesSkipped++;
        } else {
          console.error('Error processing article:', error);
          errors++;
        }
      }
    }

    const result = {
      success: true,
      total_processed: articles.length,
      inserted: insertedCount,
      duplicates_skipped: duplicatesSkipped,
      errors: errors,
      message: `Processed ${articles.length} articles: ${insertedCount} inserted, ${duplicatesSkipped} duplicates skipped, ${errors} errors`
    };

    console.log('🎯 Scraping results:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in duplicate-prevention-scraper:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
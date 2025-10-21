import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
    
    const { topicId, competingRegion } = await req.json();

    console.log('🧹 Starting cleanup of misplaced articles...', { topicId, competingRegion });

    // Find articles that mention the competing region in title or body
    const { data: misplacedArticles, error: fetchError } = await supabase
      .from('articles')
      .select('id, title, body, regional_relevance_score')
      .eq('topic_id', topicId)
      .or(`title.ilike.%${competingRegion}%, body.ilike.%${competingRegion}%`);

    if (fetchError) {
      throw new Error(`Failed to fetch misplaced articles: ${fetchError.message}`);
    }

    console.log(`Found ${misplacedArticles?.length || 0} potentially misplaced articles`);

    if (!misplacedArticles?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No misplaced articles found',
          cleaned: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark articles as discarded if they primarily mention the competing region
    const articlesToDiscard = misplacedArticles.filter(article => {
      const text = `${article.title} ${article.body || ''}`.toLowerCase();
      const competingMentions = (text.match(new RegExp(`\\b${competingRegion.toLowerCase()}\\b`, 'gi')) || []).length;
      
      // Discard if competing region is mentioned multiple times or in title
      return competingMentions >= 2 || article.title.toLowerCase().includes(competingRegion.toLowerCase());
    });

    let cleanedCount = 0;

    if (articlesToDiscard.length > 0) {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          processing_status: 'discarded',
          import_metadata: {
            discarded_reason: `Misplaced article - primarily about ${competingRegion}`,
            cleaned_at: new Date().toISOString(),
            cleanup_function: 'cleanup-misplaced-articles'
          }
        })
        .in('id', articlesToDiscard.map(a => a.id));

      if (updateError) {
        throw new Error(`Failed to update articles: ${updateError.message}`);
      }

      cleanedCount = articlesToDiscard.length;
    }

    console.log(`✅ Cleanup completed. Discarded ${cleanedCount} misplaced articles.`);

    return new Response(
      JSON.stringify({
        success: true,
        cleaned: cleanedCount,
        total_found: misplacedArticles.length,
        message: `Successfully cleaned up ${cleanedCount} misplaced articles mentioning ${competingRegion}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in cleanup-misplaced-articles function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});